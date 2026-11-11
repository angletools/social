import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AI_MODEL, fallbackParams, getAI } from "./client";
import { assistantTools } from "./tools";
import { DIALECT_GUIDE } from "./dialect";

const SYSTEM = `You are Rasd's analyst assistant. You help communications, marketing and customer-experience teams at a Saudi company understand what people say about them on social media. Most users are not technical.

How to work:
- Answer from the organization's data. Use the tools to get numbers and read real posts before drawing conclusions; never invent figures or posts.
- Reply in the language the user writes in. Arabic replies use clear Modern Standard Arabic; keep brand names as written.
- Lead with the answer in one or two sentences, then supporting points. Keep it short and scannable: short paragraphs or bullet lists, numbers with context ("up 40% vs last week"). Use markdown sparingly (bold, bullets); no tables wider than 4 columns.
- When you quote a post, quote briefly and say who posted it and on which platform.
- If asked to draft replies, write them in the language and tone of the original post, polite and on-brand, and never promise anything regulatory or financial.
- Read Arabic posts as a native Gulf speaker would: sarcasm, dialect slang and religious expressions change the meaning. When it helps a non-Arabic reader, explain what a phrase really means.
- For questions about how customers feel, what they complain about or what to fix first, start with get_customer_intelligence, then read real posts with search_mentions to back up the answer.
- For content ideas, use get_trending_formats and connect them to what customers are saying.
- If the data cannot answer the question, say so plainly and suggest what to track.`;

export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string };

/**
 * Runs one assistant turn with data tools, emitting text deltas and tool
 * activity. Returns the final reply text.
 */
export async function runAssistant(opts: {
  orgId: string;
  brandContext?: string | null;
  history: { role: "user" | "assistant"; text: string }[];
  emit: (e: AssistantEvent) => void;
}): Promise<string> {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");

  const tools = assistantTools(opts.orgId, (name) => opts.emit({ type: "tool", name }));
  const messages: BetaMessageParam[] = opts.history.map((m) => ({ role: m.role, content: m.text }));
  const today = new Date().toISOString().slice(0, 10);
  const system = `${SYSTEM}\n\n${DIALECT_GUIDE}${opts.brandContext ? `\n\nAbout the company: ${opts.brandContext}` : ""}`;

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const runner = ai.beta.messages.toolRunner({
    model: AI_MODEL,
    max_tokens: 64000,
    betas,
    ...fb,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium" },
    tools,
    max_iterations: 12,
    // Today's date goes last so the cached system prefix stays stable.
    messages: [...messages.slice(0, -1), { role: "user", content: `${messages.at(-1)?.content}\n\n(Today is ${today}.)` }],
    stream: true,
  });

  let finalText = "";
  for await (const messageStream of runner) {
    let turnText = "";
    for await (const event of messageStream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        // Separate text written before and after a round of tool calls.
        if (!turnText && finalText) {
          opts.emit({ type: "text", text: "\n\n" });
          finalText += "\n\n";
        }
        turnText += event.delta.text;
        finalText += event.delta.text;
        opts.emit({ type: "text", text: event.delta.text });
      }
    }
    const message = await messageStream.finalMessage();
    if (message.stop_reason === "refusal") {
      opts.emit({ type: "error", message: "refusal" });
      break;
    }
    if (message.stop_reason === "max_tokens" && message.content.some((b) => b.type === "tool_use")) break;
  }
  return finalText;
}

