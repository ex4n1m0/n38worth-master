/**
 * Autopilot provider adapters (CLIENT-SIDE ONLY).
 *
 * The browser talks to the player's chosen LLM provider DIRECTLY — the API
 * key never leaves the browser except inside the Authorization/x-api-key
 * header of the provider request itself. CORS notes (PLAYER_AI_STUDY §5B):
 * OpenAI/OpenRouter/Groq/Gemini allow browser origins; Anthropic requires
 * the opt-in `anthropic-dangerous-direct-browser-access` header; local
 * OpenAI-compatible servers (Ollama/LM Studio) need their own CORS knobs.
 */

import type { AutopilotProviderId } from "./types";

export interface ProviderPreset {
  id: AutopilotProviderId;
  /** i18n key suffix for the label (apProviderOpenrouter etc.) */
  labelKey: string;
  baseUrl: string;
  kind: "openai" | "anthropic" | "gemini";
  /** Suggested default model (player can override). */
  defaultModel: string;
  /** Custom provider needs a player-supplied base URL. */
  needsBaseUrl: boolean;
}

export const PROVIDER_PRESETS: Record<AutopilotProviderId, ProviderPreset> = {
  openrouter: {
    id: "openrouter",
    labelKey: "apProviderOpenrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    kind: "openai",
    defaultModel: "openai/gpt-4o-mini",
    needsBaseUrl: false,
  },
  openai: {
    id: "openai",
    labelKey: "apProviderOpenai",
    baseUrl: "https://api.openai.com/v1",
    kind: "openai",
    defaultModel: "gpt-4o-mini",
    needsBaseUrl: false,
  },
  groq: {
    id: "groq",
    labelKey: "apProviderGroq",
    baseUrl: "https://api.groq.com/openai/v1",
    kind: "openai",
    defaultModel: "llama-3.3-70b-versatile",
    needsBaseUrl: false,
  },
  deepseek: {
    id: "deepseek",
    labelKey: "apProviderDeepseek",
    baseUrl: "https://api.deepseek.com/v1",
    kind: "openai",
    defaultModel: "deepseek-chat",
    needsBaseUrl: false,
  },
  anthropic: {
    id: "anthropic",
    labelKey: "apProviderAnthropic",
    baseUrl: "https://api.anthropic.com",
    kind: "anthropic",
    defaultModel: "claude-3-5-haiku-latest",
    needsBaseUrl: false,
  },
  gemini: {
    id: "gemini",
    labelKey: "apProviderGemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    kind: "gemini",
    defaultModel: "gemini-2.0-flash",
    needsBaseUrl: false,
  },
  custom: {
    id: "custom",
    labelKey: "apProviderCustom",
    baseUrl: "",
    kind: "openai",
    defaultModel: "",
    needsBaseUrl: true,
  },
};

/** Resolved endpoint + auth headers for a provider call (pure — tested). */
export interface ResolvedProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface BuildRequestOptions {
  provider: AutopilotProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
}

/** Normalizes preset vs custom base URLs into a full request. */
export function buildProviderRequest(opts: BuildRequestOptions): ResolvedProviderRequest {
  const preset = PROVIDER_PRESETS[opts.provider];
  const base = (opts.baseUrl || preset.baseUrl || "").replace(/\/+$/, "");
  const model = opts.model || preset.defaultModel;

  if (preset.kind === "openai") {
    return {
      url: `${base}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        // OpenRouter attribution headers (harmless elsewhere).
        "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://n38worth.com",
        "X-Title": "n38worth autopilot",
      },
      body: {
        model,
        temperature: 0.3,
        max_tokens: opts.maxTokens ?? 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        // DeepSeek thinking mode returns prose before the JSON — disable it.
        ...(opts.provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
      },
    };
  }

  if (preset.kind === "anthropic") {
    return {
      url: `${base}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        // Required for direct browser calls (CORS opt-in).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: {
        model,
        max_tokens: opts.maxTokens ?? 900,
        temperature: 0.3,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      },
    };
  }

  // Gemini
  return {
    url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey,
    },
    body: {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: opts.maxTokens ?? 900,
        responseMimeType: "application/json",
      },
    },
  };
}

export interface ModelCallResult {
  ok: boolean;
  content?: string;
  error?: string;
  usage?: { in: number; out: number };
}

// ── Unknown-safe JSON digging (no `any`) ──
function asJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractContent(kind: ProviderPreset["kind"], data: unknown): { content?: string; usage?: { in: number; out: number } } {
  const d = asJson(data);
  if (kind === "openai") {
    const choice = asJson(arr(d.choices)[0]);
    const content = str(asJson(choice.message).content);
    const usage = asJson(d.usage);
    return { content, usage: { in: num(usage.prompt_tokens), out: num(usage.completion_tokens) } };
  }
  if (kind === "anthropic") {
    const content = arr(d.content).map((c) => str(asJson(c).text) ?? "").join("") || undefined;
    const usage = asJson(d.usage);
    return { content, usage: { in: num(usage.input_tokens), out: num(usage.output_tokens) } };
  }
  const candidate = asJson(arr(d.candidates)[0]);
  const content = arr(asJson(candidate.content).parts).map((p) => str(asJson(p).text) ?? "").join("") || undefined;
  const usageMeta = asJson(d.usageMetadata);
  return { content, usage: { in: num(usageMeta.promptTokenCount), out: num(usageMeta.candidatesTokenCount) } };
}

/** One strict-JSON chat call. Never throws — returns { ok:false, error }. */
export async function callAutopilotModel(opts: BuildRequestOptions, timeoutMs = 25_000): Promise<ModelCallResult> {
  const preset = PROVIDER_PRESETS[opts.provider];
  if (!preset) return { ok: false, error: "Unknown provider" };
  if (!opts.apiKey) return { ok: false, error: "No API key saved" };
  if (preset.needsBaseUrl && !opts.baseUrl) return { ok: false, error: "Base URL required" };

  const req = buildProviderRequest(opts);
  // Scheme check — a pasted baseUrl like `javascript:` or `file:` would
  // otherwise become the fetch target for the player's key.
  if (!/^https?:\/\//i.test(req.url)) {
    return { ok: false, error: "Base URL must start with http:// or https://" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
    }
    const data = await res.json();
    const { content, usage } = extractContent(preset.kind, data);
    if (!content) return { ok: false, error: "Empty model response" };
    return { ok: true, content, usage };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Settings "Test connection" — one tiny JSON ping. */
export async function testProviderConnection(opts: BuildRequestOptions): Promise<{ ok: boolean; error?: string }> {
  const res = await callAutopilotModel(
    { ...opts, user: 'Reply with exactly this JSON: {"ok":true}', maxTokens: 32 },
    15_000
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}
