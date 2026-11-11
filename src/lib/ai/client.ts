import Anthropic from "@anthropic-ai/sdk";

/** Main model for the assistant and reports. Override with AI_MODEL. */
export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";
/** Model for bulk per-mention classification. Override with AI_ENRICH_MODEL (e.g. claude-haiku-5-5 to cut cost). */
export const AI_ENRICH_MODEL = process.env.AI_ENRICH_MODEL ?? AI_MODEL;

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"]);

let client: Anthropic | null = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getAI(): Anthropic | null {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ maxRetries: 3 });
  return client;
}

/**
 * Server-side refusal fallback: if the model declines a request, the API
 * re-runs it on a fallback model within the same call.
 */
export function fallbackParams(model: string) {
  return FALLBACK_MODELS.has(model)
    ? { betas: ["server-side-fallback-2026-07-01"] as string[], fallbacks: "default" as const }
    : { betas: [] as string[] };
}
