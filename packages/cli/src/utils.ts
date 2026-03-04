import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import pc from "picocolors";

/** Resolve the vault directory. Uses --vault option, DOTK_VAULT env var, or cwd */
export function resolveVaultPath(optionVault?: string): string {
  if (optionVault) return resolve(optionVault);
  if (process.env.DOTK_VAULT) return resolve(process.env.DOTK_VAULT);
  return process.cwd();
}

/** Get the path to an encrypted env file */
export function envFilePath(
  vaultPath: string,
  service: string,
  environment: string
): string {
  return join(vaultPath, "services", service, `.env.${environment}.encrypted`);
}

/** Get the dotk.toml path */
export function configPath(vaultPath: string): string {
  return join(vaultPath, "dotk.toml");
}

/** Print success message */
export function success(msg: string): void {
  console.log(pc.green("✓") + " " + msg);
}

/** Print error message and exit */
export function fatal(msg: string): never {
  console.error(pc.red("✗") + " " + msg);
  process.exit(1);
}

/** Print info message */
export function info(msg: string): void {
  console.log(pc.blue("ℹ") + " " + msg);
}

/** Check that vault is initialized */
export function ensureVault(vaultPath: string): void {
  if (!existsSync(join(vaultPath, "dotk.toml"))) {
    fatal(`Not a dotk vault: ${vaultPath}\n  Run "dotk init" first.`);
  }
}
