// Lesson planner. Turns discovery into validated, declarative lessons:
//  • a section with an authored lesson in lessons.json keeps its workflow
//    (checked against what the page actually shows);
//  • any other navigation page gets a generic, read-only tour built from its
//    observed controls (search with a term the page itself shows, open the
//    first record, switch tabs), so a new page needs no new script.
// Narration comes from lessons.json, or a template for an unknown page. With
// ANTHROPIC_API_KEY set, Claude rewrites each lesson's narration from the
// verified steps and the page's accessibility tree; its output is schema-
// checked and falls back to the authored text whenever it is not usable.
import fs from "node:fs";
import path from "node:path";
import { ACTIONS, LEVELS } from "./executor.mjs";
import { checkShape, secret, sha256, writeJson } from "./util.mjs";

const TARGET_KEYS = new Set(["role", "name", "exact", "level", "label", "placeholder", "text", "testId", "css", "within", "nth", "hasText"]);
const STEP_KEYS = new Set(["id", "action", "target", "value", "to", "navTitle", "say", "sayTiming", "label", "kicker", "title", "subtitle", "expect", "optional", "level", "holdMs", "timeoutMs", "keep", "zoom", "type", "key", "by", "state", "workflow", "when", "query", "commits", "double"]);
const REQUIRES = { navigate: ["to"], click: ["target"], open: ["target"], fill: ["target", "value"], search: ["target", "value"], select: ["target", "value"], upload: ["target", "value"], highlight: ["target"], wait: ["target"], press: ["key"], title: ["title"], label: ["label"] };
// Narration must stay factual: no invented savings, profits or percentages.
const UNSUPPORTED_CLAIM = /(\d+\s*[%٪])|(بنسبة)|(أرباح|ارباح)|(يضاعف)|(يوفر\s+\d)|(ساعات?\s+من\s+الوقت)|(الأفضل\s+في\s+العراق)/;
const ARABIC = /[؀-ۿ]/;

/** A "/…/flags" string must compile, so a typo fails the plan instead of a recording. */
function checkPattern(value, where, problems) {
  const match = typeof value === "string" ? /^\/(.+)\/([a-z]*)$/.exec(value) : null;
  if (!match) return;
  try {
    new RegExp(match[1], match[2]);
  } catch (error) {
    problems.push(`${where}: invalid pattern ${value} (${error.message})`);
  }
}

function checkTarget(target, where, problems) {
  if (!target || typeof target !== "object") return problems.push(`${where}: target must be an object`);
  for (const key of Object.keys(target)) if (!TARGET_KEYS.has(key)) problems.push(`${where}: unknown target key "${key}"`);
  for (const key of ["name", "label", "placeholder", "text", "hasText"]) checkPattern(target[key], `${where}.${key}`, problems);
  if (!["role", "label", "placeholder", "text", "testId", "css"].some((key) => target[key] !== undefined)) problems.push(`${where}: target needs role, label, placeholder, text, testId or css`);
  if (target.within) checkTarget(target.within, `${where}.within`, problems);
}

