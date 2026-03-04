import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/@dotk\/core/, "commander", "picocolors", "smol-toml"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
