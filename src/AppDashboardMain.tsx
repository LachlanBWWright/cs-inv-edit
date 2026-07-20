import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { AppDashboardProps } from './AppDashboardTypes.js';

const panel = 'rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_18px_80px_-40px_rgba(56,189,248,0.55)] backdrop-blur';

type MetricProps = {
  label: string;
  value: string;
};

function Metric(props: MetricProps): JSX.Element {
  return (
    <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
      <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">{props.label}</dt>
      <dd class="mt-2 font-medium text-white">{props.value}</dd>
    </div>
  );
}

function SectionHeading(props: { eyebrow: string; title: string; badge?: string }): JSX.Element {
  return (
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{props.eyebrow}</p>
        <h2 class="mt-2 text-2xl font-semibold text-white">{props.title}</h2>
      </div>
      <Show when={props.badge}>
        <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{props.badge}</span>
      </Show>
    </div>
  );
}

function HeroSummary(props: Pick<AppDashboardProps, 'metricCards' | 'notice' | 'noticeClasses' | 'platformLabel'>): JSX.Element {
  return (
    <div class={`${panel} overflow-hidden`}>
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span class="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100">
        {props.platformLabel}
          </span>
          <h2 class="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
        UI-first review flows for sticker, trade-up, and storage operations.
          </h2>
          <p class="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
        The layout keeps high-risk actions in clear view and scales cleanly from wide desktop panes to thumb-friendly mobile stacks.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[28rem]">
          <For each={props.metricCards}>{(metric) => <Metric label={metric.label} value={metric.value} />}</For>
        </div>
      </div>
    </div>
  );
}

function PolicyPanel(props: Pick<AppDashboardProps, 'dashboard'>): JSX.Element {
  return (
    <aside class={`${panel} space-y-4`}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Policy framing</p>
          <h2 class="mt-2 text-xl font-semibold text-white">Human-led safeguards</h2>
        </div>
        <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
        Unofficial write path
        </span>
      </div>
      <div class="space-y-3">
        <For each={props.dashboard?.complianceNotes ?? []}>{(note) => (
          <article class="rounded-2xl border border-white/8 bg-white/5 p-4">
            <h3 class="font-medium text-white">{note.title}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-300">{note.detail}</p>
          </article>
        )}</For>
      </div>
    </aside>
  );
}

function WorkflowOverview(props: Pick<AppDashboardProps, 'platformLabel' | 'workflowCards'>): JSX.Element {
  return (
    <article class={`${panel} relative overflow-hidden`}>
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_36%)]" />
      <div class="relative">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Workflow overview</p>
            <h2 class="mt-2 text-2xl font-semibold text-white">A review-first command center for every operation</h2>
          </div>
          <span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
        {props.platformLabel}
          </span>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <For each={props.workflowCards}>{(card) => (
            <div class="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
              <p class="mt-3 text-xl font-semibold text-white">{card.value}</p>
              <p class="mt-2 text-sm text-slate-400">{card.detail}</p>
            </div>
        )}</For>
        </div>
      </div>
    </article>
  );
}

function NextBestActionPanel(props: Pick<AppDashboardProps, 'nextBestAction'>): JSX.Element {
  return (
    <article class={`${panel}`}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Next best action</p>
          <h2 class="mt-2 text-xl font-semibold text-white">What the interface wants you to inspect next</h2>
        </div>
        <span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
        Guided review
        </span>
      </div>
      <div class="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-4">
        <p class="text-sm font-medium text-white">{props.nextBestAction.title}</p>
        <p class="mt-2 text-sm leading-6 text-slate-300">{props.nextBestAction.detail}</p>
      </div>
      <ul class="mt-4 space-y-2 text-sm text-slate-300">
        <li class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Use the inventory cards to select an item and surface its readiness state before any plan is queued.</li>
        <li class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Keep the trade-up basket at 10 slots for a compact review surface, then stage the plan once the collection is coherent.</li>
        <li class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">Treat storage pressure as a first-class signal so high-value assets stay visible and deliberate.</li>
      </ul>
    </article>
  );
}

