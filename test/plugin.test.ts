import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createAnnotation } from "../lib/annotation.js";
import { buildAnnotationContent } from "../lib/content.js";
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

describe("createAnnotation reliability", () => {
  const creds = { host: "https://us.posthog.com", token: "phx_t", projectId: 252204 };
  const payload = { content: "🚀 v1.0.0 · minor", date_marker: "2026-08-23T00:00:00.000Z", scope: "project" };

  it("retries 5xx responses and succeeds on a later attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAnnotation(creds, payload, { backoffMs: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 2 });
  });

  it("does not retry client errors like 403", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValue(new Response(JSON.stringify({ id: 3 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAnnotation(creds, payload, { backoffMs: 1 })).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createAnnotation(creds, payload, { backoffMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAnnotation(creds, payload, { retries: 2, backoffMs: 1 })).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("passes an abort signal so requests can time out", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createAnnotation(creds, payload, {});

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
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
      commits: [{ hash: "abc1234", message: "feat: chat redesign" }],
      options: {
        plugins: [],
        repositoryUrl: "https://github.com/acme/widget.git",
      },
    };
  }


  it("does not throw when PostHog is down; logs error instead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(success({ projectId: 252204 }, makeContext({ POSTHOG_TOKEN: "phx_t" }))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
  });

  it("creates an annotation on the happy path", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await success({ projectId: 252204 }, makeContext({ POSTHOG_TOKEN: "phx_t" }));
    expect(logger.success).toHaveBeenCalled();
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toContain("v2.1.0 · minor");
    expect(body.content).toContain("feat: chat redesign");
  });
});

describe("success wiring", () => {
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() };

  beforeEach(() => {
    logger.log.mockClear();
    logger.error.mockClear();
    logger.warn.mockClear();
    logger.success.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  function makeContext(overrides: Partial<Context> = {}): Context {
    return {
      env: { POSTHOG_TOKEN: "phx_t" },
      logger,
      nextRelease: { type: "minor", version: "2.1.0", gitTag: "v2.1.0" },
      lastRelease: { version: "2.0.0", gitTag: "v2.0.0" },
      commits: [{ hash: "abc1234", message: "feat: chat redesign" }],
      options: { plugins: [], repositoryUrl: "https://github.com/acme/widget.git" },
      ...overrides,
    };
  }

  it("skips the annotation entirely for patch releases when skipPatch is set", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, skipPatch: true },
      makeContext({ nextRelease: { type: "patch", version: "2.0.1", gitTag: "v2.0.1" } })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("patch"));
  });

  it("dryRun previews the annotation without POSTing", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success({ projectId: 252204, dryRun: true }, makeContext());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("Would create annotation"));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("v2.1.0 · minor"));
  });

  it("debug mode logs per-commit classifications", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success({ projectId: 252204, debug: true }, makeContext({
      commits: [
        { hash: "aaa1111", message: "feat: chat redesign" },
        { hash: "bbb2222", message: "chore: deps" },
      ],
    }));

    const allLogs = logger.log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allLogs).toMatch(/aaa1111.*feat: chat redesign.*→ minor/);
    expect(allLogs).toMatch(/bbb2222.*chore: deps.*→ ignored/);
  });

  it("redacts credential-looking text from subjects by default", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success({ projectId: 252204 }, makeContext({
      commits: [{ hash: "ccc3333", message: "feat: login with password=hunter2" }],
    }));

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).not.toContain("hunter2");
    expect(body.content).toContain("[REDACTED]");
  });

  it("adds a Deployment section when include.environment is set inside CI", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, format: "multi-line", include: { environment: true } },
      makeContext({ env: { POSTHOG_TOKEN: "phx_t", GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "main" } })
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toContain("Deployment");
    expect(body.content).toContain("• Environment: production");
  });

  it("supports an explicit environment override", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, format: "multi-line", include: { environment: true }, environment: "eu-west" },
      makeContext()
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toContain("• Environment: eu-west");
  });

  it("adds Links with compare range when format is multi-line and links enabled", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, format: "multi-line", include: { links: true } },
      makeContext()
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toContain("• Compare: https://github.com/acme/widget/compare/v2.0.0...v2.1.0");
  });

  it("does not duplicate annotations on reruns", async () => {
    const fetchMock = vi.fn()
      .mockImplementation((_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "GET") {
          return Promise.resolve(new Response(
            JSON.stringify({ results: [{ id: 77, content: "🚀 v2.1.0 · minor — feat: chat redesign\n\nDeployment\n• Environment: production" }] }),
            { status: 200 }
          ));
        }
        return Promise.resolve(new Response("{}", { status: 201 }));
      });
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, format: "multi-line", include: { environment: true } },
      makeContext({ env: { POSTHOG_TOKEN: "phx_t", GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "main" } })
    );

    const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST");
    expect(posts).toHaveLength(0);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("already exists"));
  });

  it("renders breaking changes in multi-line format", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, format: "multi-line" },
      makeContext({
        nextRelease: { type: "major", version: "3.0.0", gitTag: "v3.0.0" },
        commits: [{ hash: "ddd4444", message: "feat(api)!: new auth\n\nBREAKING CHANGE: requires Bearer tokens" }],
      })
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toContain("Breaking changes");
    expect(body.content).toContain("requires Bearer tokens");
  });

  it("honours contentTemplate in single-line mode end-to-end", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await success(
      { projectId: 252204, contentTemplate: "{emoji} shipped {version}: {subjects}" },
      makeContext()
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === "POST");
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.content).toBe("🚀 shipped v2.1.0: feat: chat redesign");
  });
});
