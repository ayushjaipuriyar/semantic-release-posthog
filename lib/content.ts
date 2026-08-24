export interface NextReleaseLike {
  type?: string;
  version?: string;
  gitTag?: string;
}

export interface ContentOptions {
  /** Annotation layout, defaults to "single-line" */
  format?: "single-line" | "multi-line";
  /** Force a single emoji instead of the type-based default */
  emoji?: string;
  /** Per-release-type emoji overrides, e.g. { minor: "✨" } */
  emojiMap?: Record<string, string>;
  /**
   * Custom single-line template. Tokens: {emoji} {version} {type} {subjects}.
   * When omitted, a sensible default layout is composed from `include`.
   */
  contentTemplate?: string;
  /** Delimiter between subjects, defaults to "; " */
  subjectsJoiner?: string;
  /** Max characters per subject, defaults to 80 */
  maxSubjectLength?: number;
  /** Max subjects listed before truncation (preferred over legacy maxFeatures) */
  maxSubjects?: number;
  /** Legacy alias of maxSubjects */
  maxFeatures?: number;
  /** Toggle individual parts of the layout */
  include?: {
    version?: boolean;
    releaseType?: boolean;
    subjects?: boolean;
    /** Show Breaking changes section (default: shown when data exists) */
    breakingChanges?: boolean;
    /** Show Deployment section (default: hidden) */
    environment?: boolean;
    /** Show Links section (default: hidden) */
    links?: boolean;
  };
}

export interface DeploymentInfo {
  environment?: string;
  provider?: string;
  url?: string;
  region?: string;
}

export interface CommitRange {
  from?: string;
  to?: string;
}

export interface RichAnnotationInput {
  release: NextReleaseLike;
  subjects: string[];
  breakingChanges?: string[];
  commitRange?: CommitRange;
  /** e.g. https://github.com/acme/widget.git */
  repositoryUrl?: string;
  environment?: DeploymentInfo;
}