function FilterButtons(props: { collectionFilter: string; collections: string[]; onCollectionFilterChange: (value: string) => void }): JSX.Element {
  return (
    <div class="flex flex-wrap gap-2">
      <button
        class={`rounded-full px-3 py-2 text-xs font-medium ${props.collectionFilter === 'All' ? 'bg-sky-400 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-200'}`}
        onClick={() => props.onCollectionFilterChange('All')}
        type="button"
      >
        All collections
      </button>
      <For each={props.collections}>{(collection) => (
        <button
        class={`rounded-full px-3 py-2 text-xs font-medium ${props.collectionFilter === collection ? 'bg-sky-400 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-200'}`}
        onClick={() => props.onCollectionFilterChange(collection)}
        type="button"
        >
        {collection}
        </button>
      )}</For>
    </div>
  );
}

function InventoryCard(props: { item: AppDashboardProps['filteredInventory'][number]; isActive: boolean; inQueue: boolean; readinessClasses: Record<string, string>; onSelectItem: (id: string) => void; onTradeUpToggle: (id: string) => void }): JSX.Element {
  return (
    <article class={`group rounded-3xl border p-4 text-left transition ${props.isActive ? 'border-sky-300/70 bg-sky-400/10 shadow-[0_0_0_1px_rgba(125,211,252,0.2)]' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'}`}>
      <button class="w-full text-left" onClick={() => props.onSelectItem(props.item.id)} type="button">
        <div class={`h-28 rounded-2xl bg-gradient-to-br ${props.item.accent} p-4`}>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-slate-950/80">{props.item.weapon}</p>
              <h3 class="mt-2 text-xl font-semibold text-slate-950">{props.item.name}</h3>
            </div>
            <span class={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${props.readinessClasses[props.item.readiness]}`}>
        {props.item.readiness}
            </span>
          </div>
        </div>
        <div class="mt-4 flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-white">{props.item.finish}</p>
            <p class="mt-1 text-sm text-slate-400">{props.item.collection}</p>
          </div>
          <div class="text-right text-sm text-slate-300">
            <p>{props.item.wearLabel}</p>
            <p class="mt-1 text-xs text-slate-500">Float {props.item.wearValue.toFixed(2)}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
          <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{props.item.rarity}</span>
          <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{props.item.stickers} stickers</span>
          <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{props.item.priceBand}</span>
          <Show when={props.item.statTrak}>
            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">StatTrak</span>
          </Show>
          <Show when={props.item.inStorage}>
            <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">In storage</span>
          </Show>
          <Show when={props.inQueue}>
            <span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-sky-100">Trade-up queue</span>
          </Show>
        </div>
      </button>
      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Tap for focused review</p>
        <button class="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-400/10" onClick={() => props.onTradeUpToggle(props.item.id)} type="button">
        {props.inQueue ? 'Remove from queue' : 'Queue trade-up'}
        </button>
      </div>
    </article>
  );
}

function InventoryCollectionSection(props: Pick<AppDashboardProps, 'collectionFilter' | 'dashboard' | 'filteredInventory' | 'onCollectionFilterChange' | 'onSelectItem' | 'onTradeUpToggle' | 'readinessClasses' | 'selectedItemId' | 'tradeUpQueue'>): JSX.Element {
  return (
    <article id="inventory" class={`${panel}`}>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Inventory grid</p>
          <h2 class="mt-2 text-2xl font-semibold text-white">Dense enough for desktop, calm enough for mobile</h2>
        </div>
        <FilterButtons collectionFilter={props.collectionFilter} collections={props.dashboard?.highlightedCollections ?? []} onCollectionFilterChange={props.onCollectionFilterChange} />
      </div>
      <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <For each={props.filteredInventory}>{(item) => (
          <InventoryCard
        item={item}
        isActive={props.selectedItemId === item.id}
        inQueue={props.tradeUpQueue.includes(item.id)}
        readinessClasses={props.readinessClasses}
        onSelectItem={props.onSelectItem}
        onTradeUpToggle={props.onTradeUpToggle}
          />
        )}</For>
      </div>
    </article>
  );
}

function StickerSummary(props: { summary: AppDashboardProps['stickerPlanSummary'] }): JSX.Element {
  if (!props.summary?.value) {
    return <p class="text-sm text-amber-100">{props.summary?.message ?? 'Select an item to see sticker guidance.'}</p>;
  }

  return (
    <div>
      <p class="text-sm font-medium text-white">{props.summary.value.confidence}</p>
      <ul class="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        <For each={props.summary.value.notes}>{(note) => <li>• {note}</li>}</For>
      </ul>
    </div>
  );
}

function StickerWorkshopCard(props: Pick<AppDashboardProps, 'onStickerPresetChange' | 'onStickerReview' | 'stickerPlanSummary' | 'stickerPreset'>): JSX.Element {
  return (
    <article class={`${panel} xl:col-span-1`}>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Sticker workshop</p>
          <h2 class="mt-2 text-xl font-semibold text-white">Alignment presets</h2>
        </div>
        <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Manual review</span>
      </div>
      <div class="mt-5 grid gap-3">
        <For each={['Precision alignment', 'Symmetry lock', 'Wear-preserving balance']}>{(preset) => (
          <button class={`rounded-2xl border p-3 text-left ${props.stickerPreset === preset ? 'border-sky-300/60 bg-sky-500/10' : 'border-white/10 bg-white/5 text-slate-300'}`} onClick={() => props.onStickerPresetChange(preset)} type="button">
            <p class="font-medium text-white">{preset}</p>
            <p class="mt-1 text-sm text-slate-400">Conservative offsets and visible approval states.</p>
          </button>
        )}</For>
      </div>
      <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <StickerSummary summary={props.stickerPlanSummary} />
      </div>
      <button class="mt-5 w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300" onClick={props.onStickerReview} type="button">
        Queue sticker review
      </button>
    </article>
  );
}

function TradeUpPlanSummary(props: { summary: AppDashboardProps['tradeUpPlanSummary'] }): JSX.Element {
  if (!props.summary?.value) {
    return <p class="text-sm text-amber-100">{props.summary?.message ?? 'Select items to plan a trade-up.'}</p>;
  }

  return (
    <>
      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Collection</p>
          <p class="mt-2 font-medium text-white">{props.summary.value.collection}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Average float</p>
          <p class="mt-2 font-medium text-white">{props.summary.value.averageWear}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Output framing</p>
          <p class="mt-2 font-medium text-white">{props.summary.value.predictedTier}</p>
        </div>
      </div>
      <p class="mt-4 text-sm text-slate-300">{props.summary.value.outputTheme}</p>
    </>
  );
}

function TradeUpPlannerCard(props: Pick<AppDashboardProps, 'onTradeUpReview' | 'tradeUpPlanSummary' | 'tradeUpQueue'>): JSX.Element {
  return (
    <article class={`${panel} xl:col-span-1`}>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Trade-up planner</p>
          <h2 class="mt-2 text-xl font-semibold text-white">Ten-slot basket review</h2>
        </div>
        <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{props.tradeUpQueue.length}/10 selected</span>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-5">
        <For each={Array.from({ length: 10 }, (_, index) => props.tradeUpQueue[index])}>{(itemId, index) => (
          <div class="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p class="text-[11px] uppercase tracking-[0.22em] text-slate-500">Slot {index() + 1}</p>
            <Show when={itemId} fallback={<p class="mt-3 text-sm text-slate-400">Choose item</p>}>
        {(value) => <p class="mt-3 text-sm font-medium text-white">{value()}</p>}
            </Show>
          </div>
        )}</For>
      </div>
      <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <TradeUpPlanSummary summary={props.tradeUpPlanSummary} />
      </div>
      <button class="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200" onClick={props.onTradeUpReview} type="button">
        Stage trade-up review
      </button>
    </article>
  );
}

function StoragePlanSummary(props: { summary: AppDashboardProps['storagePlanSummary'] }): JSX.Element {
  if (!props.summary?.value) {
    return <p>{props.summary?.message ?? 'Select an item and storage unit to plan the move.'}</p>;
  }

  return (
    <div>
      <p class="font-medium text-white">{props.summary.value.summary}</p>
      <p class="mt-2 text-sm text-slate-400">Free slots after move: {props.summary.value.targetFreeSlots}</p>
    </div>
  );
}

function StorageUnitButton(props: { storageUnit: AppDashboardProps['dashboard'] extends undefined ? never : NonNullable<AppDashboardProps['dashboard']>['storageUnits'][number]; selectedStorageId: string; onSelectStorage: (unitId: string) => void }): JSX.Element {
  const active = props.storageUnit.id === props.selectedStorageId;
  const fill = Math.round((props.storageUnit.occupied / props.storageUnit.capacity) * 100);

  return (
    <button class={`w-full rounded-2xl border p-4 text-left ${active ? 'border-sky-300/60 bg-sky-500/10' : 'border-white/10 bg-white/5'}`} onClick={() => props.onSelectStorage(props.storageUnit.id)} type="button">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-medium text-white">{props.storageUnit.name}</p>
          <p class="mt-1 text-sm text-slate-400">{props.storageUnit.zone}</p>
        </div>
        <span class="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">{fill}%</span>
      </div>
      <div class="mt-4 h-2 rounded-full bg-white/10">
        <div class="h-2 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${fill}%` }} />
      </div>
      <p class="mt-3 text-sm text-slate-300">{props.storageUnit.theme}</p>
    </button>
  );
}

