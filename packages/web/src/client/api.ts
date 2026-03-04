const BASE = "/api";

// Read auth token from URL query parameter
const AUTH_TOKEN = new URLSearchParams(window.location.search).get("token") || "";

export interface ServiceInfo {
  name: string;
  description: string;
  environments: string[];
}

export interface SecretEntry {
  key: string;
  value: string;
  encrypted: boolean;
}

export interface MemberInfo {
  name: string;
  public_key: string;
  role: string;
}

export interface VaultConfig {
  vault: { version: number };
  services: Record<string, { description: string; environments: string[] }>;
  members: Record<string, { public_key: string; role: string }>;
  settings: { default_environment: string };
}

export interface SetupStatus {
  vault_initialized: boolean;
  vault_exists: boolean;
  has_remote: boolean;
  gh: { authenticated: boolean; username: string | null };
}

export interface GhAuthResult {
  authenticated: boolean;
  username: string;
  source: "gh_cli" | "pat";
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

export interface GithubOrg {
  login: string;
  avatar_url: string;
  description: string | null;
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      "X-Dotk-Token": AUTH_TOKEN,
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as any).error || `API error: ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return res.json();
}

export const api = {
  // Existing vault APIs
  getConfig: () => fetchJSON<VaultConfig>("/config"),
  getServices: () => fetchJSON<ServiceInfo[]>("/services"),
  getSecrets: (service: string, env: string) =>
    fetchJSON<SecretEntry[]>(`/services/${service}/${env}/secrets`),
  setSecret: (service: string, env: string, key: string, value: string) =>
    fetchJSON<{ ok: boolean }>(`/services/${service}/${env}/secrets`, {
      method: "POST",
      body: JSON.stringify({ key, value }),
    }),
  deleteSecret: (service: string, env: string, key: string) =>
    fetchJSON<{ ok: boolean }>(`/services/${service}/${env}/secrets/${key}`, {
      method: "DELETE",
    }),
  getMembers: () => fetchJSON<MemberInfo[]>("/members"),

  // Setup APIs
  getSetupStatus: () => fetchJSON<SetupStatus>("/setup/status"),
  authenticateGh: (pat?: string) =>
    fetchJSON<GhAuthResult>("/setup/gh/token", {
      method: "POST",
      body: JSON.stringify({ pat }),
    }),
  getGhRepos: (type?: "user" | "org", org?: string) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (org) params.set("org", org);
    const qs = params.toString();
    return fetchJSON<GithubRepo[]>(`/setup/gh/repos${qs ? `?${qs}` : ""}`);
  },
  getGhOrgs: () => fetchJSON<GithubOrg[]>("/setup/gh/orgs"),
  createGhRepo: (name: string, org?: string, description?: string) =>
    fetchJSON<GithubRepo>("/setup/gh/repos", {
      method: "POST",
      body: JSON.stringify({ name, org, description }),
    }),
  initVault: (repoUrl: string) =>
    fetchJSON<{ ok: boolean; publicKey: string }>("/setup/init", {
      method: "POST",
      body: JSON.stringify({ repoUrl }),
    }),
};
