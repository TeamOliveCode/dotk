import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createDefaultConfig, writeConfig } from "./config.js";
import { saveKeyPair } from "./keyring.js";
import { initRepo, addRemote, initialPush } from "./git.js";

export interface InitVaultResult {
  publicKey: string;
}

/**
 * Initialize a new dotk vault at the given path.
 * Creates directory structure, config, keys, git repo, and optionally connects remote.
 */
export async function initVault(
  vaultPath: string,
  remoteUrl?: string
): Promise<InitVaultResult> {
  if (existsSync(join(vaultPath, "dotk.toml"))) {
    throw new Error("Vault already initialized in this directory.");
  }

  // Scaffold vault structure
  await mkdir(join(vaultPath, "services"), { recursive: true });
  await mkdir(join(vaultPath, ".keys"), { recursive: true });
  await writeFile(join(vaultPath, ".gitignore"), ".keys/\n", "utf-8");

  const config = createDefaultConfig();
  await writeConfig(join(vaultPath, "dotk.toml"), config);

  const keyPair = await saveKeyPair(vaultPath);

  // Init git repo
  try {
    await initRepo(vaultPath);
  } catch {
    // Already a repo or git unavailable
  }

  // Connect to remote repo if URL provided
  if (remoteUrl) {
    await addRemote(vaultPath, "origin", remoteUrl);
    await initialPush(vaultPath);
  }

  return { publicKey: keyPair.publicKey };
}
