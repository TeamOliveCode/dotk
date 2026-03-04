import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GITHUB_API = "https://api.github.com";

export interface GhAuthStatus {
  authenticated: boolean;
  username: string | null;
}

export interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface GithubOrg {
  login: string;
  avatar_url: string;
  description: string | null;
}

export interface GithubRepo {
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  description: string | null;
  size: number;
  default_branch: string;
}

export interface CreateRepoOpts {
  name: string;
  org?: string;
  description?: string;
}

export interface ListReposOpts {
  type?: "user" | "org";
  org?: string;
  page?: number;
  per_page?: number;
}

/** Check if gh CLI is authenticated */
export async function getGhAuthStatus(): Promise<GhAuthStatus> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "status"], {
      timeout: 5000,
    });
    // gh auth status outputs username in the format "Logged in to github.com account <username>"
    const match = stdout.match(/account\s+(\S+)/);
    return {
      authenticated: true,
      username: match ? match[1] : null,
    };
  } catch (err: any) {
    // gh auth status also outputs to stderr on some versions
    const output = err.stderr || err.stdout || "";
    const match = output.match(/account\s+(\S+)/);
    if (match) {
      return { authenticated: true, username: match[1] };
    }
    return { authenticated: false, username: null };
  }
}

/** Get token from gh CLI */
export async function getGhToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      timeout: 5000,
    });
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

async function githubFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
}

/** Validate a GitHub token, returns user info and scopes */
export async function validateGithubToken(
  token: string
): Promise<{ valid: boolean; user?: GithubUser; scopes: string[] }> {
  try {
    const res = await githubFetch("/user", token);
    if (!res.ok) {
      return { valid: false, scopes: [] };
    }
    const user = (await res.json()) as GithubUser;
    const scopes = (res.headers.get("X-OAuth-Scopes") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { valid: true, user, scopes };
  } catch {
    return { valid: false, scopes: [] };
  }
}

/** List GitHub repos for user or org */
export async function listGithubRepos(
  token: string,
  opts?: ListReposOpts
): Promise<GithubRepo[]> {
  const page = opts?.page ?? 1;
  const per_page = opts?.per_page ?? 100;

  let path: string;
  if (opts?.type === "org" && opts.org) {
    path = `/orgs/${encodeURIComponent(opts.org)}/repos?per_page=${per_page}&page=${page}&sort=updated&direction=desc`;
  } else {
    path = `/user/repos?per_page=${per_page}&page=${page}&sort=updated&direction=desc&affiliation=owner`;
  }

  const res = await githubFetch(path, token);
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }
  return res.json() as Promise<GithubRepo[]>;
}

/** List GitHub orgs for the authenticated user */
export async function listGithubOrgs(token: string): Promise<GithubOrg[]> {
  const res = await githubFetch("/user/orgs?per_page=100", token);
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }
  return res.json() as Promise<GithubOrg[]>;
}

/** Create a private GitHub repo */
export async function createGithubRepo(
  token: string,
  opts: CreateRepoOpts
): Promise<GithubRepo> {
  const body = {
    name: opts.name,
    description: opts.description || "dotk vault",
    private: true,
    auto_init: false,
  };

  const path = opts.org
    ? `/orgs/${encodeURIComponent(opts.org)}/repos`
    : "/user/repos";

  const res = await githubFetch(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to create repo: ${res.status} ${(err as any).message || ""}`
    );
  }

  return res.json() as Promise<GithubRepo>;
}
