/* global window, document, location -- page.evaluate callbacks run in the renderer */
// Universal UI execution engine. Lessons are declarative steps built from a
// fixed set of primitives; targets are accessible locators (role + name,
// label, placeholder, text). Every step runs under a timeout, can carry
// assertions, and is paced by its narration so the presenter never describes
// an action before it is on screen.
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { installOverlay } from "./overlay.mjs";
import { sleep } from "./util.mjs";
import { stepLevel } from "./validator.mjs";

export const ACTIONS = new Set(["title", "navigate", "click", "open", "fill", "select", "search", "upload", "highlight", "label", "scroll", "press", "back", "close", "wait", "verify", "capture", "pause"]);
// First bytes of the files an export may write.
const SIGNATURES = { xlsx: "PK", docx: "PK", zip: "PK", pdf: "%PDF" };
export const LEVELS = new Set(["required", "optional", "informational"]);
// Narration for these starts once the result is visible.
const SPEAK_AFTER = new Set(["navigate", "open", "back", "verify", "search"]);
const NAV = "التنقل الرئيسي";
// Failures worth one more try: the element re-rendered or moved under the pointer.
const TRANSIENT = /element is not attached|detached from the DOM|not stable|Execution context was destroyed|intercepts pointer events/;
// Buttons that write data: once one of them ran, repeating the lesson would duplicate records.
const COMMIT_BUTTONS = /^(حفظ|حفظ ومطابقة|حفظ المعلومات|إصدار|رفع وحفظ|نقل)$/;
const commits = (step) => Boolean(step.commits || step.expect?.api || step.expect?.exported || (step.action === "click" && typeof step.target?.name === "string" && COMMIT_BUTTONS.test(step.target.name)));

function pattern(value) {
  if (typeof value !== "string") return value;
  const match = /^\/(.+)\/([a-z]*)$/.exec(value);
  return match ? new RegExp(match[1], match[2]) : value;
}

/**
 * Builds a Playwright locator from a declarative target. Only visible
 * elements count (a person cannot use a hidden duplicate, e.g. a collapsed
 * mobile layout), so `nth` indexes what is on screen.
 */
export function locate(page, spec, { visibleOnly = true } = {}) {
  if (!spec || typeof spec !== "object") throw new Error(`Invalid target ${JSON.stringify(spec)}`);
  const scope = spec.within ? locate(page, spec.within).first() : page;
  let locator;
  if (spec.role) locator = scope.getByRole(spec.role, { ...(spec.name !== undefined ? { name: pattern(spec.name) } : {}), exact: spec.exact ?? false, ...(spec.level ? { level: spec.level } : {}) });
  else if (spec.label) locator = scope.getByLabel(pattern(spec.label), { exact: spec.exact ?? true });
  else if (spec.placeholder) locator = scope.getByPlaceholder(pattern(spec.placeholder), { exact: spec.exact ?? false });
  else if (spec.text) locator = scope.getByText(pattern(spec.text), { exact: spec.exact ?? false });
  else if (spec.testId) locator = scope.getByTestId(spec.testId);
  // Adapter escape hatch for structures without an accessible name; lessons using it are flagged in the plan.
  else if (spec.css) locator = scope.locator(spec.css);
  else throw new Error(`Target needs role, label, placeholder, text, testId or css: ${JSON.stringify(spec)}`);
  if (spec.hasText) locator = locator.filter({ hasText: pattern(spec.hasText) });
  if (visibleOnly) locator = locator.filter({ visible: true });
  if (spec.nth !== undefined) locator = locator.nth(spec.nth);
  return locator;
}

export function describeTarget(spec) {
  if (!spec) return "";
  const own = spec.role ? `${spec.role} "${spec.name ?? ""}"` : spec.label ? `label "${spec.label}"` : spec.placeholder ? `placeholder "${spec.placeholder}"` : spec.text ? `text "${spec.text}"` : spec.testId ? `testId ${spec.testId}` : `css ${spec.css}`;
  return `${spec.within ? `${describeTarget(spec.within)} › ` : ""}${own}${spec.nth !== undefined ? `[${spec.nth}]` : ""}`;
}

async function ensureOverlay(page) {
  await page.evaluate(installOverlay);
}

