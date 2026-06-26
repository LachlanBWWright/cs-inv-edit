import { createSignal, For, Show } from "solid-js";
import type { FeatureFlags, SettingsData } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format";

export interface SettingsViewProps {
  settings: SettingsData | undefined;
  onRefresh: () => void;
  onSave: (next: SettingsData) => Promise<void>;
}

export function SettingsView(props: SettingsViewProps) {
  const [draft, setDraft] = createSignal<SettingsData | undefined>(props.settings);
  const [status, setStatus] = createSignal<string>("");

  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    setDraft((current) => (current ? { ...current, featureFlags: { ...current.featureFlags, [key]: value } } : current));
  };

  const save = async () => {
    const value = draft();
    if (!value) return;
    setStatus("Saving…");
    try {
      await props.onSave(value);
      setStatus("Settings updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold">Settings</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-600">Backend health, Steam placeholder state, feature flags, and local backend URL are surfaced here.</p>
        </div>
        <div class="flex gap-2">
          <button class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-500" onClick={() => props.onRefresh()}>
            Reload
          </button>
          <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-sm text-white hover:bg-cyan-800" onClick={() => save()}>
            Save
          </button>
        </div>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Backend</h3>
          <div class="mt-4 space-y-3 text-sm text-slate-700">
            <div class="flex items-center justify-between gap-3">
              <span>Local backend URL</span>
              <input class="rounded-md border border-slate-300 px-3 py-2" value={draft()?.backendUrl ?? ""} onInput={(event) => setDraft((current) => current ? { ...current, backendUrl: event.currentTarget.value } : current)} />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Validation mode</span>
              <input type="checkbox" checked={draft()?.validationMode ?? false} onChange={(event) => setDraft((current) => current ? { ...current, validationMode: event.currentTarget.checked } : current)} />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Sacrificial account mode</span>
              <input type="checkbox" checked={draft()?.sacrificialAccountMode ?? false} onChange={(event) => setDraft((current) => current ? { ...current, sacrificialAccountMode: event.currentTarget.checked } : current)} />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Feature flags</h3>
          <div class="mt-4 space-y-3 text-sm text-slate-700">
            <For each={Object.entries(draft()?.featureFlags ?? {}) as [keyof FeatureFlags, boolean][]}>
              {(entry) => (
                <label class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <span>{entry[0]}</span>
                  <input type="checkbox" checked={entry[1]} onChange={(event) => setFeature(entry[0], event.currentTarget.checked)} />
                </label>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
