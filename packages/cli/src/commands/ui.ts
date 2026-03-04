import { Command } from "commander";
import { execFile } from "node:child_process";
import { resolveVaultPath, success, info } from "../utils.js";

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  execFile(cmd, [url], { stdio: "ignore" });
}

export const uiCommand = new Command("ui")
  .description("Start the web UI for managing secrets")
  .option("--vault <dir>", "Vault directory")
  .option("-p, --port <number>", "Port number", "5555")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);

    const port = parseInt(opts.port, 10);
    info(`Starting dotk UI on http://127.0.0.1:${port}...`);

    // Dynamic import to avoid loading web deps unless needed
    const { startServer } = await import("@dotk/web");
    const { token } = await startServer({ vaultPath, port });

    const url = `http://127.0.0.1:${port}?token=${token}`;
    openBrowser(url);
    success(`UI running at ${url}`);
  });
