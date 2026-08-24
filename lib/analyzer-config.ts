import type { ReleaseRule } from "@semantic-release/commit-analyzer";

const ANALYZER_PACKAGE = "@semantic-release/commit-analyzer";

function pluginName(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0];
  return null;
}

interface ResolvedAnalyzerConfig {
  config: import("@semantic-release/commit-analyzer").CommitAnalyzerConfig;
  source: "explicit" | "releaserc" | "default";
}

/**
 * Find the commit-analyzer's own configuration from the full semantic-release
 * options, so this plugin parses and classifies commits exactly like the
 * analyzer the consumer already configured (preset, parserOpts, releaseRules).
 *
 * Precedence: pluginConfig.analyzerConfig > analyzer entry in .releaserc > {}.
 */
export function resolveAnalyzerConfig(
  pluginConfig: { analyzerConfig?: import("@semantic-release/commit-analyzer").CommitAnalyzerConfig } = {},
  context: { options?: { plugins?: unknown[] } } = {}
): ResolvedAnalyzerConfig {
  if (pluginConfig.analyzerConfig) {
    return { config: pluginConfig.analyzerConfig, source: "explicit" };
  }

  const plugins = context?.options?.plugins;
  if (Array.isArray(plugins)) {
    for (const entry of plugins) {
      if (pluginName(entry) === ANALYZER_PACKAGE) {
        const cfg = Array.isArray(entry) && typeof entry[1] === "object" ? (entry[1] as Record<string, never>) : {};
        return { config: cfg as ResolvedAnalyzerConfig["config"], source: "releaserc" };
      }
    }
  }

  return { config: {}, source: "default" };
}

export interface PosthogRuntimeOptions {
  token: string | undefined;
  projectId: number | undefined;
  host: string;
  scope: "project" | "organization";
  emoji: string | undefined;
  emojiMap: Record<string, string> | undefined;
  maxFeatures: number;
  maxSubjects: number | undefined;
  maxSubjectLength: number | undefined;
  subjectsJoiner: string | undefined;
  contentTemplate: string | undefined;
  format: "single-line" | "multi-line";
  include:
    | {
        version?: boolean;
        releaseType?: boolean;
        subjects?: boolean;
        breakingChanges?: boolean;
        environment?: boolean;
        links?: boolean;
      }
    | undefined;
  skipPatch: boolean;
  dryRun: boolean;
  debug: boolean;
  optional: boolean;
  environment: string | undefined;
  privacy:
    | {
        patterns?: RegExp[];
        replacement?: string;
        disableDefaults?: boolean;
      }
    | undefined;
  idempotency: {
    enabled: boolean;
    strategy: "version" | "version-environment";
  };
}

export function resolvePosthogOptions(
  pluginConfig: Record<string, unknown> | object = {},
  context: { env?: Record<string, string | undefined> } = {}
): PosthogRuntimeOptions {
  const cfg = pluginConfig as Record<string, unknown>;
  const env = context.env ?? process.env;
  const rawProjectId =
    (cfg.projectId as number | undefined) ??
    (env.POSTHOG_PROJECT_ID ? Number(env.POSTHOG_PROJECT_ID) : undefined);
  return {
    token: env.POSTHOG_TOKEN,
    projectId: Number.isFinite(rawProjectId) ? rawProjectId : undefined,
    host: ((cfg.host as string | undefined) ?? "https://us.posthog.com").replace(/\/+$/, ""),
    scope: (cfg.scope ?? "project") as PosthogRuntimeOptions["scope"],
    emoji: cfg.emoji as string | undefined,
    emojiMap: cfg.emojiMap as Record<string, string> | undefined,
    maxFeatures: (cfg.maxFeatures as number | undefined) ?? 3,
    maxSubjects: cfg.maxSubjects as number | undefined,
    maxSubjectLength: cfg.maxSubjectLength as number | undefined,
    subjectsJoiner: cfg.subjectsJoiner as string | undefined,
    contentTemplate: cfg.contentTemplate as string | undefined,
    format: (cfg.format as PosthogRuntimeOptions["format"] | undefined) ?? "single-line",
    include: cfg.include as PosthogRuntimeOptions["include"],
    skipPatch: Boolean(cfg.skipPatch),
    dryRun: Boolean(cfg.dryRun),
    debug: Boolean(cfg.debug),
    optional: Boolean(cfg.optional),
    environment: cfg.environment as string | undefined,
    privacy: cfg.privacy as PosthogRuntimeOptions["privacy"],
    idempotency: {
      enabled: (cfg.idempotency as { enabled?: boolean } | undefined)?.enabled ?? true,
      strategy:
        (cfg.idempotency as { strategy?: "version" | "version-environment" } | undefined)?.strategy ??
        "version-environment",
    },
  };
}

export type { ReleaseRule };
