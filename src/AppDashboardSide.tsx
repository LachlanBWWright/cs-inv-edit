import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { AppDashboardProps } from './AppDashboardTypes.js';

const panel = 'rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_18px_80px_-40px_rgba(56,189,248,0.55)] backdrop-blur';

type SelectedItemSummaryProps = {
  item: NonNullable<AppDashboardProps['dashboard']>['inventory'][number];
  readinessClasses: Record<string, string>;
};

function SelectedItemSummary(props: SelectedItemSummaryProps): JSX.Element {
  return (
    <div class="mt-5 space-y-5">
      <div class={`rounded-3xl bg-gradient-to-br ${props.item.accent} p-5 text-slate-950`}>
        <p class="text-xs uppercase tracking-[0.24em] text-slate-900/70">{props.item.collection}</p>
        <h3 class="mt-3 text-3xl font-semibold">{props.item.name}</h3>
        <p class="mt-2 text-base font-medium">{props.item.finish}</p>
      </div>
      <dl class="grid grid-cols-2 gap-3 text-sm text-slate-300">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">Wear</dt>
          <dd class="mt-2 font-medium text-white">{`${props.item.wearLabel} · ${props.item.wearValue.toFixed(2)}`}</dd>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">Price band</dt>
          <dd class="mt-2 font-medium text-white">{props.item.priceBand}</dd>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">Sticker count</dt>
          <dd class="mt-2 font-medium text-white">{`${props.item.stickers}`}</dd>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
          <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">Routing</dt>
          <dd class="mt-2 font-medium text-white">{props.item.inStorage ? 'Storage managed' : 'Backpack visible'}</dd>
        </div>
      </dl>
      <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <p class="font-medium text-white">Why this panel matters</p>
        <p class="mt-2 leading-6">
        The details panel keeps destructive context, market posture, and routing state in one place so users do not have to jump
        between unrelated screens before confirming a plan.
        </p>
      </div>
    </div>
  );
}

function FocusedItemPanel(props: Pick<AppDashboardProps, 'dashboard' | 'readinessClasses' | 'selectedItemId'>): JSX.Element {
  const selectedItem = () => props.dashboard?.inventory.find((item) => item.id === props.selectedItemId);

  return (
    <article class={`${panel}`}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Focused item</p>
          <h2 class="mt-2 text-2xl font-semibold text-white">Details and guardrails</h2>
        </div>
        <Show when={selectedItem()}>{(item) => <span class={`rounded-full px-3 py-1 text-xs font-semibold ${props.readinessClasses[item().readiness]}`}>{item().readiness}</span>}</Show>
      </div>
      <Show when={selectedItem()} fallback={<p class="mt-5 text-sm text-slate-400">Pick an inventory card to inspect it here.</p>}>
        {(item) => <SelectedItemSummary item={item()} readinessClasses={props.readinessClasses} />}
      </Show>
    </article>
  );
}

function ActivityRail(props: Pick<AppDashboardProps, 'activityClasses' | 'dashboard'>): JSX.Element {
  return (
    <article id="activity" class={`${panel}`}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Activity rail</p>
          <h2 class="mt-2 text-2xl font-semibold text-white">Recent review signals</h2>
        </div>
        <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Backend events</span>
      </div>
      <div class="mt-5 space-y-3">
        <For each={props.dashboard?.activity ?? []}>{(event) => (
          <article class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-medium text-white">{event.title}</h3>
                <p class="mt-2 text-sm leading-6 text-slate-300">{event.detail}</p>
              </div>
              <span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${props.activityClasses[event.status]}`}>{event.status}</span>
            </div>
            <p class="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">{event.timestamp}</p>
          </article>
        )}</For>
      </div>
    </article>
  );
}

function StatusPanel(props: Pick<AppDashboardProps, 'dashboard' | 'toneClasses'>): JSX.Element {
  return (
    <article class={`${panel}`}>
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Connection and compliance status</p>
        <h2 class="mt-2 text-2xl font-semibold text-white">Operational posture</h2>
      </div>
      <div class="mt-5 space-y-3">
        <For each={props.dashboard?.statusFlags ?? []}>{(status) => (
          <div class={`rounded-2xl border p-4 ${props.toneClasses[status.tone]}`}>
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium text-white">{status.label}</p>
              <span class="text-xs uppercase tracking-[0.22em]">{status.tone}</span>
            </div>
            <p class="mt-2 text-sm opacity-90">{status.value}</p>
          </div>
        )}</For>
      </div>
    </article>
  );
}

export function AppDashboardSide(props: AppDashboardProps): JSX.Element {
  return (
    <aside class="space-y-6">
      <FocusedItemPanel dashboard={props.dashboard} readinessClasses={props.readinessClasses} selectedItemId={props.selectedItemId} />
      <ActivityRail activityClasses={props.activityClasses} dashboard={props.dashboard} />
      <StatusPanel dashboard={props.dashboard} toneClasses={props.toneClasses} />
    </aside>
  );
}
