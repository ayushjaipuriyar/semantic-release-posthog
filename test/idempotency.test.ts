import { describe, it, expect } from "vitest";
import { findDuplicateAnnotation } from "../lib/idempotency.js";

const existing = [
  { id: 11, content: "🚀 v2.1.0 · minor — feat: chat redesign\n\nDeployment\n• Environment: production" },
  { id: 10, content: "🩹 v2.0.9 · patch — fix: crash\n\nDeployment\n• Environment: staging" },
];

describe("findDuplicateAnnotation", () => {
  it("detects a previous annotation for the same version and environment", () => {
    const dup = findDuplicateAnnotation(
      existing,
      { versionLabel: "v2.1.0", environment: "production" },
      "version-environment"
    );
    expect(dup?.id).toBe(11);
  });

  it("returns undefined when no annotation matches the version", () => {
    const dup = findDuplicateAnnotation(
      existing,
      { versionLabel: "v9.9.9", environment: "production" },
      "version-environment"
    );
    expect(dup).toBeUndefined();
  });

  it("treats a different environment as not a duplicate", () => {
    const dup = findDuplicateAnnotation(
      existing,
      { versionLabel: "v2.1.0", environment: "staging" },
      "version-environment"
    );
    expect(dup).toBeUndefined();
  });

  it("matches on version alone with the version strategy", () => {
    const dup = findDuplicateAnnotation(
      existing,
      { versionLabel: "v2.0.9", environment: "some-other-env" },
      "version"
    );
    expect(dup?.id).toBe(10);
  });

  it("still matches by version when the environment is unknown", () => {
    const dup = findDuplicateAnnotation(
      existing,
      { versionLabel: "v2.1.0" },
      "version-environment"
    );
    expect(dup?.id).toBe(11);
  });
});
