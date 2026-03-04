import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../src/server/index.js";
import { initVault, readConfig, writeConfig, addService } from "@dotk/core";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const TOKEN = "test-token-abc123";

let vaultPath: string;
let app: ReturnType<typeof createApp>;

/** Helper to make requests to the Hono app */
function req(path: string, init?: RequestInit) {
  return app.request(path, {
    headers: { "X-Dotk-Token": TOKEN, "Content-Type": "application/json" },
    ...init,
  });
}

beforeAll(async () => {
  vaultPath = await mkdtemp(join(tmpdir(), "dotk-test-"));
  await initVault(vaultPath);

  // Seed a service for testing
  const configPath = join(vaultPath, "dotk.toml");
  let config = await readConfig(configPath);
  config = addService(config, "api-server", {
    description: "Backend API",
    environments: ["development", "production"],
  });
  await writeConfig(configPath, config);

  app = createApp(vaultPath, TOKEN);
});

afterAll(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

// ─── Auth ───

describe("auth", () => {
  it("rejects requests without token", async () => {
    const res = await app.request("/api/services");
    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong token", async () => {
    const res = await app.request("/api/services", {
      headers: { "X-Dotk-Token": "wrong" },
    });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/services ───

describe("GET /api/services", () => {
  it("returns seeded services", async () => {
    const res = await req("/api/services");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("api-server");
    expect(body[0].environments).toEqual(["development", "production"]);
  });
});

// ─── POST /api/services ───

describe("POST /api/services", () => {
  it("creates a new service with default environments", async () => {
    const res = await req("/api/services", {
      method: "POST",
      body: JSON.stringify({ name: "web-app", description: "Frontend" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service.name).toBe("web-app");
    expect(body.service.environments).toEqual(["development", "production"]);
  });

  it("creates a service with custom environments", async () => {
    const res = await req("/api/services", {
      method: "POST",
      body: JSON.stringify({ name: "worker", environments: ["staging", "production"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.environments).toEqual(["staging", "production"]);
  });

  it("rejects duplicate service name", async () => {
    const res = await req("/api/services", {
      method: "POST",
      body: JSON.stringify({ name: "api-server" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects empty service name", async () => {
    const res = await req("/api/services", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid service name with path traversal", async () => {
    const res = await req("/api/services", {
      method: "POST",
      body: JSON.stringify({ name: "../hack" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/services/:service/environments ───

describe("POST /api/services/:service/environments", () => {
  it("adds an environment to existing service", async () => {
    const res = await req("/api/services/api-server/environments", {
      method: "POST",
      body: JSON.stringify({ environment: "staging" }),
    });
    expect(res.status).toBe(200);

    // Verify it persisted
    const listRes = await req("/api/services");
    const services = await listRes.json();
    const svc = services.find((s: any) => s.name === "api-server");
    expect(svc.environments).toContain("staging");
  });

  it("rejects duplicate environment", async () => {
    const res = await req("/api/services/api-server/environments", {
      method: "POST",
      body: JSON.stringify({ environment: "development" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects for non-existent service", async () => {
    const res = await req("/api/services/nope/environments", {
      method: "POST",
      body: JSON.stringify({ environment: "dev" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects empty environment name", async () => {
    const res = await req("/api/services/api-server/environments", {
      method: "POST",
      body: JSON.stringify({ environment: "" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Secrets CRUD ───

describe("secrets", () => {
  it("returns empty array for new environment", async () => {
    const res = await req("/api/services/api-server/development/secrets");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("adds a secret", async () => {
    const res = await req("/api/services/api-server/development/secrets", {
      method: "POST",
      body: JSON.stringify({ key: "DATABASE_URL", value: "postgres://localhost/test" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("reads back the secret", async () => {
    const res = await req("/api/services/api-server/development/secrets");
    expect(res.status).toBe(200);
    const secrets = await res.json();
    expect(secrets).toHaveLength(1);
    expect(secrets[0].key).toBe("DATABASE_URL");
    expect(secrets[0].value).toBe("postgres://localhost/test");
  });

  it("updates an existing secret", async () => {
    await req("/api/services/api-server/development/secrets", {
      method: "POST",
      body: JSON.stringify({ key: "DATABASE_URL", value: "postgres://localhost/prod" }),
    });

    const res = await req("/api/services/api-server/development/secrets");
    const secrets = await res.json();
    expect(secrets[0].value).toBe("postgres://localhost/prod");
  });

  it("adds multiple secrets", async () => {
    await req("/api/services/api-server/development/secrets", {
      method: "POST",
      body: JSON.stringify({ key: "API_KEY", value: "secret123" }),
    });

    const res = await req("/api/services/api-server/development/secrets");
    const secrets = await res.json();
    expect(secrets).toHaveLength(2);
  });

  it("deletes a secret", async () => {
    const res = await req("/api/services/api-server/development/secrets/API_KEY", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const listRes = await req("/api/services/api-server/development/secrets");
    const secrets = await listRes.json();
    expect(secrets).toHaveLength(1);
    expect(secrets[0].key).toBe("DATABASE_URL");
  });

  it("returns 404 when deleting from non-existent file", async () => {
    const res = await req("/api/services/api-server/production/secrets/NOPE", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid path parameters", async () => {
    // Path with slash in service name (not normalized by router)
    const res = await req("/api/services/ha%2Fck/development/secrets");
    expect(res.status).toBe(400);
  });
});

// ─── Sync ───

describe("sync", () => {
  it("returns sync status", async () => {
    const res = await req("/api/sync-status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("has_remote");
    expect(body).toHaveProperty("last_error");
  });

  it("push fails gracefully without remote", async () => {
    const res = await req("/api/push", { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });
});

// ─── Members ───

describe("GET /api/members", () => {
  it("returns members list", async () => {
    const res = await req("/api/members");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
