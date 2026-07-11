import type { AgentStrategy } from "@/lib/agent/strategy";

export type AgentDecision =
  | { action: "BUY"; targetId: number; reason?: string }
  | { action: "BREAK"; targetId: number; reason?: string }
  | { action: "SELL_COMBO"; playerIds: number[]; reason?: string }
  | { action: "WAIT"; reason?: string };

/**
 * Deterministic, balanced fallback used when the LLM is disabled, unreachable,
 * or returns something invalid. Safe and legal-by-construction:
 *   1. Fill a missing profession (enables combo income).
 *   2. Otherwise ACCUMULATE: buy any affordable card to grow the roster toward
 *      the mission ladder, which awards goddesses (at 1000/2000/3000/4000/5000 owned,
 *      plus the final "Goddess" at 10,000) — i.e. accumulation is itself a path
 *      to winning.
 *   3. Otherwise (can't afford anything) refuel by cashing in a sellable combo.
 *   4. Otherwise wait.
 * Goddesses and bonus cards are NEVER bought — they are only earned via the
 * mission ladder. This naturally hoards while cash is healthy and only sells
 * when low.
 */
export function heuristicDecision(strategy: AgentStrategy): AgentDecision {
  const affordableBuy = strategy.buyCandidates
    .filter((c) => c.value <= strategy.credits)
    .sort((a, b) => b.photoScore - a.photoScore || b.value - a.value); // prettiest photo first, value tie-break
  const affordableGrowth = strategy.growthCandidates
    .filter((c) => c.value <= strategy.credits)
    .sort((a, b) => b.photoScore - a.photoScore || b.value - a.value);
  const affordableBreaks = strategy.breakCandidates
    .filter((c) => c.breakCost <= strategy.credits)
    .sort((a, b) => b.value - a.value); // most valuable first

  // Every BUY/BREAK consumes a hire slot. The hire cap is fixed (slot-buying was
  // removed with the bonus cards), so when the roster is full the Agent can only
  // refuel by selling a combo, else wait.
  if (strategy.atHireLimit) {
    if (strategy.comboCandidate) {
      return {
        action: "SELL_COMBO",
        playerIds: strategy.comboCandidate.playerIds,
        reason: "heuristic: at hire limit, cashing combo to refuel",
      };
    }
    return { action: "WAIT", reason: "heuristic: at hire limit, nothing to sell" };
  }

  // 1) Fill a missing profession (enables combo income).
  if (affordableBuy.length > 0) {
    const c = affordableBuy[0];
    return {
      action: "BUY",
      targetId: c.targetId,
      reason: `heuristic: ${c.hasOwner ? "steal" : "acquire"} ${c.profession}`,
    };
  }

  // 2) Break a sell block to steal a valuable card (especially if it fills a
  //    missing profession). Skip Fate-sealed cards unless we're rich.
  if (affordableBreaks.length > 0) {
    // Prefer non-Fate-sealed breaks (cheaper). Only break Fate seals if we
    // have plenty of credits (break cost is 1000x value).
    const nonFateBreaks = affordableBreaks.filter((c) => !c.isFateSealed);
    const pool = nonFateBreaks.length > 0 ? nonFateBreaks : affordableBreaks;
    if (pool.length > 0) {
      const c = pool[0];
      // Only break Fate seals if the Agent has > 10x the break cost in credits.
      if (!c.isFateSealed || strategy.credits > c.breakCost * 10) {
        return {
          action: "BREAK",
          targetId: c.targetId,
          reason: `heuristic: break ${c.isFateSealed ? "Fate seal" : "sell block"} on ${c.username} (value=${c.value})`,
        };
      }
    }
  }

  // 3) Accumulate any affordable card to grow the owned-card count toward the
  // mission ladder, which AWARDS goddesses/bonus cards for free. Most-expensive-
  // first to also pump card values and keep things lively.
  if (affordableGrowth.length > 0) {
    const c = affordableGrowth[0];
    return {
      action: "BUY",
      targetId: c.targetId,
      reason: `heuristic: ${c.hasOwner ? "steal" : "acquire"} to grow roster (earn mission goddesses)`,
    };
  }

  // 4) Broke -> cash in a combo to refuel.
  if (strategy.comboCandidate) {
    return {
      action: "SELL_COMBO",
      playerIds: strategy.comboCandidate.playerIds,
      reason: "heuristic: low credits, cashing combo",
    };
  }

  return { action: "WAIT", reason: "heuristic: nothing affordable/sellable" };
}

