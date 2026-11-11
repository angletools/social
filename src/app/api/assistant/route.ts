import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/client";
import { runAssistant, type AssistantEvent } from "@/lib/ai/assistant";

export const maxDuration = 300;

const Body = z.object({ threadId: z.string().optional(), message: z.string().trim().min(1).max(4000) });

// Simple per-user rate limit: 30 questions / 10 minutes.
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!aiEnabled()) return Response.json({ error: "ai_disabled" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 30) return Response.json({ error: "rate_limited" }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  let thread = parsed.data.threadId
    ? await db.assistantThread.findFirst({ where: { id: parsed.data.threadId, userId: user.id } })
    : null;
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

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AssistantEvent | { type: "done"; threadId: string }) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const reply = await runAssistant({
          orgId: user.organizationId,
          brandContext: user.organization.brandContext,
          history: history.reverse().map((m) => ({ role: m.role as "user" | "assistant", text: m.text })),
          emit: send,
        });
        if (reply) {
          await db.assistantMessage.create({
            data: { threadId, role: "assistant", text: reply, content: [{ type: "text", text: reply }] },
          });
        }
        await db.assistantThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
        send({ type: "done", threadId });
      } catch (e) {
        console.error("assistant error", e);
        send({ type: "error", message: "failed" });
        send({ type: "done", threadId });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
