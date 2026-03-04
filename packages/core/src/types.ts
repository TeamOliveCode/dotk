/** A single env entry — key + encrypted or plain value */
export interface EnvEntry {
  key: string;
  value: string;
  encrypted: boolean;
}

/** Parsed encrypted .env file */
export interface EncryptedEnvFile {
  publicKey: string;
  entries: EnvEntry[];
}

/** Service definition in dotk.toml */
export interface ServiceConfig {
  description: string;
  environments: string[];
}

/** Member definition in dotk.toml */
export interface MemberConfig {
  public_key: string;
  role: "admin" | "member";
}

/** Webhook hook configuration */
export interface HooksConfig {
  post_push_url?: string; // Slack/Discord webhook URL
}

/** Top-level dotk.toml config */
export interface DotkConfig {
  vault: {
    version: number;
  };
  services: Record<string, ServiceConfig>;
  members: Record<string, MemberConfig>;
  settings: {
    default_environment: string;
  };
  hooks?: HooksConfig;
}

/** Key pair for ECIES */
export interface KeyPair {
  privateKey: string; // hex
  publicKey: string; // hex (uncompressed)
}
