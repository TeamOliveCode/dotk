import { Command } from "commander";
import pc from "picocolors";
import { pullVault, analyzePullChanges, formatChangeSummary } from "@dotk/core";
import { resolveVaultPath, ensureVault, success, info, fatal } from "../utils.js";

export const pullCommand = new Command("pull")
  .description("Pull latest vault changes from remote")
  .option("--vault <dir>", "Vault directory")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    try {
      const { prevHead, changed } = await pullVault(vaultPath);

      if (!changed) {
        success("Already up to date.");
        return;
      }

      // Analyze what changed
      const changes = await analyzePullChanges(vaultPath, prevHead);
      success("Pulled latest changes.");

      if (changes.length > 0) {
        const summary = formatChangeSummary(changes);
        console.log();
        console.log(pc.bold("Updated secrets:"));
        console.log(summary);
      }
    } catch (err: any) {
      fatal(`Pull failed: ${err.message}`);
    }
  });
