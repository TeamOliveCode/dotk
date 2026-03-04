import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isEncrypted, encryptValue, decryptValue } from "./crypto.js";
import type { EnvEntry, EncryptedEnvFile } from "./types.js";

const HEADER_PREFIX = "#:";
const COMMENT_PREFIX = "#";

/** Parse an encrypted .env file content into structured data */
export function parseEncryptedEnv(content: string): EncryptedEnvFile {
  let publicKey = "";
  const entries: EnvEntry[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Parse header metadata
    if (line.startsWith(HEADER_PREFIX)) {
      const match = line.match(/^#:\s*public_key\s*=\s*(.+)$/);
      if (match) {
        publicKey = match[1].trim();
      }
      continue;
    }

    // Skip comments
    if (line.startsWith(COMMENT_PREFIX)) continue;

    // Parse KEY = VALUE
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    entries.push({
      key,
      value,
      encrypted: isEncrypted(value),
    });
  }

  return { publicKey, entries };
}

/** Serialize structured data back to encrypted .env file content */
export function serializeEncryptedEnv(file: EncryptedEnvFile): string {
  const lines: string[] = [
    "# Encrypted by dotk v1",
    `#:public_key = ${file.publicKey}`,
    "",
  ];

  for (const entry of file.entries) {
    lines.push(`${entry.key} = ${entry.value}`);
  }

  return lines.join("\n") + "\n";
}

/** Read and parse an encrypted .env file from disk */
export async function readEncryptedEnv(path: string): Promise<EncryptedEnvFile> {
  const content = await readFile(path, "utf-8");
  return parseEncryptedEnv(content);
}

/** Write an encrypted .env file to disk */
export async function writeEncryptedEnv(
  path: string,
  file: EncryptedEnvFile
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = serializeEncryptedEnv(file);
  await writeFile(path, content, "utf-8");
}

/** Set a value in an encrypted env file (encrypts with publicKey) */
export function setEntry(
  file: EncryptedEnvFile,
  key: string,
  plainValue: string,
  publicKey: string
): EncryptedEnvFile {
  const encValue = encryptValue(publicKey, plainValue);
  const existing = file.entries.findIndex((e) => e.key === key);
  const entry: EnvEntry = { key, value: encValue, encrypted: true };

  const entries = [...file.entries];
  if (existing >= 0) {
    entries[existing] = entry;
  } else {
    entries.push(entry);
  }

  return { ...file, publicKey, entries };
}

/** Get and decrypt a value from an encrypted env file */
export function getEntry(
  file: EncryptedEnvFile,
  key: string,
  privateKey: string
): string | undefined {
  const entry = file.entries.find((e) => e.key === key);
  if (!entry) return undefined;
  if (!entry.encrypted) return entry.value;
  return decryptValue(privateKey, entry.value);
}

/** Decrypt all entries, returning key-value pairs */
export function decryptAll(
  file: EncryptedEnvFile,
  privateKey: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of file.entries) {
    result[entry.key] = entry.encrypted
      ? decryptValue(privateKey, entry.value)
      : entry.value;
  }
  return result;
}
