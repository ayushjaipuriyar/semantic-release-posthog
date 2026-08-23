declare module "@semantic-release/commit-analyzer" {
  export interface CommitAnalyzerConfig {
    preset?: string;
    config?: string;
    parserOpts?: Record<string, unknown>;
    presetConfig?: Record<string, unknown>;
    releaseRules?: ReleaseRule[] | string;
  }

  export interface ReleaseRule {
    breaking?: boolean;
    revert?: boolean;
    release: string | null | false;
    [key: string]: unknown;
  }

  interface LoggerLike {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  }

  export function analyzeCommits(
    pluginConfig: CommitAnalyzerConfig,
    context: { commits?: RawCommit[]; logger?: Partial<LoggerLike>; cwd?: string; env?: Record<string, string | undefined> }
  ): Promise<string | null>;
}

declare module "conventional-commits-filter" {
  export function filterRevertedCommitsSync<T>(commits: T[]): T[];
}
