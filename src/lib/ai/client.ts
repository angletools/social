import Anthropic from "@anthropic-ai/sdk";

/** Main model for the assistant and reports. Override with AI_MODEL. */
export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";
/** Model for bulk per-mention classification. Override with AI_ENRICH_MODEL (e.g. claude-haiku-5-5 to cut cost). */
export const AI_ENRICH_MODEL = process.env.AI_ENRICH_MODEL ?? AI_MODEL;



let client: Anthropic | null = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getAI(): Anthropic | null {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ maxRetries: 0, timeout: 120_000 });
  return client;
}

/** Automatic fallback calls are disabled so one reservation covers one request. */
export function fallbackParams(model: string) {
  void model;
  return { betas: [] as string[] };
}
