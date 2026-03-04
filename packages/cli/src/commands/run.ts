import { Command } from "commander";
import { spawn } from "node:child_process";
import { loadPrivateKey, readEncryptedEnv, decryptAll } from "@dotk/core";
import { resolveVaultPath, envFilePath, ensureVault, fatal } from "../utils.js";

export const runCommand = new Command("run")
  .description("Run a command with decrypted env vars injected")
  .argument("<service>", "Service name")
  .argument("<environment>", "Environment name")
  .argument("<command...>", "Command to run (use -- before command)")
  .option("--vault <dir>", "Vault directory")
  .allowUnknownOption()
  .action(async (service, environment, command, opts) => {
    const vaultPath = resolveVaultPath(opts.vault);
    ensureVault(vaultPath);

    const privateKey = await loadPrivateKey(vaultPath);
    const filePath = envFilePath(vaultPath, service, environment);

    const file = await readEncryptedEnv(filePath);
    const envVars = decryptAll(file, privateKey);

    const [cmd, ...args] = command;
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...envVars },
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });

    child.on("error", (err) => {
      fatal(`Failed to start command: ${err.message}`);
    });
  });
