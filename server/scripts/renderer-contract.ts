/**
 * The renderer's view of the API, read from its own source: every
 * request<T>(path, init) / publicRequest<T> / setupRequest<T> call in
 * apps/renderer/src/services, with the HTTP method, the path pattern and T
 * turned into a shape the contract test checks real responses against.
 * The renderer types are written by hand, so this is what catches drift.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export type Shape =
  | { kind: "unknown" | "string" | "number" | "boolean" | "null" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "array"; element: Shape }
  | { kind: "object"; properties: Record<string, { optional: boolean; shape: Shape }>; index?: Shape }
  | { kind: "union"; options: Shape[] };

export type RendererEndpoint = {
  /** e.g. "GET /properties/:id/images" */
  route: string;
  method: string;
  path: string;
  /** T as written in the service, for messages. */
  typeText: string;
  shape: Shape;
  source: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rendererSrc = path.join(repoRoot, "apps/renderer/src");
const servicesDir = path.join(rendererSrc, "services");
const requestFunctions = new Set(["request", "publicRequest", "setupRequest"]);

function createProgram(extraFile?: { name: string; text: string }) {
  const files = ts.sys
    .readDirectory(servicesDir, [".ts"])
    .filter((file) => file.endsWith(".service.ts"));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  if (extraFile) {
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      path.resolve(fileName) === path.resolve(extraFile.name)
        ? ts.createSourceFile(fileName, extraFile.text, languageVersion, true)
        : getSourceFile(fileName, languageVersion, ...rest);
    const fileExists = host.fileExists;
    host.fileExists = (fileName) =>
      path.resolve(fileName) === path.resolve(extraFile.name) || fileExists(fileName);
    files.push(extraFile.name);
  }
  return ts.createProgram(files, options, host);
}

function shapeOf(checker: ts.TypeChecker, type: ts.Type, seen = new Set<ts.Type>()): Shape {
  const flags = type.flags;
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return { kind: "unknown" };
  if (flags & ts.TypeFlags.StringLiteral) return { kind: "literal", value: (type as ts.StringLiteralType).value };
  if (flags & ts.TypeFlags.NumberLiteral) return { kind: "literal", value: (type as ts.NumberLiteralType).value };
  if (flags & ts.TypeFlags.BooleanLiteral) return { kind: "literal", value: checker.typeToString(type) === "true" };
  if (flags & ts.TypeFlags.String) return { kind: "string" };
  if (flags & ts.TypeFlags.Number) return { kind: "number" };
  if (flags & ts.TypeFlags.Boolean) return { kind: "boolean" };
  if (flags & ts.TypeFlags.Null) return { kind: "null" };
  if (type.isUnion()) {
    const members = type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined));
    const options = members.map((member) => shapeOf(checker, member, seen));
    // TypeScript spells boolean as true | false.
    const literals = options.filter((option) => option.kind === "literal" && typeof option.value === "boolean");
    const rest = options.filter((option) => !literals.includes(option));
    const merged = literals.length === 2 ? [...rest, { kind: "boolean" } as Shape] : options;
    return merged.length === 1 ? merged[0] : { kind: "union", options: merged };
  }
  if (flags & ts.TypeFlags.Object || type.isIntersection()) {
    if (seen.has(type)) throw new Error(`recursive type ${checker.typeToString(type)}`);
    seen.add(type);
    try {
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const [element] = checker.getTypeArguments(type as ts.TypeReference);
        return { kind: "array", element: shapeOf(checker, element, seen) };
      }
      const properties: Record<string, { optional: boolean; shape: Shape }> = {};
      for (const property of checker.getPropertiesOfType(type)) {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        const propertyType = declaration
          ? checker.getTypeOfSymbolAtLocation(property, declaration)
          : checker.getTypeOfSymbol(property);
        properties[property.name] = {
          optional: Boolean(property.flags & ts.SymbolFlags.Optional),
          shape: shapeOf(checker, propertyType, seen),
        };
      }
      const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
      return index
        ? { kind: "object", properties, index: shapeOf(checker, index.type, seen) }
        : { kind: "object", properties };
    } finally {
      seen.delete(type);
    }
  }
  throw new Error(`unsupported type ${checker.typeToString(type)}`);
}

