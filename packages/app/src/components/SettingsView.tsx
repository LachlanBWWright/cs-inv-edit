import { For, Show, type Component } from "solid-js";
import type { ConnectionStatus, FeatureSettings, HealthStatus } from "../lib/backend";
import { describeFlag, featureFlagOrder } from "../lib/featureFlags";
import { formatTimestamp } from "../lib/format";

interface SettingsViewProps {
  health: HealthStatus | null;
  connection: ConnectionStatus | null;
  settings: FeatureSettings;
  backendUrl: string;
  onChangeBackendUrl(value: string): void;
  onSaveSettings(): void;
  onToggleSetting(key: keyof FeatureSettings): void;
  onConnectSteam(): void;
  onDisconnectSteam(): void;
}

export const SettingsView: Component<SettingsViewProps> = (props) => {
  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-2xl font-semibold text-slate-900">Settings</h2>
        <p class="mt-1 text-sm text-slate-600">Backend health, Steam placeholders, feature flags, and validation mode all live in one place.</p>
      </div>

      <div class="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div class="space-y-5">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900">Backend health</h3>
            <div class="mt-4 space-y-2 text-sm text-slate-700">
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>Status</span>
                <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-900">{props.health?.status ?? "offline"}</span>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>Service</span>
                <span>{props.health?.service ?? "n/a"}</span>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>Last checked</span>
                <span>{formatTimestamp(props.health?.time)}</span>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900">Steam connection</h3>
            <div class="mt-4 space-y-3 text-sm text-slate-700">
              <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>State</span>
                <span class="capitalize">{props.connection?.state ?? "disconnected"}</span>
              </div>
              <Show when={props.connection?.detail}>
                <div class="rounded-lg bg-slate-50 px-3 py-2">{props.connection?.detail}</div>
              </Show>
              <div class="flex flex-wrap gap-2">
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => props.onConnectSteam()}>Connect Steam</button>
                <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => props.onDisconnectSteam()}>Disconnect</button>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-5">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900">Local backend URL</h3>
            <input class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2" value={props.backendUrl} onInput={(event) => props.onChangeBackendUrl(event.currentTarget.value)} />
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-lg font-semibold text-slate-900">Feature flags</h3>
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => props.onSaveSettings()}>Save settings</button>
            </div>
            <div class="mt-4 space-y-3">
              <For each={featureFlagOrder}>
                {(key) => (
                  <label class="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <div>
                      <div class="font-medium text-slate-900">{key}</div>
                      <div class="mt-1 text-xs text-slate-500">{describeFlag(key, props.settings)}</div>
                    </div>
                    <input type="checkbox" checked={Boolean((props.settings as Record<string, boolean>)[key])} onChange={() => props.onToggleSetting(key)} />
                  </label>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
