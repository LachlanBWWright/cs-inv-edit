import { createEffect, createSignal, For, Show } from "solid-js";
import type { FeatureFlags, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";

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

  const save = async () => {
    const value = draft();
    if (!value) return;
    setStatus("Saving…");
    try {
      await props.onSave(value);
      setStatus("Settings updated");
      props.onToast?.({ title: "Settings updated", description: "The backend settings are now active.", variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setStatus(message);
      props.onToast?.({ title: "Settings save failed", description: message, variant: "danger" });
    }
  };

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold text-slate-50">Settings</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">Backend health, Steam connection state, feature flags, and local backend URL are surfaced here.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => props.onRefresh()}>
            Reload
          </Button>
          <Button onClick={() => void save()}>
            Save
          </Button>
        </div>
      </header>

      <Show when={status()}>
        <Alert>{status()}</Alert>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardContent>
            <h3 class="text-lg font-semibold text-slate-50">Backend</h3>
            <div class="mt-4 space-y-4 text-sm text-slate-400">
              <div class="flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-200">Local backend URL</span>
                  <span class="text-xs text-slate-500">URL to the backend server</span>
                </div>
                <Input class="max-w-xs" value={draft()?.backendUrl ?? ""} onInput={(event) => setDraft((current) => (current ? { ...current, backendUrl: (event.currentTarget as HTMLInputElement | null)?.value ?? "" } : current))} />
              </div>
              <div class="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-200">Validation mode</span>
                  <span class="text-xs text-slate-500">Ensure operations follow game rules before execution.</span>
                </div>
                <input type="checkbox" checked={draft()?.validationMode ?? false} onChange={(event) => setDraft((current) => (current ? { ...current, validationMode: (event.currentTarget as HTMLInputElement | null)?.checked ?? false } : current))} />
              </div>
              <div class="flex items-center justify-between gap-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-200">Sacrificial account mode</span>
                  <span class="text-xs text-slate-500">WARNING: operations can consume real items on the connected account.</span>
                </div>
                <input type="checkbox" checked={draft()?.sacrificialAccountMode ?? false} onChange={(event) => setDraft((current) => (current ? { ...current, sacrificialAccountMode: (event.currentTarget as HTMLInputElement | null)?.checked ?? false } : current))} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 class="text-lg font-semibold text-slate-50">Feature flags</h3>
            <div class="mt-4 space-y-3 text-sm text-slate-400">
              <For each={featureEntries()}>
                {(entry) => (
                  <label class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <span class="text-slate-200">{entry[0]}</span>
                    <input type="checkbox" checked={entry[1]} onChange={(event) => setFeature(entry[0], (event.currentTarget as HTMLInputElement | null)?.checked ?? false)} />
                  </label>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
