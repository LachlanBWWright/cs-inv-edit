import { createEffect, createSignal, For, Show } from "solid-js";
import type { FeatureFlags, RevealAnimationMode, SettingsData } from "@cs-inv-edit/contracts";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface SettingsViewProps {
  settings: SettingsData | undefined;
  onRefresh: () => void;
  onSave: (next: SettingsData) => Promise<void>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function SettingsView(props: SettingsViewProps) {
  const [draft, setDraft] = createSignal<SettingsData | undefined>(props.settings);
  const [status, setStatus] = createSignal<string>("");

  createEffect(() => {
    if (props.settings) {
      setDraft(props.settings);
    }
  });

  const featureEntries = () => Object.entries(draft()?.featureFlags ?? {}) as Array<[keyof FeatureFlags, boolean]>;

  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    setDraft((current) => (current ? { ...current, featureFlags: { ...current.featureFlags, [key]: value } } : current));
  };

  const animationMode = (key: "container" | "tradeUp" | "armory") => draft()?.animations?.[key] ?? "slot-machine";
  const setAnimationMode = (key: "container" | "tradeUp" | "armory", value: RevealAnimationMode) => {
    setDraft((current) => current ? { ...current, animations: { container: current.animations?.container ?? "slot-machine", tradeUp: current.animations?.tradeUp ?? "slot-machine", armory: current.animations?.armory ?? "slot-machine", [key]: value } } : current);
  };

  const save = async () => {
    const value = draft();
    if (!value) return;
    setStatus("Saving…");
    await fromAppPromise(props.onSave(value), "Settings save failed").match(() => {
      setStatus("Settings updated");
      props.onToast?.({ title: "Settings updated", description: "The backend settings are now active.", variant: "success" });
    }, (error) => {
      const message = appErrorMessage(error, "Save failed");
      setStatus(message);
      props.onToast?.({ title: "Settings save failed", description: message, variant: "danger" });
    });
  };

  return (
    <div class="w-[min(80vw,720px)] max-w-full overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/95 p-4 text-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-50">Settings</h3>
          <p class="mt-1 text-sm text-slate-400">Backend URL, validation, and feature flags.</p>
        </div>
        <div class="flex gap-2">
          <button class="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={() => props.onRefresh()}>
            Reload
          </button>
          <button class="rounded-full border border-cyan-500/30 bg-cyan-600/80 px-3 py-2 text-sm font-medium text-white" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>

      <Show when={status()}>
        <div class="mt-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">{status()}</div>
      </Show>

      <div class="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Reveal animations</h4>
          <p class="mt-1 text-xs text-slate-500">Choose an animation independently for each randomized operation.</p>
          <div class="mt-3 grid gap-3 sm:grid-cols-3">
            <For each={[{ key: "container", label: "Containers" }, { key: "tradeUp", label: "Trade-ups" }, { key: "armory", label: "Armory" }] as const}>{(entry) => (
              <label class="space-y-1.5 text-sm">
                <span class="text-slate-300">{entry.label}</span>
                <Select class="w-full" value={animationMode(entry.key)} onChange={(event) => setAnimationMode(entry.key, (event.currentTarget as HTMLSelectElement).value as RevealAnimationMode)}>
                  <option value="none">No animation</option>
                  <option value="countdown">Countdown</option>
                  <option value="slot-machine">Slot machine</option>
                </Select>
              </label>
            )}</For>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Armory purchase pacing</h4>
          <p class="mt-1 text-xs text-slate-500">Delay between protobuf purchase messages during a bulk buy.</p>
          <label class="mt-3 flex items-center gap-3 text-sm">
            <Input type="number" min="1" max="60" class="w-24" value={String(draft()?.armoryPurchasePacingSeconds ?? 5)} onInput={(event) => setDraft((current) => current ? { ...current, armoryPurchasePacingSeconds: Math.min(60, Math.max(1, Number((event.currentTarget as HTMLInputElement).value) || 5)) } : current)} />
            <span class="text-slate-400">seconds</span>
          </label>
        </section>

        <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Backend</h4>
          <div class="mt-3 space-y-3 text-sm text-slate-400">
            <label class="flex flex-col gap-2">
              <span class="text-slate-200">Local backend URL</span>
              <Input value={draft()?.backendUrl ?? ""} onInput={(event) => setDraft((current) => (current ? { ...current, backendUrl: (event.currentTarget as HTMLInputElement | null)?.value ?? "" } : current))} />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="text-slate-200">Validation mode</span>
              <input type="checkbox" checked={draft()?.validationMode ?? false} onChange={(event) => setDraft((current) => (current ? { ...current, validationMode: (event.currentTarget as HTMLInputElement | null)?.checked ?? false } : current))} />
            </label>
            <label class="flex items-center justify-between gap-3">
              <span class="text-slate-200">Sacrificial account mode</span>
              <input type="checkbox" checked={draft()?.sacrificialAccountMode ?? false} onChange={(event) => setDraft((current) => (current ? { ...current, sacrificialAccountMode: (event.currentTarget as HTMLInputElement | null)?.checked ?? false } : current))} />
            </label>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-3">
          <h4 class="text-sm font-semibold text-slate-100">Feature flags</h4>
          <div class="mt-3 space-y-2 text-sm text-slate-400">
            <For each={featureEntries()}>
              {(entry) => (
                <label class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <span class="text-slate-200">{entry[0]}</span>
                  <input type="checkbox" checked={entry[1]} onChange={(event) => setFeature(entry[0], (event.currentTarget as HTMLInputElement | null)?.checked ?? false)} />
                </label>
              )}
            </For>
          </div>
        </section>
      </div>
    </div>
  );
}
