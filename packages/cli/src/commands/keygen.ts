import { Command } from "commander";
import { saveKeyPair } from "@dotk/core";
import { resolveVaultPath, success, info } from "../utils.js";

export const keygenCommand = new Command("keygen")
  .description("Generate a new ECIES key pair")
  .option("--vault <dir>", "Vault directory")
  .action(async (opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    const keyPair = await saveKeyPair(vaultPath);
    info(`Private key saved to .keys/vault.key`);
    info(`Public key saved to .keys/vault.pub`);
    info(`Public key: ${keyPair.publicKey}`);
    success("Key pair generated.");
  });
