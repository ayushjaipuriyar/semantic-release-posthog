import { CommitParser } from "conventional-commits-parser";
import { filterRevertedCommitsSync } from "conventional-commits-filter";
import type { CommitAnalyzerConfig } from "@semantic-release/commit-analyzer";
import type { Commit } from "conventional-commits-parser";

const QUIET_LOGGER = { log() {}, error() {}, warn() {} };

export interface RawCommit {
  hash?: string;
  message: string;
  [key: string]: unknown;
}

export interface ClassifiedCommit {
  commit: RawCommit & { rawMsg: string };
  parsed: Commit | null;
  releaseType: string | null;
}

interface AnalyzeContext {
  logger?: { log(...args: unknown[]): void; warn(...args: unknown[]): void };
  cwd?: string;
  env?: Record<string, string | undefined>;
  _analyzerModule?: typeof import("@semantic-release/commit-analyzer");
}

/**
 * Classify every commit with the consumer's real commit-analyzer, one commit
 * at a time. Because we run @semantic-release/commit-analyzer itself with the
 * configuration the consumer already declared (preset, parserOpts,
 * releaseRules), the classification here can never drift from the one that
 * decided the version bump.
 */
export async function classifyCommits(
  analyzerConfig: CommitAnalyzerConfig,
  commits: RawCommit[] = [],
  context: AnalyzeContext = {}
): Promise<ClassifiedCommit[]> {
  const analyzerModule = context._analyzerModule ?? (await import("@semantic-release/commit-analyzer"));
  const { analyzeCommits } = analyzerModule;
  const parser = new CommitParser(
    (analyzerConfig.parserOpts ?? {}) as ConstructorParameters<typeof CommitParser>[0]
  );

  const usable: (RawCommit & { rawMsg: string })[] = (commits ?? [])
    .filter((c) => Boolean(c) && typeof c.message === "string" && c.message.trim().length > 0)
    .map(({ message, ...rest }) => ({ ...(rest as RawCommit), rawMsg: message, message }));

  // Mirror the analyzer's pipeline exactly:
  //   merged = { ...commitProps, ...parser.parse(message) }
  //   surviving = filterRevertedCommitsSync(merged)
  const pairs: { commit: RawCommit & { rawMsg: string }; parsed: Commit | null; merged: Record<string, unknown> }[] =
    usable.map((c) => {
      let parsed: Commit | null = null;
      try {
        parsed = parser.parse(c.message);
      } catch {
        parsed = null;
      }
      return { commit: c, parsed, merged: { ...c, ...(parsed ?? {}) } };
    });

  let survivingPairs = pairs;
  try {
    const kept = new Set(filterRevertedCommitsSync(pairs.map((p) => p.merged as never)));
    survivingPairs = pairs.filter((p) => kept.has(p.merged as never));
  } catch {
    // revert filtering is cosmetic for annotations; classification still works
  }

  const classified: ClassifiedCommit[] = [];
  for (const { commit, parsed } of survivingPairs) {
    let releaseType: string | null = null;
    try {
      releaseType = await analyzeCommits(analyzerConfig, {
        ...context,
        logger: QUIET_LOGGER,
        commits: [commit],
      });
    } catch (err) {
      releaseType = null;
      context.logger?.warn(`semantic-release-posthog: failed to analyze a commit (${(err as Error).message})`);
    }

    classified.push({ commit, parsed, releaseType });
  }

  return classified;
}

export function pickSubjects(classified: ClassifiedCommit[]): string[] {
  const minor: string[] = [];
  const patch: string[] = [];
  for (const { parsed, releaseType } of classified) {
    if (!releaseType || !parsed?.header) continue;
    if (/^(pre)?minor$/.test(releaseType)) minor.push(parsed.header);
    else if (/^(pre)?patch$/.test(releaseType)) patch.push(parsed.header);
  }
  return minor.length > 0 ? minor : patch;
}
