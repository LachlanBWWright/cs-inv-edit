import { Show } from "solid-js";
import type { HealthStatus } from "@cs-inv-edit/contracts";

export interface HealthBadgeProps {
  health: HealthStatus | undefined;
}

export function HealthBadge(props: HealthBadgeProps) {
  return (
    <div class="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200">
      <Show when={props.health} fallback="Offline">
        {(value) => <span>{value().status.toUpperCase()}</span>}
      </Show>
    </div>
  );
}
