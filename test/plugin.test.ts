import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAnnotationContent, createAnnotation } from "../lib/annotation.js";
import { verifyConditions, success } from "../index.js";
import type { Context } from "../index.js";

afterEach(() => vi.unstubAllGlobals());

describe("buildAnnotationContent", () => {
  it("formats minor releases with feature subjects", () => {
    const content = buildAnnotationContent(
      { type: "minor", version: "2.1.0" },
      ["feat: chat redesign", "feat: filter sheet"],
      {}
    );
    expect(content).toBe("🚀 v2.1.0 · minor — feat: chat redesign; feat: filter sheet");
  });

  it("uses patch emoji for patch-only releases", () => {
    const content = buildAnnotationContent({ type: "patch", version: "2.1.1" }, ["fix: crash"], {});
    expect(content.startsWith("🩹 v2.1.1 · patch")).toBe(true);
  });

  it("truncates long subject lists with +N more", () => {
    const content = buildAnnotationContent(
      { type: "minor", version: "3.0.0" },
      ["feat: a", "feat: b", "feat: c", "feat: d", "feat: e"],
      { maxFeatures: 3 }
    );
    expect(content).toContain("+2 more");
    expect(content).not.toContain("feat: d");
  });

  it("caps each subject at 80 chars", () => {
    const content = buildAnnotationContent({ type: "minor", version: "1.0.0" }, ["feat: " + "x".repeat(200)], {
      maxFeatures: 3,
    });
    expect(content.length).toBeLessThan(120);
  });

  it("honours emoji override", () => {
    const content = buildAnnotationContent({ type: "minor", version: "1.0.0" }, [], { emoji: "🛠️" });
    expect(content.startsWith("🛠️")).toBe(true);
  });
});

describe("createAnnotation", () => {
  it("POSTs to the project annotations endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createAnnotation({ host: "https://us.posthog.com/", token: "phx_t", projectId: 252204 }, {
      content: "🚀 v1.0.0 · minor",
      date_marker: "2026-08-23T00:00:00.000Z",
      scope: "project",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.posthog.com/api/projects/252204/annotations/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer phx_t");
    expect(JSON.parse(init.body).scope).toBe("project");
  });

  it("throws with API status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    await expect(
      createAnnotation({ host: "https://us.posthog.com", token: "bad", projectId: 1 }, {
        content: "x",
        date_marker: "2026-08-23T00:00:00Z",
        scope: "project",
      })
    ).rejects.toThrow(/403/);
  });
});

describe("verifyConditions", () => {
  it("fails fast without POSTHOG_TOKEN", () => {
    expect(() => verifyConditions({ projectId: 1 }, { env: {} })).toThrow(/POSTHOG_TOKEN/);
  });

  it("fails fast without projectId", () => {
    expect(() => verifyConditions({}, { env: { POSTHOG_TOKEN: "phx_t" } })).toThrow(/projectId/);
  });

  it("passes when credentials are present via config and env", () => {
    expect(() => verifyConditions({ projectId: 252204 }, { env: { POSTHOG_TOKEN: "phx_t" } })).not.toThrow();
  });

  it("optional mode never throws", () => {
    expect(() => verifyConditions({ optional: true }, { env: {} })).not.toThrow();
  });
});

describe("success non-blocking behaviour", () => {
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() };

  function makeContext(env: Record<string, string>): Context {
    return {
      env,
      logger,
      nextRelease: { type: "minor", version: "2.1.0" },
      commits: [{ message: "feat: chat redesign" }],
      options: { plugins: [] },
    };
  }


  it("does not throw when PostHog is down; logs error instead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(success({ projectId: 252204 }, makeContext({ POSTHOG_TOKEN: "phx_t" }))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
  });

  it("creates an annotation on the happy path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await success({ projectId: 252204 }, makeContext({ POSTHOG_TOKEN: "phx_t" }));
    expect(logger.success).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content).toContain("v2.1.0 · minor");
    expect(body.content).toContain("feat: chat redesign");
  });
});
