import { Command } from "commander";
import { resolveVaultPath, ensureVault, success, info } from "../utils.js";

export const uiCommand = new Command("ui")
  .description("Start the web UI for managing secrets")
  .option("--vault <dir>", "Vault directory")
  .option("-p, --port <number>", "Port number", "5555")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    const port = parseInt(opts.port, 10);
    info(`Starting dotk UI on http://127.0.0.1:${port}...`);

    // Dynamic import to avoid loading web deps unless needed
    const { startServer } = await import("@dotk/web");
    await startServer({ vaultPath, port });

    const open = (await import("open")).default;
    await open(`http://127.0.0.1:${port}`);
    success(`UI running at http://127.0.0.1:${port}`);
  });
