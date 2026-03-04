import { Command } from "commander";
import { loadPrivateKey, readEncryptedEnv, decryptAll } from "@dotk/core";
import { resolveVaultPath, envFilePath, ensureVault, fatal } from "../utils.js";

export const exportCommand = new Command("export")
  .description("Export decrypted secrets as .env format")
  .argument("<service>", "Service name")
  .argument("<environment>", "Environment name")
  .option("--vault <dir>", "Vault directory")
  .action(async (service, environment, opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    try {
      const privateKey = await loadPrivateKey(vaultPath);
      const filePath = envFilePath(vaultPath, service, environment);
      const file = await readEncryptedEnv(filePath);
      const envVars = decryptAll(file, privateKey);

      for (const [key, value] of Object.entries(envVars)) {
        console.log(`${key}=${value}`);
      }
    } catch (err: any) {
      fatal(`Export failed: ${err.message}`);
    }
  });
