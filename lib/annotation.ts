export interface CreateAnnotationOptions {
  host: string;
  token: string;
  projectId: number;
}

export interface AnnotationPayload {
  content: string;
  date_marker: string;
  scope: string;
}

export interface RequestPolicy {
  /** Retry attempts after the first try fails, defaults to 2 (3 attempts total) */
  retries?: number;
  /** Base delay between retries in ms, doubles each attempt, defaults to 1000 */
  backoffMs?: number;
  /** Per-request timeout in ms, defaults to 10000 */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`PostHog API ${response.status}: ${body.slice(0, 200)}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  return response;
}

export async function createAnnotation(
  { host, token, projectId }: CreateAnnotationOptions,
  payload: AnnotationPayload,
  policy: RequestPolicy = {}
): Promise<unknown> {
  const retries = policy.retries ?? 2;
  const backoffMs = policy.backoffMs ?? 1000;
  const timeoutMs = policy.timeoutMs ?? 10_000;
  const base = host.replace(/\/+$/, "");
  const url = `${base}/api/projects/${projectId}/annotations/`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      const response = await postJson(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return await response.json();
    } catch (err) {
      lastError = err;
      // Client errors are deterministic — retrying will not help.
      if (typeof (err as { status?: number }).status === "number" && (err as { status: number }).status < 500) {
        throw err;
      }
    }
  }
  throw lastError;
}

export interface AnnotationQueryOptions {
  host: string;
  token: string;
  projectId: number;
}

/**
 * Fetch the most recent annotations so callers can detect duplicates
 * before creating one. Returns `results` from the PostHog API.
 */
export async function listRecentAnnotations(
  { host, token, projectId }: AnnotationQueryOptions,
  limit = 20
): Promise<{ id: number; content: string; date_marker?: string }[]> {
  const base = host.replace(/\/+$/, "");
  const response = await fetch(
    `${base}/api/projects/${projectId}/annotations/?limit=${limit}&order=-created_at`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PostHog API ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as { results?: { id: number; content: string; date_marker?: string }[] };
  return data.results ?? [];
}
