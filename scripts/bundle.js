import { cpSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "dist");

mkdirSync(outDir, { recursive: true });
cpSync(join(root, "packages/cli/dist/index.cjs"), join(outDir, "dotk"), {
  force: true,
});
chmodSync(join(outDir, "dotk"), 0o755);

// Copy web client assets (served by the bundled web server)
const clientSrc = join(root, "packages/web/dist/client");
if (existsSync(clientSrc)) {
  cpSync(clientSrc, join(outDir, "client"), { recursive: true, force: true });
  console.log("✓ Web client assets copied: dist/client/");
}

console.log("✓ Standalone binary built: dist/dotk");
