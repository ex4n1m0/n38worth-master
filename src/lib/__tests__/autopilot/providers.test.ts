import { describe, it, expect } from "vitest";
import { buildProviderRequest, PROVIDER_PRESETS } from "@/lib/autopilot/providers";

const BASE = { apiKey: "sk-test", system: "sys", user: "usr" };

describe("buildProviderRequest — endpoint normalization", () => {
  it("OpenAI-kind: appends /chat/completions to a /v1 base", () => {
    const req = buildProviderRequest({ ...BASE, provider: "openai", baseUrl: "", model: "gpt-4o-mini" });
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.headers.Authorization).toBe("Bearer sk-test");
  });

  it("OpenRouter gets attribution headers", () => {
    const req = buildProviderRequest({ ...BASE, provider: "openrouter", baseUrl: "", model: "m" });
    expect(req.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(req.headers["HTTP-Referer"]).toBeTruthy();
    expect(req.headers["X-Title"]).toBe("n38worth autopilot");
  });

  it("Groq routes to its OpenAI-compatible /openai/v1 path", () => {
    const req = buildProviderRequest({ ...BASE, provider: "groq", baseUrl: "", model: "m" });
    expect(req.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("DeepSeek requests disabled thinking mode; others do not", () => {
    const ds = buildProviderRequest({ ...BASE, provider: "deepseek", baseUrl: "", model: "m" });
    expect((ds.body as Record<string, unknown>).thinking).toEqual({ type: "disabled" });
    const oa = buildProviderRequest({ ...BASE, provider: "openai", baseUrl: "", model: "m" });
    expect((oa.body as Record<string, unknown>).thinking).toBeUndefined();
  });

  it("Anthropic: /v1/messages + version + browser-access headers, key via x-api-key", () => {
    const req = buildProviderRequest({ ...BASE, provider: "anthropic", baseUrl: "", model: "claude-x" });
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-test");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    expect(req.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(req.headers.Authorization).toBeUndefined();
    const body = req.body as Record<string, unknown>;
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "usr" }]);
  });

  it("Gemini: model in the path, key via x-goog-api-key, JSON mime type", () => {
    const req = buildProviderRequest({ ...BASE, provider: "gemini", baseUrl: "", model: "gemini-2.0-flash" });
    expect(req.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    );
    expect(req.headers["x-goog-api-key"]).toBe("sk-test");
    const cfg = (req.body as Record<string, unknown>).generationConfig as Record<string, unknown>;
    expect(cfg.responseMimeType).toBe("application/json");
  });

  it("custom provider uses the player-supplied base URL (trailing slashes stripped)", () => {
    const req = buildProviderRequest({ ...BASE, provider: "custom", baseUrl: "http://localhost:11434/v1///", model: "llama3" });
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("player base URL overrides the preset", () => {
    const req = buildProviderRequest({ ...BASE, provider: "openai", baseUrl: "https://proxy.example.com/v1", model: "m" });
    expect(req.url).toBe("https://proxy.example.com/v1/chat/completions");
  });
});

describe("PROVIDER_PRESETS invariants", () => {
  it("every preset resolves an endpoint without a base URL unless custom/builtin", () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      if (preset.needsBaseUrl) continue;
      // builtin never goes through buildProviderRequest — it POSTs the
      // snapshot to /api/autopilot/brain (see builtin.test.ts).
      if (preset.id === "builtin") continue;
      const req = buildProviderRequest({ ...BASE, provider: preset.id, baseUrl: "", model: "m" });
      expect(req.url.startsWith("https://")).toBe(true);
    }
  });

  it("the builtin preset is first (the default) and has no external base URL", () => {
    const first = Object.values(PROVIDER_PRESETS)[0];
    expect(first.id).toBe("builtin");
    expect(first.baseUrl).toBe("");
    expect(first.needsBaseUrl).toBe(false);
  });

  it("only the custom preset requires a base URL", () => {
    const custom = Object.values(PROVIDER_PRESETS).filter((p) => p.needsBaseUrl);
    expect(custom.map((p) => p.id)).toEqual(["custom"]);
  });
});
