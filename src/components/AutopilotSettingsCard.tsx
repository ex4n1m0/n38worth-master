"use client";

/**
 * Autopilot settings card (Settings page) — provider/key/cadence/budget/
 * verbs/mode, connection test, turn preview, approval, usage + log.
 * The API key is write-only: masked after save, never rendered back.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Bot, Loader2, KeyRound, Play, Eye, EyeOff, ShieldCheck, Zap, X } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import {
  ALL_AUTOPILOT_VERBS,
  type AutopilotProviderId,
  type AutopilotVerb,
} from "@/lib/autopilot/types";
import {
  getAutopilotKey,
  hasAutopilotKey,
  maskedAutopilotKey,
  setAutopilotKey,
  useAutopilotStore,
} from "@/lib/autopilot/store";
import { PROVIDER_PRESETS, testProviderConnection } from "@/lib/autopilot/providers";
import {
  approveAwaitingPlan,
  effectiveModelName,
  previewAutopilotTurn,
  AUTOPILOT_INVALIDATE_KEYS,
  planDigest,
} from "@/lib/autopilot/loop";

const CADENCE_OPTIONS = [1, 2, 5, 10, 15, 30, 60];

const VERB_LABEL_KEYS: Record<AutopilotVerb, string> = {
  acquire: "apVerbAcquire",
  renovate: "apVerbRenovate",
  deedLock: "apVerbDeedLock",
  foreclose: "apVerbForeclose",
  comboSale: "apVerbComboSale",
  landGrab: "apVerbLandGrab",
};

type TestState = { state: "idle" } | { state: "testing" } | { state: "ok" } | { state: "fail"; error: string };
type PreviewState = { state: "idle" } | { state: "loading" } | { state: "done"; digest: string; note?: string; dropped: number } | { state: "error"; error: string };

export function AutopilotSettingsCard() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();

  const config = useAutopilotStore((s) => s.config);
  const armed = useAutopilotStore((s) => s.armed);
  const log = useAutopilotStore((s) => s.log);
  const usage = useAutopilotStore((s) => s.usage);
  const awaiting = useAutopilotStore((s) => s.awaiting);
  const setConfig = useAutopilotStore((s) => s.setConfig);
  const setProvider = useAutopilotStore((s) => s.setProvider);
  const toggleVerb = useAutopilotStore((s) => s.toggleVerb);
  const setMode = useAutopilotStore((s) => s.setMode);
  const setArmed = useAutopilotStore((s) => s.setArmed);
  const setAwaiting = useAutopilotStore((s) => s.setAwaiting);

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [preview, setPreview] = useState<PreviewState>({ state: "idle" });
  const [approving, setApproving] = useState(false);

  const preset = PROVIDER_PRESETS[config.provider];
  const username = session?.user?.name ?? "";

  // Masked key display — read in an effect (localStorage is not render-pure).
  useEffect(() => {
    setKeyMasked(maskedAutopilotKey());
  }, [keyInput, armed, test.state, preview.state]);

  function persistKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setAutopilotKey(trimmed);
    setKeyInput("");
    setShowKey(false);
    play("confirm");
    toast.success(t.apApiKeyStored);
  }

  async function runTest() {
    setTest({ state: "testing" });
    const res = await testProviderConnection({
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: keyInput.trim() || getAutopilotKey(),
      system: "You are a connection test.",
      user: 'Reply with exactly this JSON: {"ok":true}',
    });
    if (res.ok) {
      setTest({ state: "ok" });
      play("confirm");
    } else {
      setTest({ state: "fail", error: res.error ?? "unknown" });
      play("error");
    }
  }

  async function runPreview() {
    if (!username) return;
    if (!hasAutopilotKey() && !keyInput.trim()) {
      toast.error(t.apErrorNoKey);
      play("error");
      return;
    }
    if (keyInput.trim()) persistKey();
    setPreview({ state: "loading" });
    const res = await previewAutopilotTurn(username);
    if (res.error) {
      setPreview({ state: "error", error: res.error });
      play("error");
      return;
    }
    setPreview({
      state: "done",
      digest: planDigest(res.plan),
      note: res.plan.note,
      dropped: res.plan.dropped,
    });
    play(res.plan.actions.length > 0 ? "message" : "confirm");
  }

  async function approve() {
    if (!username) return;
    setApproving(true);
    try {
      await approveAwaitingPlan(username, {
        onAction: () => {
          for (const key of AUTOPILOT_INVALIDATE_KEYS) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        },
      });
      play("confirm");
    } finally {
      setApproving(false);
    }
  }

  function toggleArm() {
    const next = !armed;
    if (next && !hasAutopilotKey() && !keyInput.trim()) {
      toast.error(t.apErrorNoKey);
      play("error");
      return;
    }
    if (keyInput.trim()) persistKey();
    setArmed(next);
    play("toggle");
  }

  return (
    <Card className="border-gray-800 bg-transparent">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bot className="h-5 w-5 text-cyan-400" />
          {t.apTitle}
          {armed && (
            <span className="ml-1 rounded bg-cyan-500/15 border border-cyan-500/40 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan-300">
              {t.apArmed}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-gray-400">{t.apDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Provider + model */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ap-provider" className="text-gray-300">{t.apProvider}</Label>
            <select
              id="ap-provider"
              value={config.provider}
              onChange={(e) => setProvider(e.target.value as AutopilotProviderId)}
              className="w-full h-9 rounded-md border border-gray-700 bg-gray-900 text-white text-sm px-2"
            >
              {Object.values(PROVIDER_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {t[p.labelKey as keyof typeof t] as string}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-model" className="text-gray-300">{t.apModel}</Label>
            <Input
              id="ap-model"
              type="text"
              value={config.model}
              placeholder={preset.defaultModel || "model-name"}
              onChange={(e) => setConfig({ model: e.target.value })}
              className="bg-transparent border-gray-700 text-white"
            />
            <p className="text-xs text-gray-500">{t.apModelHint} · {effectiveModelName()}</p>
          </div>
        </div>

        {preset.needsBaseUrl && (
          <div className="space-y-2">
            <Label htmlFor="ap-baseurl" className="text-gray-300">{t.apBaseUrl}</Label>
            <Input
              id="ap-baseurl"
              type="text"
              value={config.baseUrl}
              placeholder="https://…/v1"
              onChange={(e) => setConfig({ baseUrl: e.target.value.trim() })}
              className="bg-transparent border-gray-700 text-white font-mono text-sm"
            />
            <p className="text-xs text-gray-500">{t.apBaseUrlHint}</p>
          </div>
        )}

        {/* API key — write-only */}
        <div className="space-y-2">
          <Label htmlFor="ap-key" className="text-gray-300 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            {t.apApiKey}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="ap-key"
                type={showKey ? "text" : "password"}
                value={keyInput}
                placeholder={keyMasked ?? t.apApiKeyPlaceholder}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                className="bg-transparent border-gray-700 text-white pr-9 font-mono text-sm"
              />
              <button
                type="button"
                aria-label={showKey ? "hide" : "show"}
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="button" variant="outline" onClick={persistKey} disabled={!keyInput.trim()} className="border-gray-700">
              {t.apSaveKey}
            </Button>
            {keyMasked && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAutopilotKey("");
                  setTest({ state: "idle" });
                  play("click");
                }}
                className="border-gray-700 text-gray-400"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {keyMasked && <p className="text-xs text-gray-500 font-mono">{t.apKeyMasked.replace("{key}", keyMasked)}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={runTest}
            disabled={test.state === "testing" || (!keyInput.trim() && !keyMasked)}
            className="border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:text-cyan-200"
          >
            {test.state === "testing" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            {test.state === "testing" ? t.apTesting : t.apTest}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runPreview}
            disabled={preview.state === "loading"}
            className="border-gray-700"
          >
            {preview.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {preview.state === "loading" ? t.apPreviewing : t.apPreview}
          </Button>
          {test.state === "ok" && <span className="text-xs text-green-400">{t.apTestOk}</span>}
          {test.state === "fail" && (
            <span className="text-xs text-red-400 truncate max-w-[280px]">{t.apTestFail}: {test.error}</span>
          )}
        </div>

        {preview.state === "done" && (
          <div className="rounded-md border border-cyan-500/30 bg-cyan-950/20 p-3 text-sm">
            <p className="text-cyan-300 font-semibold mb-1">{t.apPreviewPlan}</p>
            <p className="text-gray-200 font-mono text-xs break-words">{preview.digest}</p>
            {preview.note && <p className="text-gray-400 mt-1 text-xs italic">{preview.note}</p>}
            {preview.dropped > 0 && <p className="text-amber-400/80 mt-1 text-xs">−{preview.dropped}</p>}
          </div>
        )}
        {preview.state === "error" && (
          <p className="text-xs text-red-400">{t.apErrorProvider.replace("{error}", preview.error)}</p>
        )}

        {/* Copilot approval */}
        {awaiting && (
          <div className="rounded-md border border-amber-500/40 bg-amber-950/20 p-3 space-y-2">
            <p className="text-amber-300 font-semibold text-sm">{t.apAwaitingDigest.replace("{digest}", awaiting.digest)}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={approve} disabled={approving} className="bg-amber-600 hover:bg-amber-500 text-white">
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {t.apApprove}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAwaiting(null)} className="border-gray-700">
                {t.apDismiss}
              </Button>
            </div>
          </div>
        )}

        <Separator className="bg-gray-800" />

        {/* Cadence / budget / reserve */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ap-cadence" className="text-gray-300">{t.apCadence}</Label>
            <div className="flex items-center gap-2">
              <select
                id="ap-cadence"
                value={config.cadenceMin}
                onChange={(e) => setConfig({ cadenceMin: Number(e.target.value) })}
                className="w-full h-9 rounded-md border border-gray-700 bg-gray-900 text-white text-sm px-2"
              >
                {CADENCE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500 shrink-0">{t.apCadenceUnit}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-budget" className="text-gray-300">{t.apBudget}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ap-budget"
                type="number"
                min={1}
                max={100}
                value={config.budgetPct}
                onChange={(e) => setConfig({ budgetPct: Number(e.target.value) })}
                className="bg-transparent border-gray-700 text-white"
              />
              <span className="text-xs text-gray-500 shrink-0">{t.apBudgetUnit}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-reserve" className="text-gray-300">{t.apReserve}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ap-reserve"
                type="number"
                min={0}
                max={90}
                value={config.reservePct}
                onChange={(e) => setConfig({ reservePct: Number(e.target.value) })}
                className="bg-transparent border-gray-700 text-white"
              />
              <span className="text-xs text-gray-500 shrink-0">{t.apReserveUnit}</span>
            </div>
          </div>
        </div>

        {/* Verbs */}
        <div className="space-y-2">
          <Label className="text-gray-300">{t.apVerbs}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_AUTOPILOT_VERBS.map((verb) => (
              <label
                key={verb}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer select-none ${
                  config.verbs.includes(verb)
                    ? "border-cyan-500/40 bg-cyan-950/30 text-cyan-200"
                    : "border-gray-800 bg-gray-900/40 text-gray-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={config.verbs.includes(verb)}
                  onChange={() => {
                    toggleVerb(verb);
                    play("click");
                  }}
                  className="accent-cyan-500"
                />
                {t[VERB_LABEL_KEYS[verb] as keyof typeof t] as string}
              </label>
            ))}
          </div>
        </div>

        {/* Mode + arm */}
        <div className="space-y-2">
          <Label className="text-gray-300">{t.apMode}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("copilot");
                play("toggle");
              }}
              className={config.mode === "copilot" ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300" : "border-gray-700 text-gray-400"}
            >
              {t.apModeCopilot}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("execute");
                play("toggle");
              }}
              className={config.mode === "execute" ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300" : "border-gray-700 text-gray-400"}
            >
              {t.apModeExecute}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          onClick={toggleArm}
          className={`w-full font-semibold ${armed ? "bg-red-900/70 hover:bg-red-800 text-red-100" : "bg-cyan-600 hover:bg-cyan-500 text-white"}`}
        >
          <Bot className="h-4 w-4 mr-2" />
          {armed ? t.apDisarm : t.apArm}
        </Button>

        {/* Usage + log */}
        {usage.turns > 0 && (
          <p className="text-xs text-gray-500">
            {t.apUsage
              .replace("{turns}", String(usage.turns))
              .replace("{in}", String(Math.round(usage.tokensIn / 100) / 10))
              .replace("{out}", String(Math.round(usage.tokensOut / 100) / 10))}
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-400">{t.apLog}</p>
          {log.length === 0 ? (
            <p className="text-xs text-gray-600">{t.apLogEmpty}</p>
          ) : (
            <ul className="space-y-1">
              {log.slice(0, 5).map((entry) => (
                <li key={entry.at} className="text-xs text-gray-500 font-mono">
                  {new Date(entry.at).toLocaleTimeString()} · {entry.mode} ·{" "}
                  <span className={entry.error ? "text-red-400" : "text-gray-400"}>
                    {entry.error ?? `${entry.executed.filter((r) => r.ok).length}/${entry.plannedCount}`}
                  </span>
                  {entry.stopped && <span className="text-amber-500/80"> ({entry.stopped})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-gray-500">{t.apCosts}</p>
          <p className="text-[11px] text-gray-500">{t.apPrivacy}</p>
        </div>
      </CardContent>
    </Card>
  );
}