async function rectOf(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

/** Counts the page's API requests in flight (attached once per page). */
function trackNetwork(page) {
  if (page.__tutorialInflight) return page.__tutorialInflight;
  const inflight = { count: 0, last: Date.now() };
  const api = (request) => /\/api\//.test(request.url());
  page.on("request", (request) => {
    if (!api(request)) return;
    inflight.count += 1;
    inflight.last = Date.now();
  });
  const done = (request) => {
    if (!api(request)) return;
    inflight.count = Math.max(0, inflight.count - 1);
    inflight.last = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.__tutorialInflight = inflight;
  return inflight;
}

/**
 * Waits until the page is ready to be looked at: no API request in flight
 * for 250 ms (data loaded), no loader visible, then `ms` for paint and
 * transitions. Never throws — a page that keeps polling still settles.
 */
export async function settle(page, ms = 600) {
  const inflight = trackNetwork(page);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && (inflight.count > 0 || Date.now() - inflight.last < 250)) await sleep(50);
  await page
    .waitForFunction(() => !document.querySelector(".v-progress-linear--active, .v-skeleton-loader, #app .v-progress-circular--indeterminate"), null, { timeout: Math.max(1000, deadline - Date.now()) })
    .catch(() => undefined);
  await sleep(ms);
}

function hashPath(page) {
  const url = page.url();
  const index = url.indexOf("#");
  return index < 0 ? "/" : url.slice(index + 1) || "/";
}

/** Puts the app on the dashboard with no dialog or unsaved form in the way. */
export async function resetUi(page) {
  await ensureOverlay(page);
  await page.evaluate(() => window.__tutorial.clear());
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.evaluate(() => (location.hash = "#/"));
    const leave = page.getByRole("button", { name: "مغادرة دون حفظ" });
    if (await leave.isVisible().catch(() => false)) await leave.click();
    if (/^\/(\?.*)?$/.test(hashPath(page))) break;
    await sleep(300);
  }
  await page.waitForFunction(() => /^#\/(\?.*)?$/.test(location.hash) || location.hash === "", null, { timeout: 10_000 });
  await settle(page, 300);
}

async function moveTo(page, locator, pacing) {
  await locator.scrollIntoViewIfNeeded({ timeout: pacing.stepTimeoutMs });
  const rect = await rectOf(locator);
  await page.evaluate(({ x, y, ms }) => window.__tutorial.moveTo(x, y, ms), { x: rect.x + rect.width / 2, y: rect.y + Math.min(rect.height / 2, 24), ms: pacing.cursorMs });
  return rect;
}

/**
 * A click as a user makes it. Vuetify draws a field's visible layer over its
 * hidden <input role="combobox">, so Playwright's hit-target check refuses
 * the input itself. When the element under the click point belongs to the
 * same control (field, list item, button, link, tab), the click goes there —
 * where a person would click. Any other obstruction still fails the step.
 */
async function safeClick(locator, timeout, double = false) {
  const press = (options) => (double ? locator.dblclick(options) : locator.click(options));
  try {
    await press({ timeout: Math.min(timeout, 4000) });
    return;
  } catch (error) {
    if (!/intercepts pointer events|not stable|outside of the viewport/.test(error.message)) throw error;
  }
  await locator.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await sleep(250);
  const sameControl = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!top) return false;
    const control = element.closest(".v-field, .v-input, .v-list-item, .v-btn, a, button, [role=tab], [role=option]") ?? element;
    return control.contains(top) || top.contains(element);
  });
  if (sameControl) await press({ force: true, timeout });
  else await press({ timeout });
}

/** `double`: a double-click, as list rows open (a single click only selects them). */
async function pointAndClick(page, locator, pacing, double = false) {
  const rect = await moveTo(page, locator, pacing);
  await page.evaluate(() => window.__tutorial.press());
  if (double) setTimeout(() => page.evaluate(() => window.__tutorial.press()).catch(() => undefined), 140);
  await safeClick(locator, pacing.stepTimeoutMs, double);
  return rect;
}

