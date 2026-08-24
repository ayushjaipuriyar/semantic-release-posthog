import { describe, it, expect } from "vitest";
import { buildAnnotationContent, buildRichAnnotation } from "../lib/content.js";

describe("formatting options", () => {
  it("joins subjects with a custom subjectsJoiner", () => {
    const content = buildAnnotationContent(
      { type: "minor", version: "2.1.0" },
      ["feat: chat redesign", "feat: filter sheet"],
      { subjectsJoiner: " · " }
    );
    expect(content).toBe("🚀 v2.1.0 · minor — feat: chat redesign · feat: filter sheet");
  });

  it("caps each subject at maxSubjectLength", () => {
    const long = "feat: " + "x".repeat(30);
    const content = buildAnnotationContent(
      { type: "minor", version: "1.0.0" },
      [long],
      { maxSubjectLength: 10 }
    );
    expect(content).toBe("🚀 v1.0.0 · minor — feat: xxxx");
    expect(content).not.toContain(long);
  });

  it("honours emojiMap overrides per release type without affecting others", () => {
    const minor = buildAnnotationContent(
      { type: "minor", version: "1.0.0" },
      [],
      { emojiMap: { minor: "✨" } }
    );
    expect(minor.startsWith("✨")).toBe(true);

    const patch = buildAnnotationContent(
      { type: "patch", version: "1.0.1" },
      [],
      { emojiMap: { minor: "✨" } }
    );
    expect(patch.startsWith("🩹")).toBe(true);
  });

  it("prefers explicit emoji over emojiMap", () => {
    const content = buildAnnotationContent({ type: "minor", version: "1.0.0" }, [], {
      emoji: "🛠️",
      emojiMap: { minor: "✨" },
    });
    expect(content.startsWith("🛠️")).toBe(true);
  });

  it("supports maxSubjects and lets it win over legacy maxFeatures", () => {
    const content = buildAnnotationContent(
      { type: "minor", version: "3.0.0" },
      ["feat: a", "feat: b", "feat: c", "feat: d"],
      { maxFeatures: 4, maxSubjects: 2 }
    );
    expect(content).toContain("+2 more");
    expect(content).not.toContain("feat: c");
  });

  it("still honours legacy maxFeatures on its own", () => {
    const content = buildAnnotationContent(
      { type: "minor", version: "3.0.0" },
      ["feat: a", "feat: b", "feat: c", "feat: d", "feat: e"],
      { maxFeatures: 3 }
    );
    expect(content).toContain("+2 more");
    expect(content).not.toContain("feat: d");
  });

  it("renders a custom contentTemplate with tokens", () => {
    const content = buildAnnotationContent({ type: "minor", version: "2.1.0" }, ["feat: chat"], {
      contentTemplate: "{emoji} Release {version} ({type}): {subjects}",
    });
    expect(content).toBe("🚀 Release v2.1.0 (minor): feat: chat");
  });

  it("renders empty {subjects} in contentTemplate when there are none", () => {
    const content = buildAnnotationContent({ type: "major", version: "4.0.0" }, [], {
      contentTemplate: "{emoji} {version} — {subjects}",
    });
    expect(content).toBe("💥 v4.0.0 — ");
  });

  it("hides the release type via include.releaseType=false", () => {
    const content = buildAnnotationContent({ type: "minor", version: "2.1.0" }, ["feat: chat"], {
      include: { releaseType: false },
    });
    expect(content).toBe("🚀 v2.1.0 — feat: chat");
  });

  it("hides the version via include.version=false", () => {
    const content = buildAnnotationContent({ type: "minor", version: "2.1.0" }, [], {
      include: { version: false },
    });
    expect(content).toBe("🚀 minor");
  });

  it("falls back to gitTag when version is absent", () => {
    const content = buildAnnotationContent({ type: "minor", gitTag: "v9.9.9-rc.1" }, [], {});
    expect(content.startsWith("🚀 v9.9.9-rc.1")).toBe(true);
  });
});

describe("buildRichAnnotation (multi-line)", () => {
  it("renders header plus Changes bullets", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "2.1.0" },
        subjects: ["feat: chat redesign", "feat: filter sheet"],
      },
      {}
    );
    expect(content).toBe(
      "🚀 v2.1.0 · minor\n\nChanges\n• feat: chat redesign\n• feat: filter sheet"
    );
  });

  it("renders only the header when there are no subjects", () => {
    const content = buildRichAnnotation(
      { release: { type: "patch", version: "2.1.1" }, subjects: [] },
      {}
    );
    expect(content).toBe("🩹 v2.1.1 · patch");
  });

  it("adds a Breaking changes section when provided", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "major", version: "3.0.0" },
        subjects: ["feat!: new api"],
        breakingChanges: ["Auth API requires Bearer tokens", "Removed /v1/users endpoint"],
      },
      {}
    );
    expect(content).toContain("\n\nBreaking changes\n• Auth API requires Bearer tokens\n• Removed /v1/users endpoint");
  });

  it("omits the Breaking changes section when empty", () => {
    const content = buildRichAnnotation(
      { release: { type: "minor", version: "1.1.0" }, subjects: ["feat: x"], breakingChanges: [] },
      {}
    );
    expect(content).not.toContain("Breaking changes");
  });

  it("adds a Deployment section when environment info is provided", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "2.1.0" },
        subjects: [],
        environment: { environment: "production", provider: "github-actions" },
      },
      { include: { environment: true } }
    );
    expect(content).toContain("\n\nDeployment\n• Environment: production\n• Provider: github-actions");
  });

  it("hides the Deployment section by default even when data exists", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "2.1.0" },
        subjects: [],
        environment: { environment: "production" },
      },
      {}
    );
    expect(content).not.toContain("Deployment");
  });

  it("adds a Links section with a compare URL from repositoryUrl and commit range", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "2.1.0" },
        subjects: [],
        repositoryUrl: "https://github.com/acme/widget.git",
        commitRange: { from: "a1b2c3d", to: "d4e5f6a" },
      },
      { include: { links: true } }
    );
    expect(content).toContain(
      "\n\nLinks\n• Compare: https://github.com/acme/widget/compare/a1b2c3d...d4e5f6a"
    );
  });

  it("adds a release link when releaseUrl is provided", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "2.1.0", gitTag: "v2.1.0" },
        subjects: [],
        repositoryUrl: "https://github.com/acme/widget.git",
      },
      { include: { links: true } }
    );
    expect(content).toContain("• Release: https://github.com/acme/widget/releases/tag/v2.1.0");
  });

  it("truncates Changes bullets with +N more using maxSubjects", () => {
    const content = buildRichAnnotation(
      {
        release: { type: "minor", version: "3.0.0" },
        subjects: ["feat: a", "feat: b", "feat: c", "feat: d"],
      },
      { maxSubjects: 2 }
    );
    expect(content).toContain("• feat: a\n• feat: b, +2 more");
    expect(content).not.toContain("feat: c");
  });

  it("honours emojiMap in the header", () => {
    const content = buildRichAnnotation(
      { release: { type: "minor", version: "1.0.0" }, subjects: [] },
      { emojiMap: { minor: "✨" } }
    );
    expect(content.startsWith("✨ v1.0.0")).toBe(true);
  });
});