/** Convert a git remote URL into a browsable web URL (no .git suffix). */
export function repositoryWebUrl(repositoryUrl: string): string {
  let url = repositoryUrl.trim().replace(/\/+$/, "");
  url = url.replace(/\.git$/i, "");
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  const sshProto = url.replace(/^git\+ssh:\/\//, "ssh://");
  const sshUrl = sshProto.match(/^ssh:\/\/(?:[^@]+@)?([^/]+)\/(.+)$/);
  if (sshUrl) return `https://${sshUrl[1]}/${sshUrl[2]}`;
  return url.replace(/^git\+https:\/\//, "https://");
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

export function resolveEmoji(
  type: string | undefined,
  opts: Pick<ContentOptions, "emoji" | "emojiMap"> = {}
): string {
  if (opts.emoji) return opts.emoji;
  const mapped = opts.emojiMap?.[type ?? ""];
  return mapped ?? TYPE_EMOJI[type ?? ""] ?? "🚀";
}

export function versionLabelOf(release: NextReleaseLike): string {
  return release.version ? `v${release.version}` : (release.gitTag ?? "unreleased");
}

interface ResolvedContentOptions {
  joiner: string;
  maxSubjectLength: number;
  maxSubjects: number;
  template: string | undefined;
  includeVersion: boolean;
  includeType: boolean;
  includeSubjects: boolean;
  includeBreaking: boolean;
  includeEnvironment: boolean;
  includeLinks: boolean;
}

function resolveContentOptions(opts: ContentOptions): ResolvedContentOptions {
  const maxSubjects =
    opts.maxSubjects ?? (opts.maxFeatures !== undefined ? opts.maxFeatures : 3);
  return {
    joiner: opts.subjectsJoiner ?? "; ",
    maxSubjectLength: opts.maxSubjectLength ?? 80,
    maxSubjects,
    template: opts.contentTemplate,
    includeVersion: opts.include?.version ?? true,
    includeType: opts.include?.releaseType ?? true,
    includeSubjects: opts.include?.subjects ?? true,
    includeBreaking: opts.include?.breakingChanges ?? true,
    includeEnvironment: opts.include?.environment ?? false,
    includeLinks: opts.include?.links ?? false,
  };
}

export function buildAnnotationContent(
  nextRelease: NextReleaseLike,
  subjects: string[],
  options: ContentOptions = {}
): string {
  const o = resolveContentOptions(options);
  const type = nextRelease.type ?? "release";
  const versionLabel = versionLabelOf(nextRelease);
  const em = resolveEmoji(type, options);

  let rendered = "";
  if (subjects.length > 0 && o.includeSubjects) {
    const shown = subjects
      .slice(0, o.maxSubjects)
      .map((s) => s.trim().slice(0, o.maxSubjectLength));
    rendered = shown.join(o.joiner);
    const hidden = subjects.length - shown.length;
    if (hidden > 0) rendered += `, +${hidden} more`;
  }

  if (o.template) {
    return o.template
      .replaceAll("{emoji}", em)
      .replaceAll("{version}", o.includeVersion ? versionLabel : "")
      .replaceAll("{type}", o.includeType ? type : "")
      .replaceAll("{subjects}", rendered);
  }

  const head = [o.includeVersion ? versionLabel : "", o.includeType ? type : ""]
    .filter(Boolean)
    .join(" · ");
  const listSuffix = rendered ? ` — ${rendered}` : "";
  return `${em} ${head}${listSuffix}`;
}

interface RenderedList {
  bullets: string;
  hidden: number;
}

function renderBulletList(
  items: string[],
  maxItems: number,
  maxLength: number
): RenderedList {
  if (items.length === 0) return { bullets: "", hidden: 0 };
  const shown = items.slice(0, maxItems).map((s) => s.trim().slice(0, maxLength));
  const hidden = items.length - shown.length;
  let bullets = shown.join("\n• ");
  if (hidden > 0) bullets += `, +${hidden} more`;
  return { bullets: `• ${bullets}`, hidden };
}

function renderDeploymentSection(environment: DeploymentInfo): string {
  const rows: string[] = [];
  if (environment.environment) rows.push(`• Environment: ${environment.environment}`);
  if (environment.provider) rows.push(`• Provider: ${environment.provider}`);
  if (environment.region) rows.push(`• Region: ${environment.region}`);
  if (environment.url) rows.push(`• URL: ${environment.url}`);
  return rows.length > 0 ? `Deployment\n${rows.join("\n")}` : "";
}

function renderLinksSection(input: RichAnnotationInput): string {
  const links: string[] = [];
  const repoUrl = input.repositoryUrl ? repositoryWebUrl(input.repositoryUrl) : undefined;
  const { from, to } = input.commitRange ?? {};
  if (repoUrl && from && to) links.push(`• Compare: ${repoUrl}/compare/${from}...${to}`);
  const tag = input.release.gitTag ?? (input.release.version ? `v${input.release.version}` : undefined);
  if (repoUrl && tag) links.push(`• Release: ${repoUrl}/releases/tag/${tag}`);
  return links.length > 0 ? `Links\n${links.join("\n")}` : "";
}

/**
 * Build a multi-line annotation with optional sections:
 * Changes, Breaking changes, Deployment, Links.
 */
export function buildRichAnnotation(
  input: RichAnnotationInput,
  options: ContentOptions = {}
): string {
  const o = resolveContentOptions(options);
  const type = input.release.type ?? "release";
  const versionLabel = versionLabelOf(input.release);
  const em = resolveEmoji(type, options);

  const head = [o.includeVersion ? versionLabel : "", o.includeType ? type : ""]
    .filter(Boolean)
    .join(" · ");
  const lines: string[] = [`${em} ${head}`];

  if (o.includeSubjects && input.subjects.length > 0) {
    const { bullets } = renderBulletList(input.subjects, o.maxSubjects, o.maxSubjectLength);
    if (bullets) lines.push("", "Changes", bullets);
  }

  if (o.includeBreaking && (input.breakingChanges?.length ?? 0) > 0) {
    const { bullets } = renderBulletList(input.breakingChanges ?? [], o.maxSubjects, o.maxSubjectLength);
    if (bullets) lines.push("", "Breaking changes", bullets);
  }

  if (o.includeEnvironment && input.environment) {
    const section = renderDeploymentSection(input.environment);
    if (section) lines.push("", section);
  }

  if (o.includeLinks) {
    const section = renderLinksSection(input);
    if (section) lines.push("", section);
  }

  return lines.join("\n");
}
