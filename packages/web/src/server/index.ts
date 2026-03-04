import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  readConfig,
  writeConfig,
  addService,
  readEncryptedEnv,
  writeEncryptedEnv,
  loadPrivateKey,
  loadPublicKey,
  decryptAll,
  setEntry,
  getGhAuthStatus,
  getGhToken,
  validateGithubToken,
  listGithubRepos,
  listGithubOrgs,
  createGithubRepo,
  initVault,
  addRemote,
  initialPush,
  stageAndCommit,
  pushToRemote,
} from "@dotk/core";
import type { EncryptedEnvFile } from "@dotk/core";
import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execFile);

interface ServerOptions {
  vaultPath: string;
  port: number;
  clientDir?: string;
}

/** Validate that a path segment is safe (no traversal) */
function safeName(value: string): string {
  if (!value || /[\/\\]/.test(value) || value === "." || value === ".." || value.includes("..")) {
    throw new Error(`Invalid path segment: "${value}"`);
  }
  return value;
}

export function createApp(vaultPath: string, authToken: string, clientDirOverride?: string) {
  const app = new Hono();
  const configPath = join(vaultPath, "dotk.toml");

  // Ephemeral GitHub token — memory only, kept for push auth during session
  let ghToken: string | null = null;

  /** Get the current remote URL (if any) */
  async function getRemoteUrl(): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git", ["-C", vaultPath, "remote", "get-url", "origin"], { timeout: 3000 });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  // Prevent git from prompting for credentials (would hang the server)
  process.env.GIT_TERMINAL_PROMPT = "0";

  // Try to acquire gh CLI token on startup for push auth
  if (!ghToken) {
    getGhToken().then((t) => { if (t) ghToken = t; }).catch(() => {});
  }

  /** Push with timeout to prevent hanging */
  async function pushWithTimeout(cwd: string, timeoutMs = 15_000): Promise<void> {
    const result = await Promise.race([
      pushToRemote(cwd).then(() => "ok" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
    ]);
    if (result === "timeout") {
      throw new Error("Push timed out");
    }
  }

  /**
   * Stage, commit, and push vault changes. Runs push in background
   * so API responses are never blocked by slow/failing git operations.
   */
  function syncVault(message: string): void {
    // Stage + commit synchronously (fast, local-only)
    stageAndCommit(vaultPath, message)
      .then(async () => {
        const remoteUrl = await getRemoteUrl();
        if (!remoteUrl) return;

        // Inject PAT for GitHub HTTPS remotes without embedded credentials
        const needsTokenInjection = ghToken && remoteUrl.startsWith("https://github.com/") && !remoteUrl.includes("@");
        if (needsTokenInjection) {
          const repoPath = remoteUrl.replace("https://github.com/", "");
          const authedUrl = `https://x-access-token:${ghToken}@github.com/${repoPath}`;
          try {
            await execAsync("git", ["-C", vaultPath, "remote", "set-url", "origin", authedUrl]);
            await pushWithTimeout(vaultPath);
          } finally {
            await execAsync("git", ["-C", vaultPath, "remote", "set-url", "origin", remoteUrl]).catch(() => {});
          }
        } else {
          await pushWithTimeout(vaultPath);
        }
      })
      .catch(() => {
        // Push failed — changes are committed locally, user can push manually
      });
  }

  // Auth middleware — require token for all API routes
  app.use("/api/*", async (c, next) => {
    const token = c.req.header("X-Dotk-Token") || c.req.query("token");
    if (token !== authToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  // CORS — only allow same-origin (127.0.0.1)
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin) {
      const url = new URL(origin);
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        return c.json({ error: "Forbidden origin" }, 403);
      }
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, X-Dotk-Token");
    }
    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    await next();
  });

  // ─── Setup routes (always available) ───

  const setup = new Hono();

  setup.get("/status", async (c) => {
    const vaultExists = existsSync(configPath);
    const ghStatus = await getGhAuthStatus();

    // Check if git remote is configured
    let hasRemote = false;
    if (vaultExists) {
      try {
        const { execFile: ef } = await import("node:child_process");
        const { promisify: p } = await import("node:util");
        const exec = p(ef);
        const { stdout } = await exec("git", ["-C", vaultPath, "remote", "get-url", "origin"], { timeout: 3000 });
        hasRemote = !!stdout.trim();
      } catch {
        // No remote configured
      }
    }

    return c.json({
      vault_initialized: vaultExists,
      has_remote: hasRemote,
      gh: ghStatus,
    });
  });

  setup.post("/gh/token", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { pat?: string };
    const pat = body.pat;

    if (pat) {
      // Validate PAT
      const result = await validateGithubToken(pat);
      if (!result.valid) {
        return c.json({ error: "Invalid token" }, 401);
      }
      const hasRepoScope =
        result.scopes.includes("repo") || result.scopes.length === 0; // Fine-grained tokens don't list scopes
      if (!hasRepoScope && result.scopes.length > 0) {
        return c.json(
          {
            error: "Token missing 'repo' scope",
            scopes: result.scopes,
          },
          403
        );
      }
      ghToken = pat;
      return c.json({
        authenticated: true,
        username: result.user!.login,
        source: "pat",
      });
    }

    // Try gh CLI token
    const cliToken = await getGhToken();
    if (cliToken) {
      const result = await validateGithubToken(cliToken);
      if (result.valid) {
        ghToken = cliToken;
        return c.json({
          authenticated: true,
          username: result.user!.login,
          source: "gh_cli",
        });
      }
    }

    return c.json({ error: "No valid GitHub token found" }, 401);
  });

  setup.get("/gh/repos", async (c) => {
    if (!ghToken) {
      return c.json({ error: "Not authenticated with GitHub" }, 401);
    }
    const type = (c.req.query("type") as "user" | "org") || "user";
    const org = c.req.query("org");
    const repos = await listGithubRepos(ghToken, { type, org });
    return c.json(repos);
  });

  setup.get("/gh/orgs", async (c) => {
    if (!ghToken) {
      return c.json({ error: "Not authenticated with GitHub" }, 401);
    }
    const orgs = await listGithubOrgs(ghToken);
    return c.json(orgs);
  });

  setup.post("/gh/repos", async (c) => {
    if (!ghToken) {
      return c.json({ error: "Not authenticated with GitHub" }, 401);
    }
    const body = await c.req.json<{
      name: string;
      org?: string;
      description?: string;
    }>();
    const repo = await createGithubRepo(ghToken, body);
    return c.json(repo);
  });

  setup.post("/init", async (c) => {
    const { repoUrl } = await c.req.json<{ repoUrl: string }>();

    // Local-only mode: no remote URL
    if (!repoUrl) {
      try {
        const alreadyInitialized = existsSync(configPath);
        if (alreadyInitialized) {
          const publicKey = await loadPublicKey(vaultPath);
          return c.json({ ok: true, publicKey });
        }
        const result = await initVault(vaultPath);
        return c.json({ ok: true, publicKey: result.publicKey });
      } catch (err: any) {
        return c.json({ error: err.message }, 500);
      }
    }

    // If we have a PAT token and URL is HTTPS, inject token for push
    let pushUrl = repoUrl;
    if (ghToken && repoUrl.startsWith("https://github.com/")) {
      const repoPath = repoUrl.replace("https://github.com/", "");
      pushUrl = `https://x-access-token:${ghToken}@github.com/${repoPath}`;
    }

    try {
      const alreadyInitialized = existsSync(configPath);
      let publicKey: string;

      if (alreadyInitialized) {
        // Vault exists — just connect remote and push
        try {
          await addRemote(vaultPath, "origin", pushUrl);
        } catch {
          // Remote already exists, update URL
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const exec = promisify(execFile);
          await exec("git", ["-C", vaultPath, "remote", "set-url", "origin", pushUrl]);
        }
        await initialPush(vaultPath);
        publicKey = await loadPublicKey(vaultPath);
      } else {
        const result = await initVault(vaultPath, pushUrl);
        publicKey = result.publicKey;
      }

      // Clean up token from remote URL after push
      if (pushUrl !== repoUrl) {
        try {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const exec = promisify(execFile);
          await exec("git", ["-C", vaultPath, "remote", "set-url", "origin", repoUrl]);
        } catch {
          // Non-critical — URL cleanup failed
        }
      }

      // Keep ghToken alive for subsequent pushes during this session

      return c.json({ ok: true, publicKey });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.route("/api/setup", setup);

  // ─── Vault-required routes ───

  const api = new Hono();

  // Vault check middleware — existing routes require initialized vault
  api.use("*", async (c, next) => {
    if (!existsSync(configPath)) {
      return c.json({ error: "Vault not initialized", setup_required: true }, 409);
    }
    await next();
  });

  api.get("/config", async (c) => {
    const config = await readConfig(configPath);
    return c.json(config);
  });

  api.get("/services", async (c) => {
    const config = await readConfig(configPath);
    return c.json(
      Object.entries(config.services).map(([name, svc]) => ({
        name,
        ...svc,
      }))
    );
  });

  api.post("/services", async (c) => {
    const { name, description, environments } = await c.req.json<{
      name: string;
      description?: string;
      environments?: string[];
    }>();
    if (!name || !name.trim()) {
      return c.json({ error: "Service name is required" }, 400);
    }
    try { safeName(name); } catch { return c.json({ error: "Invalid service name" }, 400); }

    const config = await readConfig(configPath);
    if (config.services[name]) {
      return c.json({ error: "Service already exists" }, 409);
    }

    const envs = environments?.length ? environments : ["development", "production"];
    const updated = addService(config, name, {
      description: description || "",
      environments: envs,
    });
    await writeConfig(configPath, updated);
    syncVault(`add service: ${name}`);

    return c.json({ ok: true, service: { name, description: description || "", environments: envs } });
  });

  api.post("/services/:service/environments", async (c) => {
    const { service } = c.req.param();
    try { safeName(service); } catch { return c.json({ error: "Invalid service name" }, 400); }

    const { environment } = await c.req.json<{ environment: string }>();
    if (!environment || !environment.trim()) {
      return c.json({ error: "Environment name is required" }, 400);
    }
    try { safeName(environment); } catch { return c.json({ error: "Invalid environment name" }, 400); }

    const config = await readConfig(configPath);
    const svc = config.services[service];
    if (!svc) {
      return c.json({ error: "Service not found" }, 404);
    }
    if (svc.environments.includes(environment)) {
      return c.json({ error: "Environment already exists" }, 409);
    }

    svc.environments.push(environment);
    await writeConfig(configPath, config);
    syncVault(`add environment: ${service}/${environment}`);

    return c.json({ ok: true });
  });

  api.get("/services/:service/:environment/secrets", async (c) => {
    const { service, environment } = c.req.param();
    try { safeName(service); safeName(environment); } catch { return c.json({ error: "Invalid parameters" }, 400); }
    const filePath = join(
      vaultPath,
      "services",
      service,
      `.env.${environment}.encrypted`
    );

    if (!existsSync(filePath)) {
      return c.json([]);
    }

    const file = await readEncryptedEnv(filePath);
    const privateKey = await loadPrivateKey(vaultPath);
    const all = decryptAll(file, privateKey);

    const secrets = file.entries.map((entry) => ({
      key: entry.key,
      value: all[entry.key],
      encrypted: entry.encrypted,
    }));

    return c.json(secrets);
  });

  api.post("/services/:service/:environment/secrets", async (c) => {
    const { service, environment } = c.req.param();
    try { safeName(service); safeName(environment); } catch { return c.json({ error: "Invalid parameters" }, 400); }
    const { key, value } = await c.req.json<{ key: string; value: string }>();

    const publicKey = await loadPublicKey(vaultPath);
    const filePath = join(
      vaultPath,
      "services",
      service,
      `.env.${environment}.encrypted`
    );

    let file: EncryptedEnvFile;
    if (existsSync(filePath)) {
      file = await readEncryptedEnv(filePath);
    } else {
      file = { publicKey, entries: [] };
    }

    file = setEntry(file, key, value, publicKey);
    await writeEncryptedEnv(filePath, file);
    syncVault(`set ${service}/${environment}: ${key}`);

    return c.json({ ok: true });
  });

  api.delete("/services/:service/:environment/secrets/:key", async (c) => {
    const { service, environment, key } = c.req.param();
    try { safeName(service); safeName(environment); } catch { return c.json({ error: "Invalid parameters" }, 400); }
    const filePath = join(
      vaultPath,
      "services",
      service,
      `.env.${environment}.encrypted`
    );

    if (!existsSync(filePath)) {
      return c.json({ ok: false, error: "File not found" }, 404);
    }

    const file = await readEncryptedEnv(filePath);
    const entries = file.entries.filter((e) => e.key !== key);
    await writeEncryptedEnv(filePath, { ...file, entries });
    syncVault(`delete ${service}/${environment}: ${key}`);

    return c.json({ ok: true });
  });

  api.get("/members", async (c) => {
    const config = await readConfig(configPath);
    return c.json(
      Object.entries(config.members).map(([name, m]) => ({
        name,
        ...m,
      }))
    );
  });

  app.route("/api", api);

  // Try to serve built client assets
  // Check multiple candidate paths for the client directory
  const candidates = clientDirOverride ? [clientDirOverride] : [];
  // Next to the entry script (installed binary: $HOME/.dotk/bin/dotk → ../client)
  if (typeof process !== "undefined" && process.argv[1]) {
    const binDir = dirname(process.argv[1]);
    candidates.push(join(binDir, "client"), join(binDir, "../client"));
  }
  // Next to this module file (web package standalone)
  const currentDir = typeof __filename !== "undefined"
    ? dirname(__filename)
    : dirname(fileURLToPath(import.meta.url));
  candidates.push(join(currentDir, "client"), join(currentDir, "../client"));

  const clientDir = candidates.find((d) => existsSync(join(d, "index.html"))) || join(currentDir, "client");

  if (existsSync(join(clientDir, "index.html"))) {
    app.use("/*", serveStatic({ root: clientDir }));
    app.get("*", (c) => {
      const html = readFileSync(join(clientDir, "index.html"), "utf-8");
      return c.html(html);
    });
  } else {
    // Fallback: inline minimal HTML for development
    app.get("*", (c) => {
      return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>dotk</title>
  <style>
    body { font-family: system-ui; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    a { color: #71717a; }
  </style>
</head>
<body>
  <div>
    <h1>dotk</h1>
    <p>Client not built. Run <code>pnpm --filter @dotk/web build:client</code> first,<br/>or use <code>pnpm --filter @dotk/web dev:client</code> for development.</p>
  </div>
</body>
</html>`);
    });
  }

  return app;
}

export async function startServer(opts: ServerOptions): Promise<{ token: string }> {
  const token = randomBytes(32).toString("hex");
  const app = createApp(opts.vaultPath, token, opts.clientDir);

  serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: opts.port,
  });

  return { token };
}
