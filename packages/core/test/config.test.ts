import { describe, it, expect } from "vitest";
import { createDefaultConfig, addService, addMember } from "../src/config.js";

describe("config", () => {
  it("creates a default config", () => {
    const config = createDefaultConfig();
    expect(config.vault.version).toBe(1);
    expect(config.settings.default_environment).toBe("development");
    expect(Object.keys(config.services)).toHaveLength(0);
    expect(Object.keys(config.members)).toHaveLength(0);
  });

  it("adds a service", () => {
    let config = createDefaultConfig();
    config = addService(config, "api-server", {
      description: "Backend API",
      environments: ["development", "staging", "production"],
    });

    expect(config.services["api-server"]).toBeDefined();
    expect(config.services["api-server"].description).toBe("Backend API");
    expect(config.services["api-server"].environments).toHaveLength(3);
  });

  it("adds a member", () => {
    let config = createDefaultConfig();
    config = addMember(config, "john", {
      public_key: "04abc123",
      role: "admin",
    });

    expect(config.members["john"]).toBeDefined();
    expect(config.members["john"].role).toBe("admin");
  });

  it("does not mutate original config", () => {
    const original = createDefaultConfig();
    addService(original, "test", {
      description: "Test",
      environments: ["dev"],
    });
    expect(Object.keys(original.services)).toHaveLength(0);
  });
});
