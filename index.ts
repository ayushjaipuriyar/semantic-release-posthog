import { resolveAnalyzerConfig, resolvePosthogOptions } from "./lib/analyzer-config.js";
import { classifyCommits, pickSubjects } from "./lib/classify.js";
import { buildAnnotationContent, createAnnotation } from "./lib/annotation.js";
import type { PosthogRuntimeOptions } from "./lib/analyzer-config.js";

export interface PluginConfig {
  /** PostHog project id (falls back to POSTHOG_PROJECT_ID env) */
  projectId?: number;
  /** PostHog host, defaults to https://us.posthog.com */
  host?: string;
  /** Annotation scope, defaults to "project" */
  scope?: "project" | "organization";
  /** Force a single emoji instead of the type-based default (💥/🚀/🩹/🏷️) */
  emoji?: string;
  /** Max commit subjects listed in the annotation, defaults to 3 */
  maxFeatures?: number;
  /** Skip (instead of fail) when credentials are missing, defaults to false */
  optional?: boolean;
  /**
   * Escape hatch: override the analyzer config used for classification.
   * By default the @semantic-release/commit-analyzer entry from your
   * .releaserc is detected and reused verbatim.
   */
  analyzerConfig?: import("@semantic-release/commit-analyzer").CommitAnalyzerConfig;
}

interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export interface Context {
  env?: Record<string, string | undefined>;
  cwd?: string;
  logger?: Logger;
  commits?: { hash?: string; message: string; [key: string]: unknown }[];
  nextRelease?: { type?: string; version?: string; gitTag?: string };
  options?: { plugins?: unknown[] };
}

function missingCredentialsError(opts: Partial<PosthogRuntimeOptions>): Error {
  if (!opts.token) {
    return new Error(
      "semantic-release-posthog: POSTHOG_TOKEN environment variable is required (create a personal API key at https://us.posthog.com/settings/user-api-keys)."
    );
  }
  return new Error(
    "semantic-release-posthog: set the `projectId` plugin option or the POSTHOG_PROJECT_ID environment variable."
  );
}

export function verifyConditions(pluginConfig: PluginConfig = {}, context: Context = {}): void {
  const opts = resolvePosthogOptions(pluginConfig, context);
  if (opts.optional) return;

  if (!opts.token || !opts.projectId) {
    throw missingCredentialsError(opts);
  }
}

export async function success(pluginConfig: PluginConfig = {}, context: Context = {}): Promise<void> {
  const opts = resolvePosthogOptions(pluginConfig, context);

  if (!opts.token || !opts.projectId) {
    context.logger?.warn(
      "semantic-release-posthog: POSTHOG_TOKEN/projectId missing — skipping annotation (optional mode)."
    );
    return;
  }

  try {
    const { config: analyzerCfg } = resolveAnalyzerConfig(pluginConfig, context);
    const classified = await classifyCommits(analyzerCfg, (context.commits ?? []) as never, context);
    const subjects = pickSubjects(classified);
    const content = buildAnnotationContent(context.nextRelease ?? {}, subjects, opts);
    await createAnnotation(
      { host: opts.host, token: opts.token, projectId: opts.projectId },
      { content, date_marker: new Date().toISOString(), scope: opts.scope }
    );

    context.logger?.success(`semantic-release-posthog: annotation created — ${content}`);
  } catch (err) {
    // Annotation failures must never fail an already-published release.
    context.logger?.error(`semantic-release-posthog: failed to create annotation (${(err as Error).message})`);
  }
}