/** "/properties/${id}/images${query(filters)}?scope=${scope}" → "/properties/:id/images" */
function pathPattern(node: ts.Expression): string | null {
  let text: string;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
  else if (ts.isTemplateExpression(node)) {
    text = node.head.text;
    for (const span of node.templateSpans) {
      // A call builds the query string; anything else is a path segment.
      if (!ts.isCallExpression(span.expression)) text += `:${span.expression.getText().replace(/\W/g, "_")}`;
      text += span.literal.text;
    }
  } else return null;
  return text.split("?")[0];
}

function methodOf(call: ts.CallExpression, callee: string): string {
  if (callee === "setupRequest") return call.arguments.length > 1 ? "POST" : "GET";
  const init = call.arguments[1];
  if (init && ts.isObjectLiteralExpression(init))
    for (const property of init.properties)
      if (
        ts.isPropertyAssignment(property) &&
        property.name.getText() === "method" &&
        ts.isStringLiteralLike(property.initializer)
      )
        return property.initializer.text.toUpperCase();
  return "GET";
}

let cached: RendererEndpoint[] | undefined;

/** Every API call the renderer's services make, with the response type they declare. */
export function rendererEndpoints(): RendererEndpoint[] {
  if (cached) return cached;
  const program = createProgram();
  const checker = program.getTypeChecker();
  const endpoints: RendererEndpoint[] = [];
  for (const file of program.getSourceFiles()) {
    if (!file.fileName.includes("/services/") || !file.fileName.endsWith(".service.ts")) continue;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        requestFunctions.has(node.expression.text) &&
        node.typeArguments?.length === 1 &&
        node.arguments.length > 0
      ) {
        const pattern = pathPattern(node.arguments[0]);
        if (pattern) {
          const method = methodOf(node, node.expression.text);
          const typeNode = node.typeArguments[0];
          const { line } = file.getLineAndCharacterOfPosition(node.getStart());
          endpoints.push({
            route: `${method} ${pattern}`,
            method,
            path: pattern,
            typeText: typeNode.getText(),
            shape: shapeOf(checker, checker.getTypeFromTypeNode(typeNode)),
            source: `${path.relative(repoRoot, file.fileName).replaceAll("\\", "/")}:${line + 1}`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  cached = endpoints;
  return endpoints;
}

/** The shape of a type exported from apps/renderer/src/types, e.g. "ApiErrorBody". */
export function rendererTypeShape(typeExpression: string): Shape {
  const name = path.join(rendererSrc, "services", "__contract__.ts");
  const program = createProgram({
    name,
    text: `import type * as T from "../types";\nexport type Contract = ${typeExpression.replace(/\b([A-Z]\w*)/g, "T.$1")};\n`,
  });
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(name)!;
  const alias = file.statements.find(ts.isTypeAliasDeclaration)!;
  return shapeOf(checker, checker.getTypeFromTypeNode(alias.type));
}

/**
 * Where `value` differs from `shape`: missing or undeclared keys, wrong
 * types, values outside a literal union. Empty when it matches.
 */
export function mismatches(value: unknown, shape: Shape, at = "$"): string[] {
  const describe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  switch (shape.kind) {
    case "unknown":
      return [];
    case "string":
    case "number":
    case "boolean":
      return typeof value === shape.kind ? [] : [`${at}: expected ${shape.kind}, got ${describe(value)}`];
    case "null":
      return value === null ? [] : [`${at}: expected null, got ${describe(value)}`];
    case "literal":
      return value === shape.value ? [] : [`${at}: expected ${JSON.stringify(shape.value)}, got ${JSON.stringify(value)}`];
    case "array":
      if (!Array.isArray(value)) return [`${at}: expected array, got ${describe(value)}`];
      return value.flatMap((item, index) => mismatches(item, shape.element, `${at}[${index}]`));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return [`${at}: expected object, got ${describe(value)}`];
      const record = value as Record<string, unknown>;
      const problems: string[] = [];
      for (const [key, property] of Object.entries(shape.properties)) {
        if (!(key in record)) {
          if (!property.optional) problems.push(`${at}.${key}: missing`);
        } else problems.push(...mismatches(record[key], property.shape, `${at}.${key}`));
      }
      for (const key of Object.keys(record))
        if (!(key in shape.properties)) {
          if (shape.index) problems.push(...mismatches(record[key], shape.index, `${at}.${key}`));
          else problems.push(`${at}.${key}: not in the renderer type`);
        }
      return problems;
    }
    case "union": {
      let best: string[] | undefined;
      for (const option of shape.options) {
        const problems = mismatches(value, option, at);
        if (!problems.length) return [];
        if (!best || problems.length < best.length) best = problems;
      }
      return best ?? [`${at}: no union member matches`];
    }
  }
}
