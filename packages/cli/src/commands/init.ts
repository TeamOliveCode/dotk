import { Command } from "commander";
import { cloneVault, saveKeyPair, initVault } from "@dotk/core";
import { resolveVaultPath, success, fatal, info } from "../utils.js";

export const initCommand = new Command("init")
  .description("Initialize a new dotk vault")
  .option("--repo <url>", "Clone an existing vault repo (for joining a team)")
  .option("--remote <url>", "Create a new vault and connect to a remote repo")
  .option("--path <dir>", "Directory for the vault (default: cwd)")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.path);

    // Mode 1: Clone existing vault (팀원 합류)
    if (opts.repo) {
      info(`Cloning vault from ${opts.repo}...`);
      await cloneVault(opts.repo, vaultPath);

      // 합류한 팀원도 키페어 생성
      const keyPair = await saveKeyPair(vaultPath);
      info(`Your public key: ${keyPair.publicKey.slice(0, 16)}...`);
      info("Share this public key with your team admin to get access.");

      success(`Vault cloned to ${vaultPath}`);
      return;
    }

    // Mode 2 & 3: Create new vault
    try {
      const result = await initVault(vaultPath, opts.remote);
      info(`Public key: ${result.publicKey.slice(0, 16)}...`);
    } catch (err: any) {
      if (err.message.includes("already initialized")) {
        fatal(err.message);
      }
      // Remote push may fail — vault is still created locally
      if (opts.remote) {
        info(`Remote configured but push failed: ${err.message}`);
        info("You can push manually with: git push -u origin main");
      } else {
        throw err;
      }
    }

    if (opts.remote) {
      success("Initial commit pushed to remote.");
    }

    success("Vault initialized at " + vaultPath);

    // Guide next steps
    console.log();
    if (!opts.remote) {
      info("Next steps:");
      console.log("  1. Create a private repo on GitHub");
      console.log("  2. Connect it:");
      console.log(`     git -C ${vaultPath} remote add origin <repo-url>`);
      console.log(`     git -C ${vaultPath} add . && git -C ${vaultPath} commit -m "init" && git -C ${vaultPath} push -u origin main`);
      console.log("  Or re-run with --remote:");
      console.log(`     dotk init --remote git@github.com:your-org/secrets.git`);
    } else {
      info("Share with your team:");
      console.log(`  dotk init --repo ${opts.remote}`);
    }
  });
