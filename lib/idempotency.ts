export interface ExistingAnnotation {
  id: number;
  content: string;
}

export interface DuplicateCandidate {
  versionLabel: string;
  environment?: string;
}

export type IdempotencyStrategy = "version" | "version-environment";

/**
 * Find a previously created annotation that already records this release.
 * "version-environment" additionally requires the environment bullet to
 * match when both sides know an environment; otherwise version match wins.
 */
export function findDuplicateAnnotation(
  existing: ExistingAnnotation[],
  candidate: DuplicateCandidate,
  strategy: IdempotencyStrategy = "version-environment"
): ExistingAnnotation | undefined {
  return existing.find((annotation) => {
    if (!includesVersion(annotation.content, candidate.versionLabel)) return false;
    if (strategy === "version") return true;
    if (!candidate.environment) return true;
    const envBullet = `• Environment: ${candidate.environment}`;
    return annotation.content.includes(envBullet);
  });
}

function includesVersion(content: string, versionLabel: string): boolean {
  if (!versionLabel) return false;
  return content.includes(versionLabel);
}