async function runExpectations(context, step, rect = null) {
  const { page, api, pacing } = context;
  const checks = [];
  const spec = step.expect;
  if (!spec) return checks;
  const timeout = spec.timeoutMs ?? pacing.stepTimeoutMs;
  if (spec.url) {
    const regex = new RegExp(spec.url);
    await expect.poll(() => hashPath(page), { timeout }).toMatch(regex);
    checks.push({ check: "url", expected: spec.url, actual: hashPath(page), ok: true });
  }
  for (const target of [].concat(spec.visible ?? [])) {
    await locate(page, target).first().waitFor({ state: "visible", timeout });
    checks.push({ check: "visible", target: describeTarget(target), ok: true });
  }
  for (const target of [].concat(spec.hidden ?? [])) {
    await locate(page, target).first().waitFor({ state: "hidden", timeout });
    checks.push({ check: "hidden", target: describeTarget(target), ok: true });
  }
  if (spec.text) {
    const locator = spec.text.target ? locate(page, spec.text.target) : page.locator("#app");
    await expect(locator.first()).toContainText(pattern(spec.text.contains), { timeout });
    checks.push({ check: "text", contains: spec.text.contains, ok: true });
  }
  if (spec.count) {
    const locator = locate(page, spec.count.target);
    await expect.poll(() => locator.count(), { timeout }).toBeGreaterThanOrEqual(spec.count.min ?? 1);
    if (spec.count.max !== undefined) await expect.poll(() => locator.count(), { timeout }).toBeLessThanOrEqual(spec.count.max);
    checks.push({ check: "count", target: describeTarget(spec.count.target), count: await locator.count(), ok: true });
  }
  if (spec.api) {
    // Persistence through the real API, with the tutorial account's own token and permissions.
    // Saves finish asynchronously after the click; poll like the UI expectations.
    const needles = [].concat(spec.api.contains ?? []);
    let missing = needles;
    const deadline = Date.now() + timeout;
    while (missing.length) {
      const text = JSON.stringify(await api.get(spec.api.get));
      missing = needles.filter((needle) => !text.includes(needle));
      if (!missing.length) break;
      if (Date.now() > deadline) throw new Error(`API ${spec.api.get} has no "${missing.join('", "')}"`);
      await sleep(500);
    }
    checks.push({ check: "api", get: spec.api.get, contains: spec.api.contains, ok: true });
  }
  if (spec.exported) {
    // The app wrote a real file (save dialogs answer into the exports folder, see app.mjs).
    const extension = spec.exported.extension;
    const deadline = Date.now() + timeout;
    let found = null;
    while (!found) {
      found = fs.existsSync(context.exportsDir)
        ? fs.readdirSync(context.exportsDir).map((name) => ({ name, stat: fs.statSync(path.join(context.exportsDir, name)) })).find((file) => file.name.toLowerCase().endsWith(`.${extension}`) && file.stat.mtimeMs >= context.stepStarted - 1000 && file.stat.size > 0)
        : null;
      if (found) break;
      if (Date.now() > deadline) throw new Error(`no .${extension} file was exported`);
      await sleep(400);
    }
    const head = fs.readFileSync(path.join(context.exportsDir, found.name)).subarray(0, 4).toString("latin1");
    if (SIGNATURES[extension] && !head.startsWith(SIGNATURES[extension])) throw new Error(`${found.name} is not a ${extension} file`);
    // Under the control that exported, away from the subtitles at the bottom.
    // The file name is isolated as left-to-right text (LRI…PDI), or its dates and extension reorder in the RTL label.
    const fileName = `${String.fromCharCode(0x2066)}${found.name}${String.fromCharCode(0x2069)}`;
    await page.evaluate(({ text, at }) => window.__tutorial.label(text, at), { text: `${spec.exported.label ?? "انحفظ الملف"}: ${fileName}`, at: rect });
    checks.push({ check: "exported", file: found.name, bytes: found.stat.size, ok: true });
  }
  return checks;
}

