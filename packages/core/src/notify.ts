import type { VaultChange } from "./git.js";
import { formatChangeSummary } from "./git.js";

/** Send a webhook notification (Slack/Discord compatible) */
export async function sendWebhook(
  url: string,
  changes: VaultChange[]
): Promise<boolean> {
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
