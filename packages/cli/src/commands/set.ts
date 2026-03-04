import { Command } from "commander";
import { existsSync } from "node:fs";
import {
  loadPublicKey,
  readEncryptedEnv,
  writeEncryptedEnv,
  setEntry,
} from "@dotk/core";
import type { EncryptedEnvFile } from "@dotk/core";
import {
  resolveVaultPath,
  envFilePath,
  ensureVault,
  success,
  fatal,
} from "../utils.js";

export const setCommand = new Command("set")
  .description("Set an encrypted secret value")
  .argument("<service>", "Service name")
  .argument("<environment>", "Environment name")
  .argument("<key=value>", "Key=Value pair to set")
  .option("--vault <dir>", "Vault directory")
  .action(async (service, environment, kvPair, opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    const eqIndex = kvPair.indexOf("=");
    if (eqIndex === -1) {
      fatal('Invalid format. Use KEY=VALUE (e.g. DATABASE_URL=postgres://...)');
    }

    const key = kvPair.slice(0, eqIndex);
    const value = kvPair.slice(eqIndex + 1);

    const publicKey = await loadPublicKey(vaultPath);
    const filePath = envFilePath(vaultPath, service, environment);

    let file: EncryptedEnvFile;
    if (existsSync(filePath)) {
      file = await readEncryptedEnv(filePath);
    } else {
      file = { publicKey, entries: [] };
    }

    file = setEntry(file, key, value, publicKey);
    await writeEncryptedEnv(filePath, file);
    success(`Set ${key} in ${service}/${environment}`);
  });
