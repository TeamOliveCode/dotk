import { Command } from "commander";
import pc from "picocolors";
import { diffSummary } from "@dotk/core";
import { resolveVaultPath, ensureVault, info, fatal } from "../utils.js";

export const diffCommand = new Command("diff")
  .description("Show changed keys in the vault")
  .option("--vault <dir>", "Vault directory")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    try {
      const diff = await diffSummary(vaultPath);

      if (diff.files.length === 0) {
        info("No changes.");
        return;
      }

      for (const file of diff.files) {
        const status = file.insertions > 0 && file.deletions > 0
          ? pc.yellow("modified")
          : file.insertions > 0
          ? pc.green("added")
          : pc.red("deleted");
        console.log(`  ${status}  ${file.file}`);
      }
    } catch (err: any) {
      fatal(`Diff failed: ${err.message}`);
    }
  });