interface DecideOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

function buildPrompt(strategy: AgentStrategy): string {
  return JSON.stringify(
    {
      objective:
        "You are 'Agent', an aggressive player in a card game. Your path to WIN is to ACCUMULATE as many cards as possible \u2014 growing your owned-card count climbs the mission ladder, which awards FREE goddess cards (at 1000/2000/3000/4000/5000 owned, plus the final 'Goddess' at 6,000 owned). Owning ALL 6 GODDESSES wins the game, but you EARN goddesses ONLY through the mission ladder \u2014 so hoarding cards is your route to victory; keep buying regular cards every turn while you have credits. Also: collect 6 cards with 6 DIFFERENT professions and SELL_COMBO for cash (pays sum(value) x 10) to refuel. HARD RULE: you may NEVER buy goddesses \u2014 they are not offered as buy candidates and any attempt is rejected. Only 'buyCandidates', 'growthCandidates', and 'breakCandidates' are actionable. Every BUY or BREAK needs a free hire slot (the cap is fixed) \u2014 if slotsRemaining is 0 you can only SELL_COMBO or WAIT. Prefer stealing OWNED cards, and among affordable options favor the BEST-LOOKING photos first (highest 'photoScore' — a proxy for how good the card's photo looks), using card value as the tie-break, before ownerless cards. BREAK candidates are cards under sell blocks \u2014 you can break the block to steal the card, but it costs more (breakCost includes break fee + hire cost). Fate-sealed cards (isFateSealed=true) cost 1000x value to break \u2014 only break those if you're very rich. If you have War power (hasWar=true), normal break fees are waived (but Fate fees are NOT waived). Priority: fill missing professions (buyCandidates) → break valuable sell-blocked cards (breakCandidates) → accumulate cards (growthCandidates); SELL_COMBO mainly to refuel when low on credits or at the hire limit.",
      credits: strategy.credits,
      ownedCount: strategy.ownedCount,
      ownedGoddessCount: strategy.ownedGoddessCount,
      missionLevel: strategy.missionLevel,
      nextMissionThreshold: strategy.nextMissionThreshold,
      hireSlots: strategy.hireSlots,
      slotsRemaining: strategy.slotsRemaining,
      atHireLimit: strategy.atHireLimit,
      hasWar: strategy.hasWar,
      ownedProfessions: strategy.ownedProfessions,
      buyCandidates: strategy.buyCandidates,
      growthCandidates: strategy.growthCandidates,
      breakCandidates: strategy.breakCandidates.length > 0
        ? strategy.breakCandidates.map((c) => ({
            targetId: c.targetId,
            username: c.username,
            profession: c.profession,
            value: c.value,
            breakCost: c.breakCost,
            isFateSealed: c.isFateSealed,
            ownerName: c.ownerName,
          }))
        : [],
      comboAvailable: strategy.comboCandidate
        ? {
            playerIds: strategy.comboCandidate.playerIds,
            estimatedReward: strategy.comboCandidate.estimatedReward,
          }
        : null,
      instructions:
        "Choose exactly ONE action. Respond with strict JSON only: {\"action\":\"BUY\",\"targetId\":<id>} OR {\"action\":\"BREAK\",\"targetId\":<id>} OR {\"action\":\"SELL_COMBO\",\"playerIds\":[6 ids from comboAvailable]} OR {\"action\":\"WAIT\"}. For BUY, targetId MUST be from buyCandidates or growthCandidates. For BREAK, targetId MUST be from breakCandidates and you must afford breakCost <= credits. For both BUY and BREAK, slotsRemaining must be > 0. Among affordable BUY candidates, prefer the one with the highest photoScore (best-looking photo), with value as the tie-break. Consider BREAK to steal high-value cards that are sell-blocked, especially if they fill a missing profession — but avoid Fate-sealed cards unless you have plenty of credits. Prefer not to WAIT while you can still afford to accumulate cards. playerIds must equal comboAvailable.playerIds exactly.",
    },
    null,
    0
  );
}

/**
 * Asks the configured DeepSeek (OpenAI-compatible) model to choose an action,
 * validated strictly against the candidate set. Falls back to the heuristic on
 * any error, timeout, or invalid/illegal response.
 */
