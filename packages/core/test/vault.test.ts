import { describe, it, expect } from "vitest";
import { parseEncryptedEnv, serializeEncryptedEnv, setEntry, getEntry, decryptAll } from "../src/vault.js";
import { generateKeyPair, encryptValue } from "../src/crypto.js";

describe("vault", () => {
  const kp = generateKeyPair();

  it("parses an encrypted env file", () => {
    const content = `# Encrypted by dotk v1
#:public_key = ${kp.publicKey}

DATABASE_URL = encrypted:v1:AAAA
API_KEY = encrypted:v1:BBBB
`;
    const file = parseEncryptedEnv(content);
    expect(file.publicKey).toBe(kp.publicKey);
    expect(file.entries).toHaveLength(2);
    expect(file.entries[0].key).toBe("DATABASE_URL");
    expect(file.entries[0].encrypted).toBe(true);
    expect(file.entries[1].key).toBe("API_KEY");
  });

  it("serializes an encrypted env file", () => {
    const file = {
      publicKey: kp.publicKey,
      entries: [
        { key: "FOO", value: "encrypted:v1:xxx", encrypted: true },
        { key: "BAR", value: "encrypted:v1:yyy", encrypted: true },
      ],
    };
    const content = serializeEncryptedEnv(file);
    expect(content).toContain("# Encrypted by dotk v1");
    expect(content).toContain(`#:public_key = ${kp.publicKey}`);
    expect(content).toContain("FOO = encrypted:v1:xxx");
    expect(content).toContain("BAR = encrypted:v1:yyy");
  });

  it("sets and gets entries with encryption round-trip", () => {
    let file = { publicKey: kp.publicKey, entries: [] as any[] };

    file = setEntry(file, "SECRET", "my-secret-value", kp.publicKey);
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].encrypted).toBe(true);

    const value = getEntry(file, "SECRET", kp.privateKey);
    expect(value).toBe("my-secret-value");
  });

  it("updates existing entry", () => {
    let file = { publicKey: kp.publicKey, entries: [] as any[] };
    file = setEntry(file, "KEY", "value1", kp.publicKey);
    file = setEntry(file, "KEY", "value2", kp.publicKey);

    expect(file.entries).toHaveLength(1);
    expect(getEntry(file, "KEY", kp.privateKey)).toBe("value2");
  });

  it("decrypts all entries", () => {
    let file = { publicKey: kp.publicKey, entries: [] as any[] };
    file = setEntry(file, "A", "val-a", kp.publicKey);
    file = setEntry(file, "B", "val-b", kp.publicKey);

    const all = decryptAll(file, kp.privateKey);
    expect(all).toEqual({ A: "val-a", B: "val-b" });
  });

  it("returns undefined for missing key", () => {
    const file = { publicKey: kp.publicKey, entries: [] as any[] };
    expect(getEntry(file, "MISSING", kp.privateKey)).toBeUndefined();
  });
});
