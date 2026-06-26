import { Show, type Component } from "solid-js";
import type { HealthStatus } from "../lib/backend";

interface HealthBadgeProps {
  health: HealthStatus | null;
  loading: boolean;
}

export const HealthBadge: Component<HealthBadgeProps> = (props) => {
  return (
    <div class="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm">
      <span class={`h-2.5 w-2.5 rounded-full ${props.loading ? "bg-amber-400" : props.health?.status === "ok" ? "bg-emerald-400" : "bg-rose-400"}`} />
      <span class="text-slate-200">
        <Show when={!props.loading && props.health} fallback="Checking backend">
          {(health) => `Backend ${health().service}`}
        </Show>
      </span>
    </div>
  );
};