async function perform(context, step) {
  const { page, pacing, diagnosticsDir, lesson } = context;
  const overlay = (method, ...args) => page.evaluate(({ method, args }) => window.__tutorial[method](...args), { method, args });
  switch (step.action) {
    case "title":
      await overlay("card", { kicker: step.kicker ?? "", title: step.title, subtitle: step.subtitle ?? "" });
      return;
    case "navigate": {
      const before = hashPath(page);
      const link = step.navTitle ? page.getByRole("navigation", { name: NAV }).getByRole("link", { name: step.navTitle, exact: true }) : null;
      if (link && (await link.count()) && (await link.first().isVisible())) await pointAndClick(page, link.first(), pacing);
      else {
        await overlay("label", step.label ?? "", null);
        await page.evaluate((to) => (location.hash = `#${to}`), step.to);
      }
      const target = new RegExp(`^${step.to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?.*)?$`);
      await expect.poll(() => hashPath(page), { timeout: pacing.stepTimeoutMs, message: `navigate ${before} → ${step.to}` }).toMatch(target);
      await settle(page, pacing.navigationSettleMs);
      return;
    }
    case "click":
    case "open": {
      const rect = await pointAndClick(page, locate(page, step.target), pacing, Boolean(step.double));
      if (step.label) await overlay("label", step.label, rect);
      await settle(page, step.action === "open" ? pacing.navigationSettleMs : 250);
      return rect;
    }
    case "fill":
    case "search": {
      const locator = locate(page, step.target);
      const rect = await pointAndClick(page, locator, pacing);
      if (step.label) await overlay("label", step.label, rect);
      await overlay("ring", rect);
      await locator.fill("");
      await locator.pressSequentially(String(step.value), { delay: pacing.typeDelayMs, timeout: pacing.stepTimeoutMs + String(step.value).length * pacing.typeDelayMs });
      if (step.action === "search") await settle(page, 900);
      return rect;
    }
    case "select": {
      const field = locate(page, step.target);
      const rect = await pointAndClick(page, field, pacing);
      if (step.label) await overlay("label", step.label, rect);
      // Autocompletes filter as you type: `query` is what a person would type before picking.
      if (step.query || step.type) await field.pressSequentially(String(step.query ?? step.value), { delay: pacing.typeDelayMs });
      const option = page.getByRole("option", { name: pattern(step.value), exact: typeof step.value === "string" }).filter({ visible: true }).first();
      await option.waitFor({ state: "visible", timeout: pacing.stepTimeoutMs });
      await sleep(250);
      await pointAndClick(page, option, pacing);
      await settle(page, 200);
      return rect;
    }
    case "upload": {
      // The field's own file input receives a studio-made specimen file (no native dialog).
      const field = locate(page, step.target).first();
      const rect = await moveTo(page, field, pacing);
      await page.evaluate(() => window.__tutorial.press());
      const input = (await field.evaluate((element) => element.matches("input[type=file]"))) ? field : field.locator("xpath=ancestor-or-self::*[.//input[@type='file']][1]//input[@type='file']").first();
      await input.setInputFiles(path.join(context.fixturesDir, step.value));
      await settle(page, 400);
      return rect;
    }
    case "highlight": {
      const locator = locate(page, step.target).first();
      await locator.waitFor({ state: "visible", timeout: pacing.stepTimeoutMs });
      const rect = await moveTo(page, locator, pacing);
      await overlay("ring", rect);
      if (step.label) await overlay("label", step.label, rect);
      return rect;
    }
    case "label":
      await overlay("label", step.label, null);
      return;
    case "scroll": {
      {
        if (step.target) {
          const locator = locate(page, step.target).first();
          await locator.waitFor({ state: "visible", timeout: pacing.stepTimeoutMs });
          await locator.evaluate((element) => element.scrollIntoView({ behavior: "smooth", block: "center" }));
        } else {
          const position = await overlay("position");
          await page.mouse.move(position.x, position.y);
          for (let index = 0; index < 8; index += 1) {
            await page.mouse.wheel(0, (step.by ?? 480) / 8);
            await sleep(45);
          }
        }
        await sleep(700);
      }
      return;
    }
    case "press":
      await page.keyboard.press(step.key);
      await settle(page, 250);
      return;
    case "back":
      await page.goBack();
      await settle(page, pacing.navigationSettleMs);
      return;
    case "close":
      if (step.target) await pointAndClick(page, locate(page, step.target), pacing);
      else await page.keyboard.press("Escape");
      await settle(page, 400);
      return;
    case "wait":
      await locate(page, step.target).first().waitFor({ state: step.state ?? "visible", timeout: step.timeoutMs ?? pacing.stepTimeoutMs });
      return;
    case "verify":
      if (step.target) {
        const locator = locate(page, step.target).first();
        await locator.waitFor({ state: "visible", timeout: pacing.stepTimeoutMs });
        const rect = await moveTo(page, locator, pacing);
        await overlay("ring", rect);
        return rect;
      }
      return;
    case "capture":
      await context.snapshot(path.join(diagnosticsDir, `${lesson.id}-${step.id}.png`));
      return;
    case "pause":
      return;
    default:
      throw new Error(`Unknown action ${step.action}`);
  }
}

