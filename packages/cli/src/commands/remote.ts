import { Command } from "commander";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveVaultPath, ensureVault, success, fatal, info } from "../utils.js";

const exec = promisify(execFile);

export const remoteCommand = new Command("remote")
  .description("Manage the vault remote repository")
  .argument("[action]", "set, remove, or omit to show current remote")
  .argument("[url]", "Remote URL (for set)")
  .option("--vault <dir>", "Vault directory")
  .action(async (action?: string, url?: string, opts?: { vault?: string }) => {
    const vaultPath = resolveVaultPath(opts?.vault);
    ensureVault(vaultPath);

    // Show current remote
    if (!action) {
      try {
        const { stdout } = await exec("git", ["-C", vaultPath, "remote", "get-url", "origin"], { timeout: 3000 });
        info(`origin  ${stdout.trim()}`);
      } catch {
        info("No remote configured.");
      }
      return;
    }

    if (action === "set") {
      if (!url) {
        fatal("Usage: dotk remote set <url>");
      }

      try {
        await exec("git", ["-C", vaultPath, "remote", "add", "origin", url], { timeout: 3000 });
      } catch {
        await exec("git", ["-C", vaultPath, "remote", "set-url", "origin", url], { timeout: 3000 });
      }
      success(`Remote set to ${url}`);
      return;
    }

    if (action === "remove") {
      try {
        await exec("git", ["-C", vaultPath, "remote", "remove", "origin"], { timeout: 3000 });
        success("Remote removed.");
      } catch {
        fatal("No remote to remove.");
      }
      return;
    }

    fatal(`Unknown action: ${action}. Use "set", "remove", or omit for status.`);
  });
