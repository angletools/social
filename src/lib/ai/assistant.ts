import { EVIDENCE_RULE, withAIUsage } from "./budget";
import type { BetaMessageParam, BetaToolResultBlockParam, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AI_MODEL, getAI } from "./client";
import { assistantTools } from "./tools";
import { DIALECT_GUIDE } from "./dialect";
import type { ToolStep } from "../assistant-format";

const SYSTEM = `You are angle social's analyst assistant. You help communications, marketing and customer-experience teams at a Saudi company understand what people say about them on social media. Most users are not technical.

How to work:
- Answer from the organization's data. Use the tools to get numbers and read real posts before drawing conclusions; never invent figures or posts.
- Reply in the language the user writes in. Arabic replies use clear Modern Standard Arabic; keep brand names as written.
- Lead with the answer in one or two sentences, then supporting points. Keep it short and scannable: short paragraphs or bullet lists, numbers with context ("up 40% vs last week"). Use markdown sparingly (bold, bullets); no tables wider than 4 columns.
- When you quote or point to a specific post, cite it on its own line as [[post:ID]], using the post's id from search_mentions (for example [[post:cmw3x9k2a0001]]). The app shows each cited post as a card with the author, platform and a link, so don't repeat the whole post. Cite at most 4 posts, two in a row reads best. Never invent an id.
- To compare a few items by count, a small markdown table works well: the label in the first column, then a column of plain counts, optionally a change column like +12 or −3. The app draws the counts as bars.
- End every answer with one or two short follow-up questions the user could ask next, each on its own line as [[followup:question]], in the user's language. Make them specific to this answer.
- If asked to draft replies, write them in the language and tone of the original post, polite and on-brand, and never promise anything regulatory or financial.
- Read Arabic posts as a native Gulf speaker would: sarcasm, dialect slang and religious expressions change the meaning. When it helps a non-Arabic reader, explain what a phrase really means.
- For questions about how customers feel, what they complain about or what to fix first, start with get_customer_intelligence, then read real posts with search_mentions to back up the answer.
- For content ideas, use get_trending_formats and connect them to what customers are saying.
- If the data cannot answer the question, say so plainly and suggest what to track.`;

export type AssistantEvent =
  | { type: "text"; text: string }
  | ({ type: "tool" } & ToolStep)
  | { type: "error"; message: string };

/**
 * Runs one assistant turn with data tools, emitting text deltas and tool
 * activity. Returns the final reply text.
 */
export async function runAssistant(opts: {
  orgId: string;
  signal?: AbortSignal;
  authorize?: () => Promise<void>;
  brandContext?: string | null;
  history: { role: "user" | "assistant"; text: string }[];
  emit: (e: AssistantEvent) => void;
}): Promise<string> {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");

  const tools = assistantTools(opts.orgId, (step) => opts.emit({ type: "tool", ...step }));
  const history = opts.history.slice(-20);
  while (history.length > 1 && (history[0].role !== "user" || Buffer.byteLength(JSON.stringify(history)) > 60_000)) history.shift();
  const messages: BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.text }));
  const today = new Date().toISOString().slice(0, 10);
  const system = `${SYSTEM}\n\n${DIALECT_GUIDE}${opts.brandContext ? `\n\nAbout the company: ${opts.brandContext}` : ""}`;

  let finalText = "";
  // Explicit bounded rounds let each provider request reserve its own budget.
  for (let round = 0; round < 4; round++) {
    opts.signal?.throwIfAborted();
    await opts.authorize?.();
    const params: MessageCreateParamsNonStreaming = {
      model: AI_MODEL, max_tokens: 4000,
      system: [{ type: "text", text: `${system}\n\n${EVIDENCE_RULE}\nToday is ${today}.`, cache_control: { type: "ephemeral" } }],
      tools: tools.map(({ run, parse, ...definition }) => { void run; void parse; return definition; }),
      // Leave the last round for an answer; no tools may run after the bound.
      tool_choice: round === 3 ? { type: "none" } : { type: "auto" },
      messages,
    };
    let turnText = "";
    const message = await withAIUsage(opts.orgId, "assistant", params, async signal => {
      const stream = ai.beta.messages.stream(params, { signal, maxRetries: 0 });
      for await (const event of stream) {
        signal.throwIfAborted();
        await opts.authorize?.();
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (!turnText && finalText) { opts.emit({ type: "text", text: "\n\n" }); finalText += "\n\n"; }
          turnText += event.delta.text;
          finalText += event.delta.text;
          opts.emit({ type: "text", text: event.delta.text });
        }
      }
      return stream.finalMessage();
    }, opts.signal);
    if (message.stop_reason === "refusal") { opts.emit({ type: "error", message: "refusal" }); break; }
    if (message.stop_reason === "max_tokens") { opts.emit({ type: "error", message: "answer_limit" }); break; }
    const calls = message.content.filter(b => b.type === "tool_use");
    if (!calls.length || round === 3) break;
    if (calls.length > 6) throw new Error("AI_TOOL_LIMIT");
    messages.push({ role: "assistant", content: message.content });
    const results: BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      opts.signal?.throwIfAborted();
      await opts.authorize?.();
      const tool = tools.find(t => t.name === call.name);
      try {
        if (!tool) throw new Error("Unknown data tool");
        const value = await tool.run(tool.parse(call.input), { toolUse: call, toolUseBlock: call, signal: opts.signal });
        opts.signal?.throwIfAborted();
        const text = typeof value === "string" ? value : JSON.stringify(value);
        results.push({ type: "tool_result", tool_use_id: call.id, content: Buffer.byteLength(text) <= 24_000 ? text : JSON.stringify({ truncated: true, instruction: "Narrow the query; this is an incomplete preview.", preview: text.slice(0, 6000) }) });
      } catch (e) {
        opts.signal?.throwIfAborted();
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: e instanceof Error && e.message === "FORBIDDEN" ? "Access unavailable" : "This data query could not be completed." });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return finalText;
}
