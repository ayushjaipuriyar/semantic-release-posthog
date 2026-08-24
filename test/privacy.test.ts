import { describe, it, expect } from "vitest";
import { redactText } from "../lib/privacy.js";

describe("redactText", () => {
  it("redacts default credential patterns", () => {
    expect(redactText("login with password=hunter2 ok")).toBe("login with [REDACTED] ok");
    expect(redactText("use token=abc123 later")).toBe("use [REDACTED] later");
    expect(redactText("secret=top-secret value")).toBe("[REDACTED] value");
  });

  it("redacts api keys and bearer headers", () => {
    expect(redactText("set api_key=xyz")).toBe("set [REDACTED]");
    expect(redactText("Authorization: Bearer abc.def.ghi")).toBe("Authorization: [REDACTED]");
  });

  it("leaves ordinary text untouched", () => {
    const text = "feat(chat): redesign conversation list";
    expect(redactText(text)).toBe(text);
  });

  it("honours custom redactPatterns", () => {
    const out = redactText("customer acme-corp renewed", {
      patterns: [/acme-corp/g],
      replacement: "***",
    });
    expect(out).toBe("customer *** renewed");
  });

  it("applies custom patterns on top of the defaults unless disableDefaults is set", () => {
    expect(
      redactText("password=a token=b custom", { patterns: [/custom/g] })
    ).toBe("[REDACTED] [REDACTED] [REDACTED]");

    expect(
      redactText("password=a custom", { patterns: [/custom/g], disableDefaults: true })
    ).toBe("password=a [REDACTED]");
  });

  it("is safe when called repeatedly with the same regex instance", () => {
    const shared = /password=\S+/gi;
    expect(redactText("password=a", { patterns: [shared] })).toBe("[REDACTED]");
    expect(redactText("password=b", { patterns: [shared] })).toBe("[REDACTED]");
  });
});
