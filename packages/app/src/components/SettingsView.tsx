import { createEffect, createSignal, For, Show } from "solid-js";
import type { FeatureFlags, InventorySnapshot, RevealAnimationMode, SettingsData, TradeUpAnimationMode } from "@cs-inv-edit/contracts";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { randomRevealCandidate, RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

const emptyDebugReveal: RevealItem = { name: "Collection item" };

const fallbackDebugCollections: Array<[string, RevealItem[]]> = [
  ["Kilowatt Case (offline fallback)", [
    { name: "AK-47 | Inheritance", rarity: "Covert", kind: "weapon_skin", wearMin: 0, wearMax: 0.8, supportsStatTrak: true },
    { name: "AWP | Chrome Cannon", rarity: "Covert", kind: "weapon_skin", wearMin: 0, wearMax: 1, supportsStatTrak: true },
    { name: "M4A1-S | Black Lotus", rarity: "Classified", kind: "weapon_skin", wearMin: 0, wearMax: 0.7, supportsStatTrak: true },
    { name: "USP-S | Jawbreaker", rarity: "Classified", kind: "weapon_skin", wearMin: 0, wearMax: 1, supportsStatTrak: true },
    { name: "Glock-18 | Block-18", rarity: "Restricted", kind: "weapon_skin", wearMin: 0, wearMax: 0.5, supportsStatTrak: true },
    { name: "MP7 | Just Smile", rarity: "Restricted", kind: "weapon_skin", wearMin: 0, wearMax: 1, supportsStatTrak: true },
  ]],
  ["The 2018 Inferno Collection (offline fallback)", [
    { name: "SG 553 | Integrale", rarity: "Classified", kind: "weapon_skin", wearMin: 0, wearMax: 1 },
    { name: "Dual Berettas | Twin Turbo", rarity: "Classified", kind: "weapon_skin", wearMin: 0, wearMax: 1 },
    { name: "AK-47 | Safety Net", rarity: "Restricted", kind: "weapon_skin", wearMin: 0, wearMax: 0.6 },
    { name: "MP7 | Fade", rarity: "Restricted", kind: "weapon_skin", wearMin: 0, wearMax: 0.25 },
    { name: "SSG 08 | Hand Brake", rarity: "Mil-Spec Grade", kind: "weapon_skin", wearMin: 0, wearMax: 1 },
    { name: "MAC-10 | Calf Skin", rarity: "Industrial Grade", kind: "weapon_skin", wearMin: 0, wearMax: 1 },
  ]],
  ["Copenhagen 2024 Legends Sticker Capsule (offline fallback)", [
    { name: "Sticker | FaZe Clan | Copenhagen 2024", rarity: "High Grade", kind: "sticker_item" },
    { name: "Sticker | Natus Vincere | Copenhagen 2024", rarity: "High Grade", kind: "sticker_item" },
    { name: "Sticker | Spirit (Holo) | Copenhagen 2024", rarity: "Remarkable", kind: "sticker_item" },
    { name: "Sticker | G2 Esports (Holo) | Copenhagen 2024", rarity: "Remarkable", kind: "sticker_item" },
    { name: "Sticker | Vitality (Gold) | Copenhagen 2024", rarity: "Extraordinary", kind: "sticker_item" },
  ]],
];

export interface SettingsViewProps {
  settings: SettingsData | undefined;
  inventory?: InventorySnapshot;
  onRefresh: () => void;
  onSave: (next: SettingsData) => Promise<void>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function SettingsView(props: SettingsViewProps) {
  const [draft, setDraft] = createSignal<SettingsData | undefined>(props.settings);
  const [status, setStatus] = createSignal<string>("");
  const [debugAnimation, setDebugAnimation] = createSignal<RevealAnimationMode | undefined>();
  const [debugCollection, setDebugCollection] = createSignal("");

  createEffect(() => {
    if (props.settings) {
      setDraft(props.settings);
    }
  });

  const featureEntries = () => Object.entries(draft()?.featureFlags ?? {}) as Array<[keyof FeatureFlags, boolean]>;
  const featureLabel = (key: keyof FeatureFlags) => key === "showStorageUnitItems" ? "Show storage unit items" : key;
  const debugCollections = () => {
    if (props.inventory?.collections?.length) {
      return props.inventory.collections.map((collection) => [collection.name, collection.items.map((item) => ({ name: item.marketName || item.name, imageUrl: item.imageUrl, rarity: item.rarity, kind: item.kind, wear: item.paintWear, wearMin: item.wearMin, wearMax: item.wearMax }))] as [string, RevealItem[]]);
    }
    const collections = new Map<string, RevealItem[]>();
    for (const item of props.inventory?.items ?? []) {
      if (!item.collection || !item.collectionItems?.length) continue;
      const existing = collections.get(item.collection) ?? [];
      for (const collectionItem of item.collectionItems) {
        if (!existing.some((candidate) => candidate.name === (collectionItem.marketName || collectionItem.name))) {
          existing.push({ name: collectionItem.marketName || collectionItem.name, imageUrl: collectionItem.imageUrl, rarity: collectionItem.rarity, kind: collectionItem.kind, wear: collectionItem.paintWear, wearMin: collectionItem.wearMin, wearMax: collectionItem.wearMax });
        }
      }
      collections.set(item.collection, existing);
    }
    const available = [...collections.entries()].sort(([left], [right]) => left.localeCompare(right));
    return available.length > 0 ? available : fallbackDebugCollections;
  };
  const selectedDebugCollection = () => debugCollection() || debugCollections()[0]?.[0] || "";
  const selectedDebugCandidates = () => debugCollections().find(([name]) => name === selectedDebugCollection())?.[1] ?? [];
  const playDebugAnimation = (mode: Exclude<RevealAnimationMode, "none">) => {
    const candidates = selectedDebugCandidates();
    if (candidates.length === 0) return;
    setDebugReveal({ candidates, result: randomRevealCandidate(candidates, emptyDebugReveal) });
    setDebugAnimation(mode);
  };
  const [debugReveal, setDebugReveal] = createSignal<{ candidates: RevealItem[]; result: RevealItem }>({ candidates: [], result: emptyDebugReveal });

  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    setDraft((current) => (current ? { ...current, featureFlags: { ...current.featureFlags, [key]: value } } : current));
  };

  const animationMode = (key: "container" | "tradeUp" | "armory") => draft()?.animations?.[key] ?? "slot-machine";
  const setAnimationMode = (key: "container" | "tradeUp" | "armory", value: RevealAnimationMode | TradeUpAnimationMode) => {
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
    <div class="w-full max-w-full overflow-hidden text-slate-200">
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
                  <Show when={entry.key === "tradeUp"}>
                    <option value="contract-none">Contract + no animation</option>
                    <option value="contract-countdown">Contract + countdown</option>
                    <option value="contract-slot-machine">Contract + slot machine</option>
                  </Show>
                </Select>
              </label>
            )}</For>
          </div>
          <div class="mt-4 border-t border-slate-800 pt-3">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Debug previews</p>
            <p class="mt-1 text-xs text-slate-500">Play a reveal locally using loaded CS2 collection metadata, or three offline fallbacks when metadata is unavailable. This does not save settings or perform an operation.</p>
            <label class="mt-3 block space-y-1.5 text-sm">
              <span class="text-slate-300">Collection</span>
              <Select class="w-full" value={selectedDebugCollection()} disabled={debugCollections().length === 0} onChange={(event) => setDebugCollection((event.currentTarget as HTMLSelectElement).value)}>
                <For each={debugCollections()}>{([name, items]) => <option value={name}>{name} ({items.length} items)</option>}</For>
                <Show when={debugCollections().length === 0}><option value="">No collections loaded</option></Show>
              </Select>
            </label>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={selectedDebugCandidates().length === 0} class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => playDebugAnimation("countdown")}>Play countdown</button>
              <button type="button" disabled={selectedDebugCandidates().length === 0} class="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => playDebugAnimation("slot-machine")}>Play slot machine</button>
            </div>
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
                  <span class="text-slate-200">{featureLabel(entry[0])}</span>
                  <input type="checkbox" checked={entry[1]} onChange={(event) => setFeature(entry[0], (event.currentTarget as HTMLInputElement | null)?.checked ?? false)} />
                </label>
              )}
            </For>
          </div>
        </section>
      </div>
      <RevealAnimation
        open={debugAnimation() !== undefined}
        mode={debugAnimation() ?? "none"}
        title="Collection reveal preview"
        candidates={debugReveal().candidates}
        result={debugReveal().result}
        onComplete={() => setDebugAnimation(undefined)}
      />
    </div>
  );
}
