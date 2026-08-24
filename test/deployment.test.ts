import { describe, it, expect } from "vitest";
import { detectDeployment } from "../lib/deployment.js";

describe("detectDeployment", () => {
  it("returns undefined outside CI", () => {
    expect(detectDeployment({})).toBeUndefined();
  });

  it("detects GitHub Actions and infers production from protected branches", () => {
    const d = detectDeployment({
      GITHUB_ACTIONS: "true",
      GITHUB_REF_NAME: "main",
    });
    expect(d).toEqual({ provider: "github-actions", environment: "production" });
  });

  it("uses the branch name as environment on non-main GitHub refs", () => {
    const d = detectDeployment({ GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "next" });
    expect(d?.environment).toBe("next");
  });

  it("detects Vercel with its explicit environment", () => {
    const d = detectDeployment({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_URL: "app.vercel.app",
    });
    expect(d).toEqual({
      provider: "vercel",
      environment: "production",
      url: "https://app.vercel.app",
    });
  });

  it("detects Netlify context", () => {
    const d = detectDeployment({
      NETLIFY: "true",
      CONTEXT: "production",
      DEPLOY_PRIME_URL: "https://site.netlify.app",
    });
    expect(d?.provider).toBe("netlify");
    expect(d?.environment).toBe("production");
    expect(d?.url).toBe("https://site.netlify.app");
  });

  it("detects GitLab CI environments", () => {
    const d = detectDeployment({
      GITLAB_CI: "true",
      CI_ENVIRONMENT_NAME: "staging",
    });
    expect(d?.provider).toBe("gitlab-ci");
    expect(d?.environment).toBe("staging");
  });

  it("prefers an explicit override over auto-detection", () => {
    const d = detectDeployment(
      { GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "main" },
      { environment: "eu-production" }
    );
    expect(d?.environment).toBe("eu-production");
    expect(d?.provider).toBe("github-actions");
  });

  it("returns just the override when nothing else is detected", () => {
    expect(detectDeployment({}, { environment: "canary" })).toEqual({
      environment: "canary",
    });
  });
});
