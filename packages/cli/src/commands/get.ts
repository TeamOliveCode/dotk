import { Command } from "commander";
import { loadPrivateKey, readEncryptedEnv, getEntry } from "@dotk/core";
import { resolveVaultPath, envFilePath, ensureVault, fatal } from "../utils.js";

export const getCommand = new Command("get")
  .description("Get and decrypt a secret value")
  .argument("<service>", "Service name")
  .argument("<environment>", "Environment name")
  .argument("<key>", "Key to retrieve")
  .option("--vault <dir>", "Vault directory")
  .action(async (service, environment, key, opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    const privateKey = await loadPrivateKey(vaultPath);
    const filePath = envFilePath(vaultPath, service, environment);

    const file = await readEncryptedEnv(filePath);
    const value = getEntry(file, key, privateKey);

    if (value === undefined) {
      fatal(`Key "${key}" not found in ${service}/${environment}`);
    }

    console.log(value);
  });
