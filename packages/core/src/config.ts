import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "smol-toml";
import type { DotkConfig, ServiceConfig, MemberConfig, HooksConfig } from "./types.js";

const DEFAULT_CONFIG: DotkConfig = {
  vault: { version: 1 },
  services: {},
  members: {},
  settings: { default_environment: "development" },
};

/** Read dotk.toml from disk */
export async function readConfig(path: string): Promise<DotkConfig> {
  const content = await readFile(path, "utf-8");
  const raw = parse(content) as Record<string, unknown>;

  return {
    vault: (raw.vault as DotkConfig["vault"]) ?? { version: 1 },
    services: (raw.services as Record<string, ServiceConfig>) ?? {},
    members: (raw.members as Record<string, MemberConfig>) ?? {},
    settings: (raw.settings as DotkConfig["settings"]) ?? {
      default_environment: "development",
    },
    hooks: (raw.hooks as HooksConfig) ?? undefined,
  };
}

/** Write dotk.toml to disk */
export async function writeConfig(
  path: string,
  config: DotkConfig
): Promise<void> {
  const content = stringify(config as unknown as Record<string, unknown>);
  await writeFile(path, content, "utf-8");
}

/** Create a default config */
export function createDefaultConfig(): DotkConfig {
  return structuredClone(DEFAULT_CONFIG);
}

/** Add a service to config */
export function addService(
  config: DotkConfig,
  name: string,
  service: ServiceConfig
): DotkConfig {
  return {
    ...config,
    services: { ...config.services, [name]: service },
  };
}

/** Add a member to config */
export function addMember(
  config: DotkConfig,
  name: string,
  member: MemberConfig
): DotkConfig {
  return {
    ...config,
    members: { ...config.members, [name]: member },
  };
}
