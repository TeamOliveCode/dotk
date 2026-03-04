import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  cloneVault,
  saveKeyPair,
  initVault,
  addRemote,
  initialPush,
  loadPublicKey,
} from "@dotk/core";
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

    const alreadyInitialized = existsSync(join(vaultPath, "dotk.toml"));

    // Already initialized + --remote → just connect remote and push
    if (alreadyInitialized && opts.remote) {
      info("Vault already initialized. Connecting to remote...");
      try {
        await addRemote(vaultPath, "origin", opts.remote);
        info(`Remote set to ${opts.remote}`);
      } catch {
        info("Remote 'origin' already exists, updating URL...");
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const exec = promisify(execFile);
        await exec("git", ["-C", vaultPath, "remote", "set-url", "origin", opts.remote]);
        info(`Remote updated to ${opts.remote}`);
      }

      try {
        await initialPush(vaultPath);
        success("Pushed to remote.");
      } catch (err: any) {
        info(`Push failed: ${err.message}`);
        info("You can push manually with: git push -u origin main");
      }

      console.log();
      info("Share with your team:");
      console.log(`  dotk init --repo ${opts.remote}`);
      return;
    }

    // Already initialized + no --remote → nothing to do
    if (alreadyInitialized) {
      fatal("Vault already initialized in this directory.");
    }

    // New vault
    try {
      const result = await initVault(vaultPath, opts.remote);
      info(`Public key: ${result.publicKey.slice(0, 16)}...`);
    } catch (err: any) {
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
      console.log(`     dotk init --remote git@github.com:your-org/secrets.git`);
    } else {
      info("Share with your team:");
      console.log(`  dotk init --repo ${opts.remote}`);
    }
  });
