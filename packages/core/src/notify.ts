import type { VaultChange } from "./git.js";
import { formatChangeSummary } from "./git.js";

/** Allowed webhook host patterns */
const ALLOWED_WEBHOOK_HOSTS = [
  /^hooks\.slack\.com$/,
  /^discord\.com$/,
  /^discordapp\.com$/,
];

/** Send a webhook notification (Slack/Discord compatible) */
export async function sendWebhook(
  url: string,
  changes: VaultChange[]
): Promise<boolean> {
  // Validate webhook URL against allow-list to prevent SSRF
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!ALLOWED_WEBHOOK_HOSTS.some((re) => re.test(parsed.hostname))) return false;
  } catch {
    return false;
  }

  const summary = formatChangeSummary(changes);
  if (!summary) return false;

  const text = `🔑 *dotk* secrets updated\n${summary}`;

  // Detect Slack vs Discord by URL
  const isDiscord = url.includes("discord.com");
  const body = isDiscord
    ? JSON.stringify({ content: text })
    : JSON.stringify({ text });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
