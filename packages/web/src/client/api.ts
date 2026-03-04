const BASE = "/api";

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

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
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
};