function StorageOrchestratorCard(props: Pick<AppDashboardProps, 'dashboard' | 'onSelectStorage' | 'onStorageReview' | 'selectedStorageId' | 'storagePlanSummary'>): JSX.Element {
  return (
    <article class={`${panel} xl:col-span-1`}>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Storage orchestrator</p>
          <h2 class="mt-2 text-xl font-semibold text-white">Capacity-aware routing</h2>
        </div>
        <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Queue first, move later</span>
      </div>
      <div class="mt-5 space-y-3">
        <For each={props.dashboard?.storageUnits ?? []}>{(storageUnit) => <StorageUnitButton storageUnit={storageUnit} selectedStorageId={props.selectedStorageId} onSelectStorage={props.onSelectStorage} />}</For>
      </div>
      <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
        <StoragePlanSummary summary={props.storagePlanSummary} />
      </div>
      <button class="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200" onClick={props.onStorageReview} type="button">
        Reserve storage move
      </button>
    </article>
  );
}

export function AppDashboardMain(props: AppDashboardProps): JSX.Element {
  return (
    <main class="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <section class="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <div class="space-y-6">
          <HeroSummary metricCards={props.metricCards} notice={props.notice} noticeClasses={props.noticeClasses} platformLabel={props.platformLabel} />
          <div class={`rounded-2xl border px-4 py-3 text-sm ${props.noticeClasses}`}>
        {props.notice.message}
          </div>
        </div>
        <PolicyPanel dashboard={props.dashboard} />
      </section>
      <section class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <WorkflowOverview nextBestAction={props.nextBestAction} platformLabel={props.platformLabel} workflowCards={props.workflowCards} />
        <NextBestActionPanel nextBestAction={props.nextBestAction} />
      </section>
      <section class="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div class="space-y-6">
          <InventoryCollectionSection
        collectionFilter={props.collectionFilter}
        dashboard={props.dashboard}
        filteredInventory={props.filteredInventory}
        onCollectionFilterChange={props.onCollectionFilterChange}
        onSelectItem={props.onSelectItem}
        onTradeUpToggle={props.onTradeUpToggle}
        readinessClasses={props.readinessClasses}
        selectedItemId={props.selectedItemId}
        tradeUpQueue={props.tradeUpQueue}
          />
          <section id="workbench" class="grid gap-6 xl:grid-cols-3">
            <StickerWorkshopCard onStickerPresetChange={props.onStickerPresetChange} onStickerReview={props.onStickerReview} stickerPlanSummary={props.stickerPlanSummary} stickerPreset={props.stickerPreset} />
            <TradeUpPlannerCard onTradeUpReview={props.onTradeUpReview} tradeUpPlanSummary={props.tradeUpPlanSummary} tradeUpQueue={props.tradeUpQueue} />
            <StorageOrchestratorCard dashboard={props.dashboard} onSelectStorage={props.onSelectStorage} onStorageReview={props.onStorageReview} selectedStorageId={props.selectedStorageId} storagePlanSummary={props.storagePlanSummary} />
          </section>
        </div>
      </section>
    </main>
  );
}
