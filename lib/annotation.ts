export interface NextReleaseLike {
  type?: string;
  version?: string;
  gitTag?: string;
}

export interface CreateAnnotationOptions {
  host: string;
  token: string;
  projectId: number;
}

const TYPE_EMOJI: Record<string, string> = {
  major: "💥",
  premajor: "💥",
  minor: "🚀",
  preminor: "🚀",
  patch: "🩹",
  prepatch: "🩹",
  prerelease: "🏷️",
};

function emojiFor(type: string | undefined, override: string | undefined): string {
  if (override) return override;
  return TYPE_EMOJI[type ?? ""] ?? "🚀";
}

export function buildAnnotationContent(
  nextRelease: NextReleaseLike,
  subjects: string[],
  { maxFeatures = 3, emoji }: { maxFeatures?: number; emoji?: string } = {}
): string {
  const type = nextRelease.type ?? "release";
  const version = nextRelease.version ? `v${nextRelease.version}` : (nextRelease.gitTag ?? "unreleased");
  const em = emojiFor(type, emoji);

  let list = "";
  if (subjects.length > 0) {
    const shown = subjects.slice(0, maxFeatures).map((s) => s.trim().slice(0, 80));
    list = ` — ${shown.join("; ")}`;
    const hidden = subjects.length - shown.length;
    if (hidden > 0) list += `, +${hidden} more`;
  }

  return `${em} ${version} · ${type}${list}`;
}

export interface AnnotationPayload {
  content: string;
  date_marker: string;
  scope: string;
}

export async function createAnnotation(
  { host, token, projectId }: CreateAnnotationOptions,
  payload: AnnotationPayload
): Promise<unknown> {
  const base = host.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/projects/${projectId}/annotations/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PostHog API ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}
