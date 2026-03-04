import { describe, it, expect } from "vitest";
import { generateKeyPair, encryptValue, decryptValue, isEncrypted } from "../src/crypto.js";

describe("crypto", () => {
  it("generates a valid key pair", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toBeTruthy();
    expect(kp.publicKey).toBeTruthy();
    // uncompressed public key starts with 04 and is 130 hex chars
    expect(kp.publicKey.startsWith("04")).toBe(true);
    expect(kp.publicKey.length).toBe(130);
  });

  it("encrypts and decrypts a value (round-trip)", () => {
    const kp = generateKeyPair();
    const plaintext = "postgres://localhost:5432/mydb";
    const encrypted = encryptValue(kp.publicKey, plaintext);

    expect(encrypted.startsWith("encrypted:v1:")).toBe(true);
    expect(isEncrypted(encrypted)).toBe(true);

    const decrypted = decryptValue(kp.privateKey, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (ECIES ephemeral key)", () => {
    const kp = generateKeyPair();
    const plaintext = "same-value";
    const enc1 = encryptValue(kp.publicKey, plaintext);
    const enc2 = encryptValue(kp.publicKey, plaintext);

    expect(enc1).not.toBe(enc2);

    // Both decrypt to the same value
    expect(decryptValue(kp.privateKey, enc1)).toBe(plaintext);
    expect(decryptValue(kp.privateKey, enc2)).toBe(plaintext);
  });

  it("handles empty strings", () => {
    const kp = generateKeyPair();
    const encrypted = encryptValue(kp.publicKey, "");
    const decrypted = decryptValue(kp.privateKey, encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode values", () => {
    const kp = generateKeyPair();
    const plaintext = "비밀번호=🔑";
    const encrypted = encryptValue(kp.publicKey, plaintext);
    const decrypted = decryptValue(kp.privateKey, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on invalid encrypted prefix", () => {
    const kp = generateKeyPair();
    expect(() => decryptValue(kp.privateKey, "not-encrypted")).toThrow(
      'missing "encrypted:v1:" prefix'
    );
  });
});