/** Schema and scope checks for one lesson; returns problems (empty = valid). */
export function validateLesson(lesson) {
  const problems = checkShape(lesson, { id: "string", title: "string", section: "string", kind: "string", steps: [{ id: "string", action: "string" }] }, lesson.id ?? "lesson");
  if (!["workflow", "overview", "tour", "intro", "outro"].includes(lesson.kind)) problems.push(`${lesson.id}: kind must be workflow, overview, tour, intro or outro`);
  const ids = new Set();
  for (const [index, step] of (lesson.steps ?? []).entries()) {
    const where = `${lesson.id}.steps[${index}](${step.id})`;
    if (ids.has(step.id)) problems.push(`${where}: duplicate id`);
    ids.add(step.id);
    if (!ACTIONS.has(step.action)) problems.push(`${where}: action "${step.action}" is not a known primitive`);
    for (const key of Object.keys(step)) if (!STEP_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
    for (const key of REQUIRES[step.action] ?? []) if (step[key] === undefined) problems.push(`${where}: ${step.action} needs ${key}`);
    if (step.level !== undefined && !LEVELS.has(step.level)) problems.push(`${where}: level must be ${[...LEVELS].join(", ")}`);
    if (step.level === "required" && step.optional) problems.push(`${where}: a step cannot be both required and optional`);
    if (typeof step.value === "string" && /\{\{\w+\}\}/.test(step.value)) problems.push(`${where}: unresolved variable in "${step.value}"`);
    if (step.target) checkTarget(step.target, where, problems);
    checkPattern(step.value, `${where}.value`, problems);
    checkPattern(step.expect?.text?.contains, `${where}.expect.text`, problems);
    for (const target of [step.expect?.text?.target, step.expect?.count?.target, ...[].concat(step.expect?.visible ?? []), ...[].concat(step.expect?.hidden ?? [])]) if (target) checkTarget(target, `${where}.expect`, problems);
    if (step.to && !/^\/[\w\-/]*$/.test(step.to)) problems.push(`${where}: route "${step.to}" is not an app path`);
    if (step.say !== undefined) {
      if (typeof step.say !== "string" || !ARABIC.test(step.say)) problems.push(`${where}: narration must be Arabic text`);
      else if (UNSUPPORTED_CLAIM.test(step.say)) problems.push(`${where}: narration makes an unsupported claim: "${step.say}"`);
      else if (step.say.length > 420) problems.push(`${where}: narration longer than 420 characters`);
    }
  }
  return problems;
}

/** Warns when a lesson names a control the page was not seen to have. */
function scopeCheck(lesson, page) {
  if (!page?.inventory) return [];
  const seen = new Set([...page.inventory.buttons, ...page.inventory.textboxes, ...page.inventory.comboboxes, ...page.inventory.tabs]);
  const warnings = [];
  // Only the section page itself was observed: check steps between arriving
  // there and leaving it. Later screens are verified when the step runs.
  let onObservedPage = false;
  for (const step of lesson.steps) {
    if (step.action === "navigate") onObservedPage = step.to === page.to;
    else if (["click", "open", "back"].includes(step.action)) onObservedPage = false;
    const target = step.target;
    if (!onObservedPage || !target || target.within) continue;
    if (["button", "textbox", "searchbox", "combobox", "tab"].includes(target.role) && typeof target.name === "string" && !target.name.startsWith("/") && !seen.has(target.name)) {
      warnings.push(`${lesson.id}.${step.id}: ${target.role} "${target.name}" not seen on ${page.to}`);
    }
  }
  return warnings;
}

const CODE = /[A-Z]{1,3}-\d{3,6}/;

/** A generic read-only tour of a page, from what discovery observed on it. */
function tourLesson(page, about, number, total) {
  const inventory = page.inventory;
  const say = (key, fallback) => about?.[key] ?? fallback;
  const steps = [
    { id: "title", action: "title", kicker: `الدرس ${number} من ${total}`, title: page.title, subtitle: about?.tagline ?? "", say: say("intro", `بهذا الدرس نتعرف على قسم ${page.title} داخل دلالي.`) },
  ];
  if (page.parent) steps.push({ id: "parent", action: "navigate", to: page.parent, navTitle: page.parentTitle, workflow: "navigate" });
  steps.push({ id: "open-section", action: "navigate", to: page.to, navTitle: page.title, workflow: "navigate", say: say("what", `هذي صفحة ${inventory.heading || page.title}، وبيها كل المعلومات الخاصة بهذا القسم مرتبة بمكان واحد.`) });
  // The list region's own accessible name, which can differ from the top-bar title.
  const regionName = inventory.regions?.[0] || inventory.heading || page.title;
  steps.push({ id: "region", action: "highlight", target: { role: "region", name: regionName, exact: true }, level: "informational", say: say("who", undefined) });
  if (!steps.at(-1).say) delete steps.at(-1).say;
  const create = inventory.createActions.find((name) => name !== "إضافة سجل جديد");
  if (create) steps.push({ id: "create", action: "highlight", target: { role: "button", name: create, exact: true, nth: 0 }, level: "informational", say: say("create", `ومن زر «${create}» نضيف سجل جديد لهذا القسم بخطوات بسيطة.`) });
  const searchBox = inventory.textboxes.find((name) => /^بحث/.test(name));
  const linkText = inventory.detailLinks[0]?.text ?? "";
  const term = about?.searchTerm ?? (CODE.exec(linkText)?.[0] || "");
  if (searchBox && term) {
    steps.push({ id: "search", action: "search", target: { role: "textbox", name: searchBox, exact: true }, value: term, workflow: "search", level: "optional", expect: { text: { target: { role: "region", name: regionName, exact: true }, contains: about?.searchExpect ?? term } }, say: say("search", `نجرب البحث: نكتب «${term}» والنتيجة تطلع مباشرة.`) });
    steps.push({ id: "search-clear", action: "fill", target: { role: "textbox", name: searchBox, exact: true }, value: "", level: "optional" });
  }
  inventory.tabs.slice(1, 3).forEach((tab, index) => {
    steps.push({ id: `tab-${index + 1}`, action: "click", target: { role: "tab", name: tab, exact: true }, workflow: "tabs", level: "optional", expect: { visible: { role: "tab", name: tab, exact: true } }, ...(index === 0 ? { say: say("tabs", `ونبدل بين التبويبات حتى نشوف «${tab}» وباقي التفاصيل.`) } : {}) });
  });
  if (inventory.detailLinks[0]) {
    const link = inventory.detailLinks[0];
    steps.push({ id: "open-record", action: "open", target: { role: "link", name: link.text, exact: true, nth: 0 }, workflow: "open-record", level: "optional", expect: { url: `^${link.href.slice(1).replace(/\/\d+$/, "")}/\\d+$` }, say: say("open", "ومن نفتح السجل تطلع صفحته الكاملة بكل التفاصيل.") });
    steps.push({ id: "record-back", action: "back", level: "optional", when: "open-record" });
  }
  steps.push({ id: "value", action: "pause", say: say("value", `بهذا الشكل يبقى قسم ${page.title} منظم وواضح لكل فريق المكتب.`) });
  return { id: `tour-${page.to.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`, title: page.title, section: page.to, kind: "tour", permission: page.permission, steps };
}

/** dd/mm/yyyy, the format the app's date fields accept, `days` from today. */
function day(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** Values a lesson may use as {{name}}: the account, and dates relative to the run. */
function lessonVariables(account) {
  return { username: account.username, pin: account.pin, displayName: account.displayName, today: day(0), in2days: day(2), in7days: day(7), in30days: day(30), in1year: day(372) };
}

function substitute(value, variables) {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  if (Array.isArray(value)) return value.map((item) => substitute(item, variables));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, substitute(inner, variables)]));
  return value;
}

