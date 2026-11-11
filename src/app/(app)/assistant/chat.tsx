"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2 } from "lucide-react";
import { AiMark } from "@/components/ai-mark";
import type { Dict } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; tools?: string[]; error?: boolean };

export function Chat({ threadId: initialThread, initial, enabled, t }: { threadId?: string; initial: Msg[]; enabled: boolean; t: Dict["assistant"] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState(initialThread);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);

  const update = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "", tools: [] }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue;
          const e = JSON.parse(raw.slice(6));
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text }));
          else if (e.type === "tool") update((m) => ({ ...m, tools: [...(m.tools ?? []), e.name] }));
          else if (e.type === "error") update((m) => ({ ...m, error: true }));
          else if (e.type === "done" && e.threadId !== threadId) {
            setThreadId(e.threadId);
            window.history.replaceState(null, "", `/assistant?thread=${e.threadId}`);
          }
        }
      }
    } catch {
      update((m) => ({ ...m, error: true }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="card flex min-h-[70vh] flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-8">
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
            <AiMark size="lg" className="mb-5" />
            <h2 className="text-[17px] font-semibold">{t.subtitle}</h2>
            {!enabled && <p className="mt-4 rounded-xl bg-sand-50 px-4 py-3 text-sm text-sand-700">{t.disabled}</p>}
            <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
              {t.suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  disabled={!enabled}
                  onClick={() => ask(s)}
                  className="rounded-xl border border-line bg-surface px-4 py-3 text-start text-[13.5px] leading-relaxed text-ink/85 transition hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div dir="auto" className="max-w-[85%] rounded-2xl rounded-ee-md bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <AiMark size="md" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                {m.tools && m.tools.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {[...new Set(m.tools)].map((tool) => (
                      <span key={tool} className="chip">
                        {(t.tools as Record<string, string>)[tool] ?? tool}
                      </span>
                    ))}
                  </div>
                )}
                {m.text ? (
                  <div dir="auto" className="prose-chat text-[15px] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                ) : busy && i === messages.length - 1 ? (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.thinking}
                  </p>
                ) : null}
                {m.error && <p className="mt-2 text-sm text-neg">{t.error}</p>}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-line p-4"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            disabled={!enabled}
            placeholder={t.placeholder}
            dir="auto"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
          />
          <button type="submit" disabled={!enabled || busy || !input.trim()} className={cn("btn-primary h-10 w-10 p-0")} aria-label={t.send}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
