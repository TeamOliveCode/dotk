import { Command } from "commander";
import pc from "picocolors";
import {
  analyzeChanges,
  stageAndCommit,
  pushToRemote,
  formatChangeSummary,
  readConfig,
  sendWebhook,
} from "@dotk/core";
import { resolveVaultPath, configPath, ensureVault, success, info, fatal } from "../utils.js";

export const pushCommand = new Command("push")
  .description("Commit and push vault changes to remote")
  .option("--vault <dir>", "Vault directory")
  .option("-m, --message <msg>", "Commit message", "dotk: update secrets")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    try {
      // Analyze changes before committing
      const changes = await analyzeChanges(vaultPath);

      if (changes.length === 0) {
        info("No secret changes to push.");
        return;
      }

      // Commit
      await stageAndCommit(vaultPath, opts.message);

      // Push
      try {
        await pushToRemote(vaultPath);
        success("Changes pushed to remote.");
      } catch (err: any) {
        info("Committed locally. Push to remote failed: " + err.message);
        info("You can push manually with: git push");
      }

      // Print shareable summary
      const summary = formatChangeSummary(changes);
      console.log();
      console.log(pc.bold("Share with your team:"));
      console.log(pc.cyan("  dotk:") + " secrets updated");
      console.log(summary);
      console.log(pc.dim('  → team members: run "dotk pull" to sync'));

      // Send webhook if configured
      try {
        const config = await readConfig(configPath(vaultPath));
        if (config.hooks?.post_push_url) {
          const ok = await sendWebhook(config.hooks.post_push_url, changes);
          if (ok) success("Webhook notification sent.");
          else info("Webhook notification failed (non-fatal).");
        }
      } catch {
        // Config read failure is non-fatal for webhook
      }
    } catch (err: any) {
      fatal(`Push failed: ${err.message}`);
    }
  });
