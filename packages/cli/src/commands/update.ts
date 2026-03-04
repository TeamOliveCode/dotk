import { Command } from "commander";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream, chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { success, fatal, info } from "../utils.js";

const execFileAsync = promisify(execFile);
const REPO = "TeamOliveCode/dotk";

async function getLatestTag(): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as { tag_name: string };
  return data.tag_name;
}

async function getCurrentVersion(): Promise<string> {
  // Try `dotk --version` via process.argv[1] (the binary path)
  try {
    const bin = process.argv[1];
    const { stdout } = await execFileAsync("node", [bin, "--version"], {
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) return false;
  const ws = createWriteStream(dest);
  await pipeline(res.body as any, ws);
  return true;
}

export const updateCommand = new Command("update")
  .description("Update dotk to the latest version")
  .action(async () => {
    info("Checking for updates...");

    let latestTag: string;
    try {
      latestTag = await getLatestTag();
    } catch {
      fatal("Failed to check for updates. Check your internet connection.");
    }

    const latestVersion = latestTag.replace(/^v/, "");
    const currentVersion = (await getCurrentVersion()).replace(/^v/, "");

    if (currentVersion === latestVersion) {
      success(`Already on the latest version (${latestVersion}).`);
      return;
    }

    info(`Current: ${currentVersion} → Latest: ${latestVersion}`);

    // Determine binary path
    const binPath = process.argv[1];
    const binDir = dirname(binPath);
    const installDir = dirname(binDir);
    const clientDir = join(installDir, "client");

    // Download binary
    const binaryUrl = `https://github.com/${REPO}/releases/latest/download/dotk`;
    info("Downloading latest binary...");

    const tmpPath = binPath + ".tmp";
    const downloaded = await downloadFile(binaryUrl, tmpPath);
    if (!downloaded) {
      // Fallback: rebuild from source
      info("Release binary not available. Building from source...");
      try {
        const { stdout: tmpDir } = await execFileAsync("mktemp", ["-d"]);
        const buildDir = tmpDir.trim();

        info("Cloning repository...");
        await execFileAsync("git", ["clone", "--depth", "1", "--branch", latestTag, `https://github.com/${REPO}.git`, buildDir], { timeout: 60000 });

        info("Installing dependencies...");
        await execFileAsync("pnpm", ["install", "--frozen-lockfile"], { cwd: buildDir, timeout: 120000 });

        info("Building...");
        await execFileAsync("pnpm", ["bundle"], { cwd: buildDir, timeout: 120000 });

        // Copy binary
        const { copyFileSync } = await import("node:fs");
        copyFileSync(join(buildDir, "dist/dotk"), binPath);
        chmodSync(binPath, 0o755);

        // Copy client assets
        const builtClient = join(buildDir, "dist/client");
        if (existsSync(builtClient)) {
          if (existsSync(clientDir)) rmSync(clientDir, { recursive: true });
          const { cpSync } = await import("node:fs");
          cpSync(builtClient, clientDir, { recursive: true });
        }

        // Cleanup
        rmSync(buildDir, { recursive: true, force: true });

        success(`Updated to ${latestVersion} (built from source).`);
      } catch (err: any) {
        fatal(`Build failed: ${err.message}`);
      }
      return;
    }

    // Replace binary
    const { renameSync } = await import("node:fs");
    try {
      renameSync(tmpPath, binPath);
    } catch {
      // Cross-device rename fallback
      const { copyFileSync, unlinkSync } = await import("node:fs");
      copyFileSync(tmpPath, binPath);
      unlinkSync(tmpPath);
    }
    chmodSync(binPath, 0o755);

    // Download client assets
    const clientUrl = `https://github.com/${REPO}/releases/latest/download/client.tar.gz`;
    info("Downloading web client...");
    try {
      mkdirSync(installDir, { recursive: true });
      await execFileAsync("sh", ["-c", `curl -fsSL "${clientUrl}" | tar xz -C "${installDir}"`], { timeout: 30000 });
    } catch {
      info("Web client download skipped (not available in release).");
    }

    success(`Updated to ${latestVersion}.`);
  });
