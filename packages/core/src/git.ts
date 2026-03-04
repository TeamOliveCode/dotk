import { readFile } from "node:fs/promises";
import { join } from "node:path";

// simple-git은 lazy load — git이 없는 환경(Docker 등)에서도
// get, run, export 같은 파일 전용 명령은 동작해야 하므로
async function loadGit() {
  try {
    const mod = await import("simple-git");
    return mod.default;
  } catch {
    throw new Error(
      "Git is not available. Install git or use file-only commands (get, run, export)."
    );
  }
}

/** Parsed change info for a single encrypted file */
export interface VaultChange {
  service: string;
  environment: string;
  file: string;
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
}

/** Clone a vault repo */
export async function cloneVault(repoUrl: string, dest: string) {
  const simpleGit = await loadGit();
  const git = simpleGit();
  await git.clone(repoUrl, dest);
  return simpleGit(dest);
}

/** Extract key names from encrypted env content (no decryption needed) */
function extractKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) keys.add(trimmed.slice(0, eqIndex).trim());
  }
  return keys;
}

/** Parse service/environment from a file path like services/api-server/.env.development.encrypted */
function parseEncryptedPath(
  filePath: string
): { service: string; environment: string } | null {
  const match = filePath.match(
    /^services\/([^/]+)\/.env\.(.+)\.encrypted$/
  );
  if (!match) return null;
  return { service: match[1], environment: match[2] };
}

/** Analyze staged changes to find which keys were added/removed/modified */
export async function analyzeChanges(cwd: string): Promise<VaultChange[]> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  const changes: VaultChange[] = [];

  const status = await git.status();
  const encryptedFiles = [
    ...status.modified,
    ...status.not_added,
    ...status.created,
    ...status.deleted,
  ].filter((f) => f.endsWith(".encrypted"));

  for (const file of encryptedFiles) {
    const parsed = parseEncryptedPath(file);
    if (!parsed) continue;

    const change: VaultChange = {
      ...parsed,
      file,
      addedKeys: [],
      removedKeys: [],
      modifiedKeys: [],
    };

    let oldKeys = new Set<string>();
    try {
      const oldContent = await git.show([`HEAD:${file}`]);
      oldKeys = extractKeys(oldContent);
    } catch {
      // File is new
    }

    let newKeys = new Set<string>();
    if (!status.deleted.includes(file)) {
      try {
        const newContent = await readFile(join(cwd, file), "utf-8");
        newKeys = extractKeys(newContent);
      } catch {
        // File deleted
      }
    }

    for (const key of newKeys) {
      if (!oldKeys.has(key)) change.addedKeys.push(key);
      else change.modifiedKeys.push(key);
    }
    for (const key of oldKeys) {
      if (!newKeys.has(key)) change.removedKeys.push(key);
    }

    if (
      change.addedKeys.length ||
      change.removedKeys.length ||
      change.modifiedKeys.length
    ) {
      changes.push(change);
    }
  }

  return changes;
}

/** Analyze changes after a pull (compare HEAD with previous HEAD) */
export async function analyzePullChanges(
  cwd: string,
  prevHead: string
): Promise<VaultChange[]> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  const changes: VaultChange[] = [];

  const diff = await git.diffSummary([prevHead, "HEAD"]);
  const encryptedFiles = diff.files
    .map((f) => f.file)
    .filter((f) => f.endsWith(".encrypted"));

  for (const file of encryptedFiles) {
    const parsed = parseEncryptedPath(file);
    if (!parsed) continue;

    const change: VaultChange = {
      ...parsed,
      file,
      addedKeys: [],
      removedKeys: [],
      modifiedKeys: [],
    };

    let oldKeys = new Set<string>();
    try {
      const oldContent = await git.show([`${prevHead}:${file}`]);
      oldKeys = extractKeys(oldContent);
    } catch {}

    let newKeys = new Set<string>();
    try {
      const newContent = await git.show([`HEAD:${file}`]);
      newKeys = extractKeys(newContent);
    } catch {}

    for (const key of newKeys) {
      if (!oldKeys.has(key)) change.addedKeys.push(key);
      else change.modifiedKeys.push(key);
    }
    for (const key of oldKeys) {
      if (!newKeys.has(key)) change.removedKeys.push(key);
    }

    if (
      change.addedKeys.length ||
      change.removedKeys.length ||
      change.modifiedKeys.length
    ) {
      changes.push(change);
    }
  }

  return changes;
}

/** Get current HEAD sha */
export async function getHead(cwd: string): Promise<string> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  return (await git.revparse(["HEAD"])).trim();
}

/** Pull latest changes, returns previous HEAD for diff analysis */
export async function pullVault(
  cwd: string
): Promise<{ prevHead: string; changed: boolean }> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  const prevHead = await getHead(cwd);
  const result = await git.pull();
  return { prevHead, changed: result.summary.changes > 0 };
}

/** Stage and commit changes */
export async function stageAndCommit(
  cwd: string,
  message: string
): Promise<void> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  await git.add(".");
  await git.commit(message);
}

/** Push to remote */
export async function pushToRemote(cwd: string): Promise<void> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  await git.push();
}

/** Stage, commit, and push changes */
export async function commitAndPush(
  cwd: string,
  message: string
): Promise<void> {
  await stageAndCommit(cwd, message);
  await pushToRemote(cwd);
}

/** Get diff summary */
export async function diffSummary(cwd: string) {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  return git.diffSummary();
}

/** Initialize a new git repo */
export async function initRepo(cwd: string) {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  await git.init();
  return git;
}

/** Add a remote to the repo */
export async function addRemote(
  cwd: string,
  name: string,
  url: string
): Promise<void> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  await git.addRemote(name, url);
}

/** Initial commit + push to remote */
export async function initialPush(cwd: string): Promise<void> {
  const simpleGit = await loadGit();
  const git = simpleGit(cwd);
  await git.add(".");
  await git.commit("dotk: initial vault setup");
  await git.push(["-u", "origin", "main"]);
}

/** Format VaultChanges into a shareable summary message */
export function formatChangeSummary(changes: VaultChange[]): string {
  if (changes.length === 0) return "";

  const lines: string[] = [];

  for (const c of changes) {
    const parts: string[] = [];
    if (c.addedKeys.length) parts.push(`added ${c.addedKeys.join(", ")}`);
    if (c.modifiedKeys.length)
      parts.push(`updated ${c.modifiedKeys.join(", ")}`);
    if (c.removedKeys.length)
      parts.push(`removed ${c.removedKeys.join(", ")}`);
    lines.push(`  ${c.service}/${c.environment} — ${parts.join("; ")}`);
  }

  return lines.join("\n");
}
