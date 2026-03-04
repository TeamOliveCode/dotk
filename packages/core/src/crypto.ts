import { PrivateKey, encrypt, decrypt } from "eciesjs";
import type { KeyPair } from "./types.js";

const ENCRYPTED_PREFIX = "encrypted:v1:";

/** Generate a new ECIES secp256k1 key pair */
export function generateKeyPair(): KeyPair {
  const sk = new PrivateKey();
  return {
    privateKey: sk.toHex(),
    publicKey: sk.publicKey.toHex(false), // uncompressed
  };
}

/** Encrypt a plaintext value with a public key, returns `encrypted:v1:<base64>` */
export function encryptValue(publicKey: string, plaintext: string): string {
  const data = Buffer.from(plaintext, "utf-8");
  const encrypted = encrypt(publicKey, data);
  return ENCRYPTED_PREFIX + Buffer.from(encrypted).toString("base64");
}

/** Decrypt an `encrypted:v1:<base64>` value with a private key */
export function decryptValue(privateKey: string, ciphertext: string): string {
  if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error(`Invalid encrypted value: missing "${ENCRYPTED_PREFIX}" prefix`);
  }
  const base64 = ciphertext.slice(ENCRYPTED_PREFIX.length);
  const data = Buffer.from(base64, "base64");
  const decrypted = decrypt(privateKey, data);
  return Buffer.from(decrypted).toString("utf-8");
}

/** Check if a value is encrypted */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
