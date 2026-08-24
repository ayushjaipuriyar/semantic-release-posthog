import type { DeploymentInfo } from "./content.js";

const PROTECTED_BRANCHES = new Set(["main", "master", "trunk"]);

function branchEnvironment(branch: string | undefined): string | undefined {
  if (!branch) return undefined;
  return PROTECTED_BRANCHES.has(branch) ? "production" : branch;
}

/**
 * Detect deployment context from well-known CI environment variables.
 * Returns undefined when no known CI is detected and no override was given.
 * An explicit `override.environment` always wins over auto-detection.
 */
export function detectDeployment(
  env: Record<string, string | undefined> = {},
  override: { environment?: string; provider?: string; url?: string; region?: string } = {}
): DeploymentInfo | undefined {
  let detected: DeploymentInfo | undefined;

  if (env.GITHUB_ACTIONS === "true") {
    detected = { provider: "github-actions", environment: branchEnvironment(env.GITHUB_REF_NAME) };
  } else if (env.VERCEL === "1") {
    detected = {
      provider: "vercel",
      environment: env.VERCEL_ENV,
      url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined,
    };
  } else if (env.NETLIFY === "true" || env.CONTEXT) {
    detected = {
      provider: "netlify",
      environment: env.CONTEXT,
      url: env.DEPLOY_PRIME_URL,
    };
  } else if (env.GITLAB_CI === "true") {
    detected = {
      provider: "gitlab-ci",
      environment: env.CI_ENVIRONMENT_NAME ?? branchEnvironment(env.CI_COMMIT_BRANCH),
    };
  } else if (env.CIRCLECI === "true") {
    detected = { provider: "circleci", environment: branchEnvironment(env.CIRCLE_BRANCH) };
  }

  if (Object.keys(override).length === 0) return detected;
  return { ...detected, ...compact(override) };
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
