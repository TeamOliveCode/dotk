import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  readConfig,
  readEncryptedEnv,
  writeEncryptedEnv,
  loadPrivateKey,
  loadPublicKey,
  decryptAll,
  setEntry,
} from "@dotk/core";
import type { EncryptedEnvFile } from "@dotk/core";
import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ServerOptions {
  vaultPath: string;
  port: number;
}

function createApp(vaultPath: string) {
  const app = new Hono();
  const configPath = join(vaultPath, "dotk.toml");

  // API routes
  const api = new Hono();

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

  api.get("/services/:service/:environment/secrets", async (c) => {
    const { service, environment } = c.req.param();
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

    return c.json({ ok: true });
  });

  api.delete("/services/:service/:environment/secrets/:key", async (c) => {
    const { service, environment, key } = c.req.param();
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
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(__dirname, "../client");

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

export async function startServer(opts: ServerOptions): Promise<void> {
  const app = createApp(opts.vaultPath);

  serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: opts.port,
  });
}