/** The opening lesson (login), planned before discovery because it needs none. */
export function introLesson(script, account) {
  const lesson = { ...substitute(script.intro, lessonVariables(account)), kind: "intro" };
  return { lesson, problems: validateLesson(lesson) };
}

/**
 * Builds the course plan after the intro. Returns { lessons, warnings, problems, unreachable }.
 * `only` limits the course to lesson ids (plus nothing else) for focused runs.
 */
export function buildPlan({ discovery, script, account, only }) {
  const pages = discovery.pages.filter((page) => page.reachable);
  const byPath = new Map(discovery.pages.map((page) => [page.to, page]));
  const variables = lessonVariables(account);
  const planned = [];
  const authoredBySection = new Map(script.lessons.filter((lesson) => lesson.section).map((lesson) => [lesson.section, lesson]));
  const sectionLessons = pages.filter((page) => page.to !== "/" || authoredBySection.has("/"));
  const total = sectionLessons.length;
  let number = 0;
  for (const page of sectionLessons) {
    number += 1;
    const parent = page.parent ? byPath.get(page.parent) : null;
    const authored = authoredBySection.get(page.to);
    if (authored) {
      const lesson = substitute(structuredClone(authored), { ...variables, number: String(number), total: String(total) });
      planned.push({ ...lesson, kind: lesson.kind ?? "workflow", permission: page.permission });
    } else {
      planned.push(tourLesson({ ...page, parentTitle: parent?.title }, script.sections[page.to], number, total));
    }
  }
  if (script.outro) planned.push({ ...substitute(script.outro, variables), kind: "outro" });
  planned.forEach((lesson, index) => (lesson.order = index + 1));

  const problems = [];
  const warnings = [];
  for (const lesson of planned) {
    problems.push(...validateLesson(lesson));
    warnings.push(...scopeCheck(lesson, byPath.get(lesson.section)));
  }
  const lessons = only?.length ? planned.filter((lesson) => only.includes(lesson.id)) : planned;
  const unreachable = discovery.pages.filter((page) => !page.reachable).map((page) => ({ section: page.to, title: page.title, reason: page.error ?? "redirected (no permission for the tutorial account)" }));
  return { lessons, warnings, problems, unreachable };
}

// ---------------- AI narration (optional) ----------------

