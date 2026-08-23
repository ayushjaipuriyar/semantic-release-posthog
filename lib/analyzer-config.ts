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
  maxFeatures: number;
  optional: boolean;
}

export function resolvePosthogOptions(
  pluginConfig: { projectId?: number; host?: string; scope?: "project" | "organization"; emoji?: string; maxFeatures?: number; optional?: boolean } = {},
  context: { env?: Record<string, string | undefined> } = {}
): PosthogRuntimeOptions {
  const env = context.env ?? process.env;
  const rawProjectId = pluginConfig.projectId ?? (env.POSTHOG_PROJECT_ID ? Number(env.POSTHOG_PROJECT_ID) : undefined);
  return {
    token: env.POSTHOG_TOKEN,
    projectId: Number.isFinite(rawProjectId) ? rawProjectId : undefined,
    host: (pluginConfig.host ?? "https://us.posthog.com").replace(/\/+$/, ""),
    scope: pluginConfig.scope ?? "project",
    emoji: pluginConfig.emoji,
    maxFeatures: pluginConfig.maxFeatures ?? 3,
    optional: pluginConfig.optional ?? false,
  };
}

export type { ReleaseRule };
