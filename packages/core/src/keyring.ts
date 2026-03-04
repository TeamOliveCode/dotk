import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair } from "./crypto.js";
import type { KeyPair } from "./types.js";

const KEYS_DIR = ".keys";
const PRIVATE_KEY_FILE = "vault.key";
const PUBLIC_KEY_FILE = "vault.pub";

/** Load private key: DOTK_PRIVATE_KEY env var takes precedence over .keys/vault.key */
export async function loadPrivateKey(vaultPath: string): Promise<string> {
  const envKey = process.env.DOTK_PRIVATE_KEY;
  if (envKey) return envKey;

  const keyPath = join(vaultPath, KEYS_DIR, PRIVATE_KEY_FILE);
  const content = await readFile(keyPath, "utf-8");
  return content.trim();
}

/** Load public key from .keys/vault.pub */
export async function loadPublicKey(vaultPath: string): Promise<string> {
  const keyPath = join(vaultPath, KEYS_DIR, PUBLIC_KEY_FILE);
  const content = await readFile(keyPath, "utf-8");
  return content.trim();
}

/** Generate a key pair and save to .keys/ directory */
export async function saveKeyPair(vaultPath: string): Promise<KeyPair> {
  const keyPair = generateKeyPair();
  const keysDir = join(vaultPath, KEYS_DIR);

  await mkdir(keysDir, { recursive: true, mode: 0o700 });
  await writeFile(join(keysDir, PRIVATE_KEY_FILE), keyPair.privateKey + "\n", { encoding: "utf-8", mode: 0o600 });
  await writeFile(join(keysDir, PUBLIC_KEY_FILE), keyPair.publicKey + "\n", { encoding: "utf-8", mode: 0o644 });

  return keyPair;
}
