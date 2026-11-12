/**
 * Minimal, dependency-free client for the Monid HTTP API (https://api.monid.ai).
 * Mirrors the endpoints used by the official @monid-ai/cli:
 *   POST /v1/discover  { query, limit? }            -> candidate endpoints
 *   POST /v1/inspect   { provider, endpoint }       -> input schema, pricing
 *   POST /v1/run       { provider, endpoint, input: { body?, queryParams?, pathParams? } }
 *   GET  /v1/runs/:id                               -> run status + output
 *   GET  /v1/wallet/balance
 * Runs are paid, so POST /v1/run is never retried automatically.
 */

// Monid responses vary by endpoint; callers narrow what they read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export const TERMINAL = new Set(["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"]);

export type MonidRun = {
  runId: string;
  status: string;
  providerResponse?: { httpStatus?: number; data?: unknown; error?: unknown };
  output?: unknown;
  [k: string]: unknown;
};

export class MonidError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export class MonidClient {
  private baseUrl: string;

  constructor(
    private apiKey: string,
    baseUrl = process.env.MONID_API_BASE_URL ?? "https://api.monid.ai",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  static fromEnv() {
    const key = process.env.MONID_API_KEY?.trim();
    return key ? new MonidClient(key) : null;
  }

  private async request<T>(method: string, path: string, body?: unknown, retryable = method === "GET"): Promise<T> {
    const attempts = retryable ? 3 : 1;
    let lastErr: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-Monid-Client": "rasd@1",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(60_000),
        });
        const raw = res.status === 204 ? "" : await res.text();
        let data: Json;
        try {
          data = raw ? JSON.parse(raw) : undefined;
        } catch {
          /* non-JSON */
        }
        if (!res.ok) {
          // A failed run still returns a run body; surface it to the caller.
          if (path === "/v1/run" && data?.runId) return data as T;
          throw new MonidError(
            data?.error?.code ?? `HTTP_${res.status}`,
            data?.error?.message ?? data?.message ?? `Monid HTTP ${res.status}`,
            res.status,
          );
        }
        return data as T;
      } catch (e) {
        lastErr = e;
        if (e instanceof MonidError || i === attempts) break;
        await new Promise((r) => setTimeout(r, 250 * 2 ** (i - 1)));
      }
    }
    throw lastErr;
  }

  discover(query: string, limit = 5) {
    return this.request<Json>("POST", "/v1/discover", { query, limit }, true);
  }

  inspect(provider: string, endpoint: string) {
    return this.request<Json>("POST", "/v1/inspect", { provider, endpoint }, true);
  }

  balance() {
    return this.request<Json>("GET", "/v1/wallet/balance");
  }

  getRun(runId: string) {
    return this.request<MonidRun>("GET", `/v1/runs/${encodeURIComponent(runId)}`);
  }

  startRun(provider: string, endpoint: string, body: Record<string, unknown>) {
    return this.request<MonidRun>("POST", "/v1/run", { provider, endpoint, input: { body } });
  }

  /** Starts a run and polls until it reaches a terminal status. */
  async runAndWait(
    provider: string,
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs = 5 * 60_000,
    onStarted?: (runId: string) => Promise<void>,
  ) {
    const run = await this.startRun(provider, endpoint, body);
    await onStarted?.(run.runId);
    return this.waitForRun(run, timeoutMs);
  }

  /** Resume a paid run after a worker retry; never starts a second charge. */
  async waitForRun(run: MonidRun, timeoutMs = 5 * 60_000) {
    const deadline = Date.now() + timeoutMs;
    let delay = 2000;
    while (!TERMINAL.has(run.status)) {
      if (Date.now() > deadline) throw new MonidError("POLL_TIMEOUT", `Run ${run.runId} still ${run.status}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 15_000);
      run = await this.getRun(run.runId);
    }
    const httpStatus = run.providerResponse?.httpStatus ?? 0;
    if (run.status !== "COMPLETED" || httpStatus >= 400) {
      const detail = JSON.stringify(run.providerResponse?.error ?? run.status).slice(0, 300);
      throw new MonidError(`RUN_${run.status}`, `Monid run ${run.runId} ${run.status}: ${detail}`);
    }
    return run;
  }
}

/** Extracts the list of result items from a completed run, whatever its envelope. */
export function runItems(run: MonidRun): unknown[] {
  const out = run.providerResponse?.data ?? run.output;
  const visit = (v: unknown, depth = 0): unknown[] | null => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && depth < 3) {
      for (const k of ["items", "data", "results", "posts", "tweets", "videos", "output"]) {
        const found = visit((v as Record<string, unknown>)[k], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(out) ?? [];
}
