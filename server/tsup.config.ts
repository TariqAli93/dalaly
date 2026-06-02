import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  bundle: true,
  splitting: false,
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
  },
  noExternal: [/^(@fastify\/cors|fastify|pg|drizzle-orm|zod|dotenv|adm-zip)(\/.*)?$/],
  external: ["pg-native"]
});
