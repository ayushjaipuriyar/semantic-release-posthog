import { resolveAnalyzerConfig, resolvePosthogOptions } from "./lib/analyzer-config.js";
import { classifyCommits, pickSubjects, extractBreakingChanges } from "./lib/classify.js";
import {
  buildAnnotationContent,
  buildRichAnnotation,
  versionLabelOf,
  type ContentOptions,
} from "./lib/content.js";
import { createAnnotation, listRecentAnnotations } from "./lib/annotation.js";
import { findDuplicateAnnotation } from "./lib/idempotency.js";
import { detectDeployment } from "./lib/deployment.js";
import { redactText } from "./lib/privacy.js";

export interface PluginConfig extends ContentOptions {
  /** PostHog project id (falls back to POSTHOG_PROJECT_ID env) */
  projectId?: number;
  /** PostHog host, defaults to https://us.posthog.com */
  host?: string;
  /** Annotation scope, defaults to "project" */
  scope?: "project" | "organization";
  /** Skip (instead of fail) when credentials are missing, defaults to false */
  optional?: boolean;
  /** Skip creating annotations for patch releases entirely */
  skipPatch?: boolean;
  /** Preview the annotation without POSTing it */
  dryRun?: boolean;
  /** Log resolved analyzer configuration and per-commit classifications */
  debug?: boolean;
  /** Manual deployment environment override ("production", "staging", ...) */
  environment?: string;
  /** Redaction applied to every subject before it leaves the machine */
  privacy?: {
    patterns?: RegExp[];
    replacement?: string;
    disableDefaults?: boolean;
  };
  /** Prevent duplicate annotations when releases are retried */
  idempotency?: {
    enabled?: boolean;
    strategy?: import("./lib/idempotency.js").IdempotencyStrategy;
  };
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
  lastRelease?: { version?: string; gitTag?: string };
  branch?: { name?: string };
  options?: { plugins?: unknown[]; repositoryUrl?: string };
}

const PREFIX = "semantic-release-posthog:";

function missingCredentialsError(opts: { token?: string }): Error {
  if (!opts.token) {
    return new Error(
      `${PREFIX} POSTHOG_TOKEN environment variable is required (create a personal API key at https://us.posthog.com/settings/user-api-keys).`
    );
  }
  return new Error(`${PREFIX} set the \`projectId\` plugin option or the POSTHOG_PROJECT_ID environment variable.`);
}

export function verifyConditions(pluginConfig: PluginConfig = {}, context: Context = {}): void {
  const opts = resolvePosthogOptions(pluginConfig, context);
  if (opts.optional) return;

  if (!opts.token || !opts.projectId) {
    throw missingCredentialsError(opts);
  }
}

function debugLog(logger: Logger | undefined, message: string): void {
  logger?.log(`[semantic-release-posthog] ${message}`);
}

export async function success(pluginConfig: PluginConfig = {}, context: Context = {}): Promise<void> {
  const opts = resolvePosthogOptions(pluginConfig, context);
  const logger = context.logger;

  if (!opts.token || !opts.projectId) {
    logger?.warn(`${PREFIX} POSTHOG_TOKEN/projectId missing — skipping annotation (optional mode).`);
    return;
  }

  try {
    const releaseType = context.nextRelease?.type ?? "release";

    if (opts.skipPatch && /^(pre)?patch$/.test(releaseType)) {
      logger?.log(`${PREFIX} skipping patch release v${context.nextRelease?.version} (skipPatch).`);
      return;
    }

    const { config: analyzerCfg, source } = resolveAnalyzerConfig(pluginConfig, context);
    const classified = await classifyCommits(analyzerCfg, (context.commits ?? []) as never, context);

    if (opts.debug) {
      debugLog(logger, `analyzer configuration source: ${source}`);
      for (const c of classified) {
        const hash = String(c.commit.hash ?? "").slice(0, 7) || "-------";
        const header = c.parsed?.header ?? c.commit.rawMsg.split("\n")[0];
        debugLog(logger, `${hash} ${header} → ${c.releaseType ?? "ignored"}`);
      }
    }

    const privacy = {
      patterns: opts.privacy?.patterns,
      replacement: opts.privacy?.replacement,
      disableDefaults: opts.privacy?.disableDefaults,
    };
    const subjects = pickSubjects(classified).map((s) => redactText(s, privacy));
    const breakingChanges = extractBreakingChanges(classified).map((s) => redactText(s, privacy));

    const wantsDeployment = Boolean(opts.include?.environment || opts.environment);
    const deployment = wantsDeployment
      ? detectDeployment(context.env ?? {}, { environment: opts.environment })
      : undefined;

    const versionLabel = versionLabelOf(context.nextRelease ?? {});
    const content =
      opts.format === "multi-line"
        ? buildRichAnnotation(
            {
              release: context.nextRelease ?? {},
              subjects,
              breakingChanges,
              commitRange: {
                from: context.lastRelease?.gitTag ?? context.lastRelease?.version,
                to: context.nextRelease?.gitTag ?? context.nextRelease?.version,
              },
              repositoryUrl: context.options?.repositoryUrl,
              environment: deployment,
            },
            opts
          )
        : buildAnnotationContent(context.nextRelease ?? {}, subjects, opts);

    if (opts.debug) debugLog(logger, `annotation content:\n${content}`);

    if (opts.dryRun) {
      logger?.log(`[semantic-release-posthog] Would create annotation:\n${content}`);
      logger?.log(`[semantic-release-posthog] Project: ${opts.projectId} · Host: ${opts.host}`);
      return;
    }

    if (opts.idempotency.enabled) {
      try {
        const recent = await listRecentAnnotations(
          { host: opts.host, token: opts.token, projectId: opts.projectId },
          20
        );
        const duplicate = findDuplicateAnnotation(
          recent,
          { versionLabel, environment: deployment?.environment },
          opts.idempotency.strategy
        );
        if (duplicate) {
          logger?.log(`${PREFIX} annotation for ${versionLabel} already exists (#${duplicate.id}) — skipping.`);
          return;
        }
      } catch (err) {
        // Duplicate detection is best-effort; never block annotation creation.
        debugLog(logger, `idempotency check failed (${(err as Error).message}) — proceeding.`);
      }
    }

    if (opts.dryRun) {
      logger?.log(`[semantic-release-posthog] Would create annotation:\n${content}`);
      logger?.log(`[semantic-release-posthog] Project: ${opts.projectId} · Host: ${opts.host}`);
      return;
    }

    await createAnnotation(
      { host: opts.host, token: opts.token, projectId: opts.projectId },
      { content, date_marker: new Date().toISOString(), scope: opts.scope },
      {}
    );

    logger?.success(`${PREFIX} annotation created — ${content.split("\n")[0]}`);
  } catch (err) {
    // Annotation failures must never fail an already-published release.
    logger?.error(`${PREFIX} failed to create annotation (${(err as Error).message})`);
  }
}
