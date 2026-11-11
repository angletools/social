/**
 * The assistant's answer format, shared by the API route (server) and the chat (client).
 *
 * The model cites posts with `[[post:<mention id>]]` on their own line and ends with up to
 * two `[[followup:<question>]]` lines. The app renders cited posts as cards and follow-ups
 * as chips; the markers never show as text.
 */

export type ToolStep = { name: string; days?: number; n?: number };

export type CitedPost = {
  id: string;
  platform: string;
  text: string;
  url: string | null;
  authorHandle: string | null;
  authorName: string | null;
  authorFollowers: number | null;
  publishedAt: string;
  sentiment: string | null;
};

export type AssistantMeta = { steps?: ToolStep[]; posts?: CitedPost[]; followups?: string[] };

const POST_RE = /\[\[post:([a-z0-9]{8,40})\]\]/gi;
const FOLLOWUP_RE = /\[\[followup:([^\]\n]{2,200})\]\]/gi;

/** Mention ids cited in an answer, in order, without repeats. */
export function citedIds(text: string) {
  return [...new Set([...text.matchAll(POST_RE)].map((m) => m[1]))].slice(0, 8);
}

export function followupsOf(text: string) {
  return [...text.matchAll(FOLLOWUP_RE)].map((m) => m[1].trim()).filter(Boolean).slice(0, 3);
}

export type Segment = { type: "md"; text: string } | { type: "posts"; ids: string[] };

/**
 * Splits an answer into markdown and post-card groups. Follow-up markers are dropped, and
 * a marker still being streamed at the end is hidden until it completes.
 */
export function segmentAnswer(text: string): Segment[] {
  const clean = text.replace(FOLLOWUP_RE, "").replace(/\[\[[^\]\n]*\]?$/, "");
  const out: Segment[] = [];
  let md: string[] = [];
  const flush = () => {
    const s = md.join("\n").trim();
    if (s) out.push({ type: "md", text: s });
    md = [];
  };
  for (const line of clean.split("\n")) {
    const ids = [...line.matchAll(POST_RE)].map((m) => m[1]);
    const rest = line.replace(POST_RE, "").trim();
    if (ids.length && !rest.replace(/^[-*•]\s*/, "")) {
      flush();
      const last = out.at(-1);
      if (last?.type === "posts") last.ids.push(...ids.filter((id) => !last.ids.includes(id)));
      else out.push({ type: "posts", ids });
    } else md.push(line.replace(POST_RE, "").replace(/\s{2,}/g, " "));
  }
  flush();
  return out;
}

/** Strips markers for places that show plain text (thread titles, previews). */
export const plainAnswer = (text: string) => text.replace(POST_RE, "").replace(FOLLOWUP_RE, "").trim();

export type DotTable = { head: string[]; rows: string[][]; bar: number; max: number };

const num = (s: string) => {
  const m = s.replace(/[,٬\s]/g, "").replace("−", "-").match(/^[+-]?\d+(\.\d+)?%?$/);
  return m ? Number(m[0].replace("%", "")) : null;
};

/**
 * Reads a GFM table and decides whether it can be drawn as the board's dotted-bar table:
 * a label column, then a column of non-negative numbers to draw as bars.
 */
export function parseTable(md: string): DotTable | null {
  const lines = md.trim().split("\n").map((l) => l.trim());
  if (lines.length < 3 || !/^\|?\s*:?-{2,}/.test(lines[1])) return null;
  const cells = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/\*\*/g, ""));
  const head = cells(lines[0]);
  const rows = lines.slice(2).filter((l) => l.includes("|")).map(cells);
  if (head.length < 2 || head.length > 5 || rows.length === 0 || rows.length > 12) return null;
  for (let c = 1; c < head.length; c++) {
    const vals = rows.map((r) => (r[c] ? num(r[c]) : null));
    const signed = rows.some((r) => /^[+\-−]/.test(r[c] ?? ""));
    if (!signed && vals.every((v) => v !== null && v >= 0)) {
      return { head, rows: rows.map((r) => head.map((_, i) => r[i] ?? "")), bar: c, max: Math.max(1, ...(vals as number[])) };
    }
  }
  return null;
}

export const cellNumber = num;
