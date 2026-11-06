/* global document, location -- page.evaluate callbacks run in the renderer */
// Application discovery. Sections come from the app's own navigation
// definition (NAV_SECTIONS, read with the TypeScript parser — never copied
// here), routes and their permissions from the running Vue router, and each
// page's controls from its accessibility tree at runtime. Nothing is assumed
// to exist because documentation mentions it.
import fs from "node:fs";
import path from "node:path";
import { RENDERER_DIR, requireRenderer, sha256 } from "./util.mjs";
import { settle } from "./executor.mjs";

const ts = requireRenderer("typescript");
const DOMAIN = path.join(RENDERER_DIR, "src", "constants", "domain.ts");
const PERMISSIONS = path.join(RENDERER_DIR, "src", "constants", "permissions.ts");

/** Exported string-array constants (e.g. ACCOUNTING_PERMISSIONS) of a module, for resolving identifiers. */
function stringArrays(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found = {};
  source.forEachChild(function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) init = init.expression;
      if (ts.isArrayLiteralExpression(init) && init.elements.every(ts.isStringLiteral)) found[node.name.text] = init.elements.map((element) => element.text);
    }
    node.forEachChild(visit);
  });
  return found;
}

function literal(node, constants) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literal(element, constants));
  if (ts.isIdentifier(node)) return constants[node.text] ?? { unresolved: node.text };
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) value[property.name.getText()] = literal(property.initializer, constants);
    }
    return value;
  }
  return { unresolved: node.getText() };
}

/** NAV_SECTIONS as data, straight from apps/renderer/src/constants/domain.ts. */
export function readNavigation() {
  const constants = { ...stringArrays(PERMISSIONS), ...stringArrays(DOMAIN) };
  const source = ts.createSourceFile(DOMAIN, fs.readFileSync(DOMAIN, "utf8"), ts.ScriptTarget.Latest, true);
  let sections = null;
  source.forEachChild(function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === "NAV_SECTIONS") sections = literal(node.initializer, constants);
    node.forEachChild(visit);
  });
  if (!Array.isArray(sections)) throw new Error("NAV_SECTIONS not found in apps/renderer/src/constants/domain.ts");
  const items = [];
  sections.forEach((section, sectionIndex) => {
    for (const item of section.items) {
      items.push({ title: item.title, to: item.to, permission: item.permission ?? null, group: section.title, sectionIndex, parent: null });
      for (const child of item.children ?? []) items.push({ title: child.title, to: child.to, permission: child.permission ?? null, group: section.title, sectionIndex, parent: item.to });
    }
  });
  return { sections, items, sourceHash: sha256(fs.readFileSync(DOMAIN)) };
}

/** Routes, their permissions and title keys from the running app's router. */
export async function readRoutes(page) {
  return page.evaluate(() => {
    const router = document.querySelector("#app")?.__vue_app__?.config.globalProperties.$router;
    if (!router) return null;
    return router.getRoutes().map((route) => ({ path: route.path, name: typeof route.name === "string" ? route.name : null, permission: route.meta?.permission ?? null, titleKey: route.meta?.titleKey ?? null, requiresAuth: Boolean(route.meta?.requiresAuth) }));
  });
}

const ROLE_LINE = /^(\s*)- (button|link|textbox|searchbox|combobox|tab|checkbox|switch|heading|table|row|listbox|radio|spinbutton|menuitem|cell|columnheader|dialog|navigation|main|list|listitem|img|group|region|generic|paragraph|text)(?: "((?:[^"\\]|\\.)*)")?(.*)$/;

