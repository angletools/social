import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { aiEnabled } from "@/lib/ai/client";
import { formatDate, timeAgo } from "@/lib/utils";
import { plainAnswer, type AssistantMeta } from "@/lib/assistant-format";
import { Chat, type Msg } from "./chat";
import { History } from "./history";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { thread: threadParam } = await searchParams;
  const [threads, current] = await Promise.all([
    db.assistantThread.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 40, select: { id: true, title: true, updatedAt: true } }),
    threadParam ? db.assistantThread.findFirst({ where: { id: threadParam, userId: user.id }, select: { id: true } }) : null,
  ]);
  const threadId = current?.id;
  const messages = threadId ? await db.assistantMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } }) : [];
  const tz = user.organization.timezone;
  const when = (d: Date) => (Date.now() - d.getTime() < 2 * 86400_000 ? timeAgo(d, locale) : formatDate(d, locale, { dateStyle: undefined, day: "numeric", month: "long" }, tz));

  const initial: Msg[] = messages.map((m) => {
    const meta = (m.meta ?? {}) as AssistantMeta;
    return { role: m.role as "user" | "assistant", text: m.text, steps: meta.steps, posts: meta.posts, followups: meta.followups };
  });

  const list = threads.map((th) => ({ id: th.id, title: plainAnswer(th.title), when: when(th.updatedAt) }));
  const deleteLabels = { confirm: t.common.confirmDelete, delete: t.common.delete };

  return (
    <div className="full-bleed flex min-h-[calc(100dvh-60px)] w-full md:min-h-0 md:flex-1">
      <History threads={list} current={threadId} t={t.assistantPage} deleteLabels={deleteLabels} />
      <Chat
        key={threadId ?? "new"}
        threadId={threadId}
        enabled={aiEnabled()}
        initial={initial}
        locale={locale}
        tz={tz}
        t={t.assistantPage}
        disabledLabel={t.assistant.disabled}
        errorLabel={t.assistant.error}
        history={{ threads: list, deleteLabels }}
      />
    </div>
  );
}
