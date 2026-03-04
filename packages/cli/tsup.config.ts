import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/@dotk\/core/, /@dotk\/web/, "commander", "picocolors", "smol-toml", "hono", /@hono\/node-server/],
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.DOTK_VERSION": JSON.stringify(pkg.version),
  },
});
