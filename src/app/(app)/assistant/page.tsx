import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { aiEnabled } from "@/lib/ai/client";
import { cn, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { Chat } from "./chat";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { thread: threadId } = await searchParams;
  const threads = await db.assistantThread.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30 });
  const messages = threadId
    ? await db.assistantMessage.findMany({ where: { threadId, thread: { userId: user.id } }, orderBy: { createdAt: "asc" } })
    : [];

  return (
    <>
      <PageHeader title={t.assistant.title} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="hidden lg:block">
          <Link href="/assistant" className="btn-primary mb-4 w-full">
            <MessageSquarePlus className="h-4 w-4" /> {t.assistant.newChat}
          </Link>
          {threads.length > 0 && <h3 className="mb-2 px-2 text-xs font-medium text-muted">{t.assistant.history}</h3>}
          <ul className="space-y-1">
            {threads.map((th) => (
              <li key={th.id}>
                <Link
                  href={`/assistant?thread=${th.id}`}
                  className={cn("block rounded-xl px-3 py-2 text-sm hover:bg-surface", th.id === threadId && "bg-surface ring-1 ring-line")}
                >
                  <span dir="auto" className="line-clamp-1">{th.title}</span>
                  <span className="text-xs text-muted">{timeAgo(th.updatedAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <Chat
          key={threadId ?? "new"}
          threadId={threadId}
          enabled={aiEnabled()}
          initial={messages.map((m) => ({ role: m.role as "user" | "assistant", text: m.text }))}
          t={t.assistant}
        />
      </div>
    </>
  );
}
