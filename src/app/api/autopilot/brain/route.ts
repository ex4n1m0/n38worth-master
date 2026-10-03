import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAutopilotMessages } from "@/lib/autopilot/brain";
import {
  autopilotFlagEnabled,
  builtinApiKey,
  callBuiltinModel,
  claimBuiltinBrainCall,
  pareBuiltinContent,
  parseBrainPayload,
  promptWithinBudget,
} from "@/lib/autopilot/builtin";

/**
 * Builtin free AI tier — the ONE place the n38worth DeepSeek key is spent.
 *
 * The browser POSTs its game snapshot; this route builds the prompt
 * SERVER-side (brain.ts — same messages the BYO path builds client-side),
 * calls DeepSeek with the fixed model, and returns ONLY the pared plan JSON.
 * The plan is still validated against the snapshot client-side and every
 * action still goes through the session-authed game routes.
 *
 * Authed + per-user + spend route: NEVER CDN-cache (no s-maxage, no-store).
 * Gate order (cheapest first): flag → env key → auth → cross-site guard →
 * rate fences → payload → prompt budget → provider → content paring.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

const PING_MESSAGES = {
  system: "You are a connection test.",
  user: 'Reply with exactly this JSON: {"ok":true}',
};

/**
 * Cross-site quota-drain guard (security-review P3): a third-party page can
 * fire cookie-authed no-cors POSTs (simple request, no preflight) and burn
 * the visitor's daily free-tier quota. Browsers always send Sec-Fetch-Site
 * on such requests; non-browser clients send neither header.
 */
function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = request.headers.get("host") ?? "";
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  try {
    if (!(await autopilotFlagEnabled())) {
      return NextResponse.json(
        { ok: false, code: "builtin-disabled", error: "Autopilot is currently disabled." },
        { status: 403, headers: NO_STORE }
      );
    }
    if (!builtinApiKey()) {
      return NextResponse.json(
        { ok: false, code: "builtin-unconfigured", error: "Builtin AI is not configured on the server." },
        { status: 503, headers: NO_STORE }
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }
    const userId = Number(session.user.id);

    if (isCrossSite(request)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers: NO_STORE });
    }

    const claim = await claimBuiltinBrainCall(userId);
    if (!claim.allowed) {
      return NextResponse.json(
        { ok: false, code: claim.code, error: claim.error },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            ...(claim.retryAfterSec
              ? { "Retry-After": String(Math.max(1, Math.floor(claim.retryAfterSec))) }
              : {}),
          },
        }
      );
    }

    const payload = parseBrainPayload(await request.text());
    if (!payload) {
      return NextResponse.json(
        { ok: false, code: "builtin-bad-payload", error: "Malformed snapshot payload." },
        { status: 400, headers: NO_STORE }
      );
    }

    // Ping: fixed 16-token call, no snapshot involved.
    if (payload.ping) {
      const ping = await callBuiltinModel(PING_MESSAGES.system, PING_MESSAGES.user, 16);
      if (!ping.ok) {
        return NextResponse.json(
          { ok: false, code: "builtin-error", error: ping.error },
          { status: 502, headers: NO_STORE }
        );
      }
      return NextResponse.json(
        { ok: true, content: ping.content, usage: ping.usage },
        { headers: NO_STORE }
      );
    }

    const messages = buildAutopilotMessages(payload.snapshot!, payload.memory);
    if (!promptWithinBudget(messages.system, messages.user)) {
      return NextResponse.json(
        { ok: false, code: "builtin-bad-payload", error: "Snapshot too large." },
        { status: 400, headers: NO_STORE }
      );
    }

    const result = await callBuiltinModel(messages.system, messages.user, 900);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "builtin-error", error: result.error },
        { status: 502, headers: NO_STORE }
      );
    }

    // Only the pared strict-plan JSON leaves the server (never raw model prose).
    const pared = pareBuiltinContent(result.content ?? "");
    if (!pared) {
      return NextResponse.json(
        { ok: false, code: "builtin-error", error: "Model returned no valid plan." },
        { status: 502, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { ok: true, content: pared, usage: result.usage },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Autopilot brain route error:", error);
    return NextResponse.json(
      { ok: false, code: "builtin-error", error: "Internal server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
