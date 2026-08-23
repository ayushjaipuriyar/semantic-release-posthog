import { describe, it, expect } from "vitest";
import { classifyCommits, pickSubjects } from "../lib/classify.js";
import { resolveAnalyzerConfig } from "../lib/analyzer-config.js";

const commit = (message: string) => ({ hash: message.slice(0, 8), message });

describe("classifyCommits parity with @semantic-release/commit-analyzer", () => {
  it("classifies feat/fix/chore like the default angular preset", async () => {
    const classified = await classifyCommits({}, [
      commit("feat(chat): add search"),
      commit("fix(leaderboard): crash on empty state"),
      commit("chore: deps bump"),
    ]);
    expect(classified.map((c) => c.releaseType)).toEqual(["minor", "patch", null]);
  });

  it("honours custom releaseRules exactly as the analyzer would", async () => {
    const analyzerConfig = {
      releaseRules: [{ type: "docs", release: "patch" }],
    };
    const withRule = await classifyCommits(analyzerConfig, [commit("docs: update guide")]);
    const withoutRule = await classifyCommits({}, [commit("docs: update guide")]);
    expect(withRule[0].releaseType).toBe("patch");
    expect(withoutRule[0].releaseType).toBeNull();
  });

  it("treats BREAKING CHANGE footer as major", async () => {
    const classified = await classifyCommits(
      {},
      [commit("feat!: new api\n\nBREAKING CHANGE: endpoints moved")]
    );
    expect(classified[0].releaseType).toBe("major");
  });

  it("drops reverted commit pairs before classification", async () => {
    const original = { hash: "1234abcd", message: "feat(chat): add search" };
    const revert = {
      hash: "deadbeef",
      message: 'Revert "feat(chat): add search"\n\nThis reverts commit 1234abcd.',
    };
    // semantic-release delivers commits newest-first, same as git log
    const classified = await classifyCommits({}, [revert, original]);
    expect(classified).toHaveLength(0);
  });

  it("resolves the analyzer entry from context.options.plugins", () => {
    const resolved = resolveAnalyzerConfig(
      {},
      { options: { plugins: ["@semantic-release/github", ["@semantic-release/commit-analyzer", { preset: "eslint" }]] } }
    );
    expect(resolved.source).toBe("releaserc");
    expect(resolved.config.preset).toBe("eslint");
  });

  it("explicit analyzerConfig wins over releaserc detection", () => {
    const resolved = resolveAnalyzerConfig(
      { analyzerConfig: { parserOpts: { headerPattern: /x/ } } },
      { options: { plugins: [["@semantic-release/commit-analyzer", { preset: "angular" }]] } }
    );
    expect(resolved.source).toBe("explicit");
    expect(resolved.config.preset).toBeUndefined();
  });
});

describe("pickSubjects", () => {
  it("prefers minor (features) over patch (fixes)", () => {
    const subjects = pickSubjects([
      { commit: commit("x"), parsed: { header: "feat: a" }, releaseType: "minor" },
      { commit: commit("y"), parsed: { header: "fix: b" }, releaseType: "patch" },
    ]);
    expect(subjects).toEqual(["feat: a"]);
  });

  it("falls back to fixes when there are no features", () => {
    const subjects = pickSubjects([
      { commit: commit("y"), parsed: { header: "fix: b" }, releaseType: "patch" },
    ]);
    expect(subjects).toEqual(["fix: b"]);
  });
});