export async function decideAction(
  strategy: AgentStrategy,
  opts: DecideOptions = {}
): Promise<{ decision: AgentDecision; source: "llm" | "heuristic" }> {
  // .trim() guards against trailing newlines that `vercel env add` appends when
  // values are piped over stdin (a newline in a header value is a hard error).
  const baseUrl = (opts.baseUrl ?? process.env.AGENT_LLM_BASE_URL ?? "").trim();
  const apiKey = (opts.apiKey ?? process.env.AGENT_LLM_API_KEY ?? "").trim();
  const model = (opts.model ?? process.env.AGENT_LLM_MODEL ?? "deepseek-v4-flash").trim();
  const timeoutMs = opts.timeoutMs ?? 8000;

  // No LLM configured → heuristic.
  if (!baseUrl || !apiKey) {
    return { decision: heuristicDecision(strategy), source: "heuristic" };
  }

  // No card to BUY or BREAK for the LLM to choose among → let the deterministic
  // heuristic decide between SELL_COMBO / WAIT without spending a token.
  if (
    strategy.buyCandidates.length === 0 &&
    strategy.growthCandidates.length === 0 &&
    strategy.breakCandidates.length === 0
  ) {
    return { decision: heuristicDecision(strategy), source: "heuristic" };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        // Disable DeepSeek "thinking" mode (default-on for deepseek-v4-*) so the
        // model returns the JSON decision directly and fast instead of spending
        // the budget on chain-of-thought. Falls back to the heuristic on failure.
        thinking: { type: "disabled" },
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a careful game-playing agent. Reply with strict JSON only — no prose, no markdown.",
          },
          { role: "user", content: buildPrompt(strategy) },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error("Agent LLM HTTP error:", res.status);
      return { decision: heuristicDecision(strategy), source: "heuristic" };
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { decision: heuristicDecision(strategy), source: "heuristic" };
    }

    const parsed = JSON.parse(content) as Partial<AgentDecision> & { action?: string };
    const validated = validateDecision(parsed, strategy);
    if (validated) {
      return { decision: validated, source: "llm" };
    }
    return { decision: heuristicDecision(strategy), source: "heuristic" };
  } catch (err) {
    clearTimeout(timeout);
    console.error("Agent LLM call failed:", err instanceof Error ? err.message : err);
    return { decision: heuristicDecision(strategy), source: "heuristic" };
  }
}

/**
 * Re-validates an LLM-proposed decision against the legal candidate set.
 * Returns null if the proposal is illegal/malformed (caller falls back).
 */
function validateDecision(
  parsed: (Partial<AgentDecision> & { action?: string }) | null,
  strategy: AgentStrategy
): AgentDecision | null {
  if (!parsed || typeof parsed.action !== "string") return null;

  if (parsed.action === "WAIT") {
    return { action: "WAIT", reason: "llm" };
  }

  if (parsed.action === "BUY") {
    // A free hire slot is required for any purchase.
    if (strategy.atHireLimit) return null;
    const targetId = (parsed as { targetId?: unknown }).targetId;
    if (typeof targetId !== "number") return null;
    // Goddesses are never buyable by the Agent, so they are not in either
    // candidate list — a BUY targeting one is rejected here.
    const ok =
      strategy.buyCandidates.some((c) => c.targetId === targetId) ||
      strategy.growthCandidates.some((c) => c.targetId === targetId);
    if (!ok) return null;
    return { action: "BUY", targetId, reason: "llm" };
  }

  if (parsed.action === "BREAK") {
    // A free hire slot is required for breaking (it results in a purchase).
    if (strategy.atHireLimit) return null;
    const targetId = (parsed as { targetId?: unknown }).targetId;
    if (typeof targetId !== "number") return null;
    const cand = strategy.breakCandidates.find((c) => c.targetId === targetId);
    if (!cand) return null;
    // Must be able to afford the break cost.
    if (cand.breakCost > strategy.credits) return null;
    return { action: "BREAK", targetId, reason: "llm" };
  }

  if (parsed.action === "SELL_COMBO") {
    if (!strategy.comboCandidate) return null;
    const ids = (parsed as { playerIds?: unknown }).playerIds;
    if (!Array.isArray(ids) || ids.length !== 6) return null;
    const want = new Set(strategy.comboCandidate.playerIds);
    const got = new Set(ids.map((x) => Number(x)));
    if (want.size !== got.size) return null;
    for (const id of want) if (!got.has(id)) return null;
    return { action: "SELL_COMBO", playerIds: strategy.comboCandidate.playerIds, reason: "llm" };
  }

  return null;
}