const NARRATION_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, say: { type: "string" } },
        required: ["id", "say"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

const SYSTEM = `You write narration for screen-recorded video tutorials of "دلالي" (Dalaly), an Arabic desktop app for Iraqi real-estate brokerage offices.
Write in natural, professional Iraqi Arabic (e.g. هسه، راح، نكدر، شلون، حتى، من نحتاجه) as a friendly software instructor teaching office employees. Keep the product name exactly "دلالي". Use Iraqi real-estate terms (عرض بيع، عرض إيجار، طابو، دونم، عربون، دلالية/عمولة).
Rules:
- Narrate ONLY what the given steps show. Each line is spoken while or right after its step happens, so never describe a later step early.
- Use the exact on-screen names given in the steps (button names, field labels).
- Across the lesson cover: what the section does, who benefits, why it matters, how the workflow goes, how it organises work, how it saves manual effort, how it helps avoid missed opportunities, and the practical example shown.
- Never state numbers about time saved, profit, percentages or customer results. No marketing superlatives.
- One or two short spoken sentences per step (at most 40 words). Plain text: no markdown, no emoji, no Latin text except codes shown on screen.
Return JSON {"steps":[{"id","say"}]} with exactly one entry for each step id you are given, in the same order.`;

/** Rewrites narration with Claude when ANTHROPIC_API_KEY is available. */
export async function refineNarration({ plan, discovery, settings, cacheDir, log }) {
  const key = secret("ANTHROPIC_API_KEY");
  const wanted = settings.provider;
  if (wanted === "none" || (wanted === "auto" && !key)) {
    for (const lesson of plan.lessons) lesson.narrationSource = "authored";
    return { provider: "authored", reason: key ? "planner.provider is none" : "ANTHROPIC_API_KEY not set — authored and template narration used" };
  }
  if (!key) throw new Error("planner.provider is anthropic but ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, maxRetries: 3 });
  const byPath = new Map(discovery.pages.map((page) => [page.to, page]));
  let refined = 0;
  for (const lesson of plan.lessons) {
    const spoken = lesson.steps.filter((step) => step.say);
    if (!spoken.length) continue;
    const page = byPath.get(lesson.section);
    const input = {
      lesson: { id: lesson.id, title: lesson.title, kind: lesson.kind },
      page: page?.inventory ? { heading: page.inventory.heading, buttons: page.inventory.buttons, fields: page.inventory.textboxes, selects: page.inventory.comboboxes, tabs: page.inventory.tabs, accessibility_tree: page.inventory.aria } : null,
      steps: spoken.map((step) => ({ id: step.id, action: step.action, target: step.target ?? null, value: step.value ?? null, label: step.label ?? null, draft_narration: step.say })),
    };
    const cacheFile = path.join(cacheDir, `${sha256([settings.model, SYSTEM, JSON.stringify(input)].join("|")).slice(0, 24)}.json`);
    let result = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : null;
    if (!result) {
      try {
        const message = await client.beta.messages
          .stream({
            model: settings.model,
            max_tokens: settings.maxTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM,
            output_config: { effort: "medium", format: { type: "json_schema", schema: NARRATION_SCHEMA } },
            messages: [{ role: "user", content: `Lesson data (JSON):\n${JSON.stringify(input, null, 1)}` }],
          })
          .finalMessage();
        if (message.stop_reason === "refusal") throw new Error(`refused (${message.stop_details?.category ?? "no category"})`);
        if (message.stop_reason === "max_tokens") throw new Error("narration cut off at max_tokens");
        const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
        result = JSON.parse(text);
        writeJson(cacheFile, result);
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? ` (HTTP ${error.status})` : "";
        log.warn("planner.ai-failed", { lesson: lesson.id, message: `${error.message}${status}; authored narration kept` });
        lesson.narrationSource = "authored";
        continue;
      }
    }
    // Accept only a complete, valid rewrite; otherwise keep the authored lines.
    const proposed = new Map((result.steps ?? []).map((step) => [step.id, step.say?.trim()]));
    const candidate = { ...lesson, steps: lesson.steps.map((step) => (step.say ? { ...step, say: proposed.get(step.id) } : step)) };
    const missing = spoken.filter((step) => !proposed.get(step.id));
    const problems = missing.length ? [`missing ${missing.map((step) => step.id).join(", ")}`] : validateLesson(candidate);
    if (problems.length) {
      log.warn("planner.ai-rejected", { lesson: lesson.id, message: problems.slice(0, 3).join("; ") });
      lesson.narrationSource = "authored";
      continue;
    }
    lesson.steps = candidate.steps;
    lesson.narrationSource = `ai:${settings.model}`;
    refined += 1;
  }
  return { provider: "anthropic", model: settings.model, refined };
}
