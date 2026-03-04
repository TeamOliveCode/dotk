import { defineConfig } from "tsup";

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
});
