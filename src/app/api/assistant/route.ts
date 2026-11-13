import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/client";
import { ASSISTANT_TIMEOUT_MS, beginAssistantTurn } from "@/lib/ai/budget";
import { runAssistant, type AssistantEvent } from "@/lib/ai/assistant";
import { citedIds, followupsOf, type CitedPost, type ToolStep } from "@/lib/assistant-format";

export const maxDuration = 300;

const Body = z.object({ threadId: z.string().optional(), message: z.string().trim().min(1).max(4000) }).strict();

type StreamEvent = AssistantEvent | { type: "thread"; threadId: string } | { type: "posts"; posts: CitedPost[] } | { type: "followups"; items: string[] } | { type: "done"; threadId: string };

/** Loads cited mentions, scoped to the organization so an id from elsewhere can't leak a post. */
async function loadPosts(orgId: string, ids: string[]): Promise<CitedPost[]> {
  if (!ids.length) return [];
  const rows = await db.mention.findMany({
    where: { organizationId: orgId, id: { in: ids } },
    select: { id: true, platform: true, text: true, url: true, authorHandle: true, authorName: true, authorFollowers: true, publishedAt: true, sentiment: true },
  });
  return rows.map((r) => ({ ...r, text: r.text.slice(0, 600), publishedAt: r.publishedAt.toISOString() }));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!aiEnabled()) return Response.json({ error: "ai_disabled" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  let thread = parsed.data.threadId
    ? await db.assistantThread.findFirst({ where: { id: parsed.data.threadId, userId: user.id, organizationId: user.organizationId } })
    : null;
  if (parsed.data.threadId && !thread) return Response.json({ error: "not_found" }, { status: 404 });
  let turn;
  try { turn = await beginAssistantTurn(user.organizationId, user.id); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 429 }); }
  const abort = new AbortController();
  const signal = AbortSignal.any([req.signal, abort.signal, AbortSignal.timeout(ASSISTANT_TIMEOUT_MS)]);
  const authorize = async () => {
    signal.throwIfAborted();
    const current = await getCurrentUser();
    if (!current || current.id !== user.id || current.organizationId !== user.organizationId) throw new Error("FORBIDDEN");
  };
  try {
  thread ??= await db.assistantThread.create({
    data: { organizationId: user.organizationId, userId: user.id, title: parsed.data.message.slice(0, 80) },
  });
  await db.assistantMessage.create({
    data: { threadId: thread.id, role: "user", text: parsed.data.message, content: [{ type: "text", text: parsed.data.message }] },
  });
  const history = await db.assistantMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const threadId = thread.id;
  const orgId = user.organizationId;

  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {

      const send = (e: StreamEvent) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
          abort.abort();
        }
      };
      send({ type: "thread", threadId });
      // Cited posts are resolved as soon as their marker has streamed, so the card fills in
      // while the rest of the answer is still being written.
      const steps: ToolStep[] = [];
      const posts = new Map<string, CitedPost>();
      const asked = new Set<string>();
      const pending: Promise<void>[] = [];
      let text = "";
      const resolveCitations = () => {
        const fresh = citedIds(text).filter((id) => !asked.has(id)).slice(0, Math.max(0, 4 - asked.size));
        if (signal.aborted) return;
        if (!fresh.length) return;
        fresh.forEach((id) => asked.add(id));
        pending.push(
          authorize().then(() => loadPosts(orgId, fresh)).then((found) => {
            if (signal.aborted) return;
            found.forEach((p) => posts.set(p.id, p));
            if (found.length) send({ type: "posts", posts: found });
          }).catch(() => { abort.abort(); }),
        );
      };
      try {
        const reply = await runAssistant({
          orgId, signal, authorize,
          brandContext: user.organization.brandContext,
          history: history.reverse().map((m) => ({ role: m.role as "user" | "assistant", text: m.text })),
          emit: (e) => {
            if (e.type === "text") {
              text += e.text;
              if (e.text.includes("]")) resolveCitations();
            } else if (e.type === "tool") steps.push({ name: e.name, days: e.days, n: e.n });
            send(e);
          },
        });
        await authorize();
        text = reply || text;
        resolveCitations();
        await Promise.all(pending);
        await authorize();
        const followups = followupsOf(text);
        if (followups.length) send({ type: "followups", items: followups });
        if (reply) {
          await db.assistantMessage.create({
            data: {
              threadId,
              role: "assistant",
              text: reply,
              content: [{ type: "text", text: reply }],
              meta: { steps, posts: citedIds(reply).map((id) => posts.get(id)).filter(Boolean), followups } as object,
            },
          });
        }
        await db.assistantThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
        await db.assistantTurn.update({ where: { id: turn.id }, data: { status: "COMPLETE" } });
        send({ type: "done", threadId });
      } catch (e) {
        await db.assistantTurn.update({ where: { id: turn.id }, data: { status: signal.aborted ? "CANCELED" : "FAILED" } });
        const message = e instanceof Error && e.message.startsWith("AI_") ? e.message : "failed";
        if (!signal.aborted) console.error("assistant error", message);
        send({ type: "error", message });
        send({ type: "done", threadId });
      } finally {
        if (!closed) controller.close();
        closed = true;
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
  } catch (e) {
    abort.abort();
    await db.assistantTurn.update({ where: { id: turn.id }, data: { status: "FAILED" } });
    throw e;
  }
}