/** One attempt of a step and its expectations, bounded by the step timeout. */
async function attempt(context, step, result) {
  const limit = step.timeoutMs ?? context.pacing.stepTimeoutMs * 2;
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const rect = (await perform(context, step)) ?? null;
        // The action happened: a save may have written data even if a later expectation fails.
        result.performed = true;
        return { rect, checks: await runExpectations(context, step, rect) };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Step timed out after ${limit} ms`)), limit);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one lesson. `narration` maps step id → { file, duration, text }.
 * Step levels: a required step that fails (after one retry when the failure
 * was transient) stops the lesson with a screenshot; an optional or
 * informational step that fails is skipped and says nothing, because its
 * narration would describe what did not happen. Returns the step results
 * and the narration timeline on the recording clock.
 */
export async function executeLesson({ page, lesson, narration, recorder, pacing, api, diagnosticsDir, exportsDir, fixturesDir, log, ensureLayout, snapshot }) {
  const clock = recorder ?? { now: (() => { const start = Date.now(); return () => (Date.now() - start) / 1000; })() };
  const context = { page, pacing, api, diagnosticsDir, exportsDir, fixturesDir, lesson, clock, stepStarted: Date.now(), snapshot: snapshot ?? ((file) => page.screenshot({ path: file, timeout: 5000 })) };
  const timeline = [];
  const steps = [];
  trackNetwork(page);
  await ensureOverlay(page);
  for (const step of lesson.steps) {
    const level = stepLevel(step);
    const clip = narration.get(step.id);
    const startedAt = clock.now();
    let speechStart = clip && !SPEAK_AFTER.has(step.action) && step.sayTiming !== "after" ? startedAt : null;
    const result = { id: step.id, action: step.action, level, target: describeTarget(step.target), workflow: step.workflow ?? null, started: startedAt, status: "ok", checks: [], attempts: 0 };
    // `when`: a step that undoes another (back, clear) runs only if that one happened.
    if (step.when && steps.find((done) => done.id === step.when)?.status !== "ok") {
      steps.push({ ...result, status: "skipped", reason: `${step.when} did not run`, finished: startedAt });
      continue;
    }
    // Optional and informational steps depend on UI that may be absent; do not wait long for it.
    const scoped = level === "required" ? context : { ...context, pacing: { ...pacing, stepTimeoutMs: Math.min(pacing.stepTimeoutMs, 5000) } };
    for (;;) {
      result.attempts += 1;
      context.stepStarted = scoped.stepStarted = Date.now();
      try {
        // Layout drift (a reset zoom) would move every target; repair it before acting.
        if (ensureLayout && !(await ensureLayout())) log.warn("layout.repaired", { lesson: lesson.id, step: step.id, message: "page zoom had reset; restored" });
        await ensureOverlay(page);
        Object.assign(result, await attempt(scoped, step, result));
        delete result.error;
        break;
      } catch (error) {
        result.error = error.message.split("\n").slice(0, 6).join("\n");
        if (result.attempts < 2 && TRANSIENT.test(error.message)) {
          log.warn("step.retry", { lesson: lesson.id, step: step.id, message: `transient: ${result.error.split("\n")[0]}` });
          await settle(page, 400);
          continue;
        }
        result.status = level === "required" ? "failed" : "skipped";
        break;
      }
    }
    if (result.status !== "ok") {
      log.warn(level === "required" ? "step.failed" : "step.skipped", { lesson: lesson.id, step: step.id, message: `${level} ${step.action} ${result.target}: ${result.error.split("\n")[0]}` });
      fs.mkdirSync(diagnosticsDir, { recursive: true });
      result.screenshot = path.join(diagnosticsDir, `${lesson.id}-${step.id}-${level === "required" ? "failure" : "skipped"}.png`);
      await context.snapshot(result.screenshot).catch(() => (result.screenshot = null));
      if (level === "required") {
        if (result.performed && commits(step)) result.committed = true;
        result.finished = clock.now();
        steps.push(result);
        return { status: "failed", steps, timeline, error: `${step.id}: ${result.error}` };
      }
      speechStart = null;
    }
    if (result.performed && commits(step)) result.committed = true;
    if (clip && result.status === "ok") {
      if (speechStart === null) speechStart = clock.now();
      timeline.push({ step: step.id, start: speechStart, duration: clip.duration, file: clip.file, text: clip.text });
    }
    const speechEnd = clip && result.status === "ok" ? speechStart + clip.duration + pacing.afterSpeechMs / 1000 : 0;
    const minimum = step.action === "title" ? pacing.titleCardMs / 1000 : 0;
    const until = Math.max(clock.now() + pacing.afterStepMs / 1000, speechEnd, startedAt + minimum + (step.holdMs ?? 0) / 1000);
    await sleep(Math.max(0, (until - clock.now()) * 1000));
    if (step.action === "title") await page.evaluate(() => window.__tutorial.card(null));
    if (!step.keep) await page.evaluate(() => window.__tutorial.clear()).catch(() => undefined);
    result.finished = clock.now();
    steps.push(result);
  }
  return { status: "ok", steps, timeline };
}