/** Parses Playwright's ARIA snapshot into role/name entries. */
export function parseAria(snapshot) {
  const entries = [];
  for (const line of snapshot.split(/\r?\n/)) {
    const match = ROLE_LINE.exec(line);
    if (!match) continue;
    entries.push({ depth: match[1].length / 2, role: match[2], name: (match[3] ?? "").replace(/\\"/g, '"'), extra: match[4].trim() });
  }
  return entries;
}

const CREATE = /^(إضافة|إنشاء|جديد|عقد جديد|صفقة جديدة|سند|قيد جديد)/;

/** Observes one page: heading, actions, fields, tabs, rows and detail links. */
export async function inspectPage(page, to) {
  await page.evaluate((target) => (location.hash = `#${target}`), to);
  await page.waitForFunction((target) => location.hash.replace(/^#/, "").split("?")[0] === target, to, { timeout: 15_000 });
  await settle(page, 900);
  const main = page.locator("main").first();
  const snapshot = (await main.count()) ? await main.ariaSnapshot({ timeout: 10_000 }) : "";
  const topbar = await page.locator("header").first().ariaSnapshot({ timeout: 10_000 }).catch(() => "");
  const entries = parseAria(snapshot);
  const header = parseAria(topbar);
  const names = (role, list = entries) => [...new Set(list.filter((entry) => entry.role === role && entry.name).map((entry) => entry.name))];
  const heading = (await page.locator("#dal-page-title").textContent().catch(() => ""))?.trim() ?? "";
  // Record links in the page itself (not the navigation): /<area>/<id>.
  const detailLinks = await page.evaluate(() =>
    [...document.querySelectorAll("main a[href]")]
      .filter((anchor) => !anchor.closest("nav"))
      .map((anchor) => ({ href: anchor.getAttribute("href"), text: anchor.textContent.trim() }))
      .filter((link) => /^#\/[\w\-/]+\/\d+$/.test(link.href) && link.text)
      .slice(0, 5),
  );
  const buttons = [...new Set([...names("button", header), ...names("button")])];
  return {
    to,
    heading,
    url: page.url().slice(page.url().indexOf("#")),
    buttons,
    // The command bar's own «إضافة» menu is global, not this page's action.
    createActions: buttons.filter((name) => CREATE.test(name) && name !== "إضافة"),
    textboxes: [...names("textbox"), ...names("searchbox")],
    comboboxes: names("combobox"),
    tabs: names("tab"),
    checkboxes: names("checkbox"),
    rows: entries.filter((entry) => entry.role === "row").length,
    headings: names("heading"),
    regions: names("region"),
    detailLinks,
    ariaLines: snapshot.split(/\r?\n/).length,
    aria: snapshot.split(/\r?\n/).slice(0, 160).join("\n"),
  };
}

/** Full discovery: navigation + router + every reachable navigation page. */
export async function discover(page, { log }) {
  const navigation = readNavigation();
  const routes = (await readRoutes(page)) ?? [];
  const visibleLinks = await page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("link").evaluateAll((links) => links.map((link) => ({ text: link.textContent.trim(), href: link.getAttribute("href") })));
  const pages = [];
  for (const item of navigation.items) {
    const route = routes.find((candidate) => candidate.path === item.to || (item.to === "/" && candidate.path === "/"));
    try {
      const observed = await inspectPage(page, item.to);
      const reachable = observed.url.split("?")[0] === `#${item.to}`;
      pages.push({ ...item, route: route ?? null, reachable, inventory: observed });
      log.info("discovery.page", { message: `${item.title} ${item.to}: ${observed.buttons.length} buttons, ${observed.textboxes.length} fields, ${observed.rows} rows${reachable ? "" : " (redirected — no permission?)"}` });
    } catch (error) {
      pages.push({ ...item, route: route ?? null, reachable: false, error: error.message.split("\n")[0] });
      log.warn("discovery.page-failed", { message: `${item.to}: ${error.message.split("\n")[0]}` });
    }
  }
  const navPaths = new Set(navigation.items.map((item) => item.to));
  const outside = routes
    .filter((route) => route.requiresAuth && !navPaths.has(route.path) && !route.path.includes(":"))
    .map((route) => route.path);
  const details = routes.filter((route) => route.path.includes(":")).map((route) => route.path);
  await page.evaluate(() => (location.hash = "#/"));
  return {
    discoveredAt: new Date().toISOString(),
    navigationHash: navigation.sourceHash,
    sections: navigation.sections.map((section) => ({ title: section.title, items: section.items.map((item) => ({ title: item.title, to: item.to, children: (item.children ?? []).map((child) => child.to) })) })),
    pages,
    routes,
    visibleLinks,
    routesOutsideNavigation: outside,
    detailRoutes: details,
  };
}
