import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import { buildStickerPlan, buildTradeUpPlan, loadDashboardData, prepareStorageMove } from './dashboard-service'
import type { ActivityEvent, DashboardData, InventoryItem, StatusFlag } from './types'

type Notice = {
  tone: 'info' | 'success' | 'warning'
  message: string
}

const toneClasses: Record<StatusFlag['tone'], string> = {
  Stable: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  Watch: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  Risk: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
}

const readinessClasses: Record<InventoryItem['readiness'], string> = {
  Ready: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/20',
  Review: 'bg-amber-500/15 text-amber-100 ring-1 ring-inset ring-amber-400/20',
  Blocked: 'bg-rose-500/15 text-rose-100 ring-1 ring-inset ring-rose-400/20',
}

const activityClasses: Record<ActivityEvent['status'], string> = {
  Completed: 'bg-emerald-500/15 text-emerald-200',
  Queued: 'bg-sky-500/15 text-sky-100',
  Review: 'bg-amber-500/15 text-amber-100',
}

const platformLabel = (() => {
  if (window.desktopShell?.isDesktop === true) {
    return `Desktop shell · ${window.desktopShell.platform}`
  }

  return 'Web shell · responsive review mode'
})()

const iconButton = 'rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium tracking-[0.24em] text-slate-200 transition hover:border-sky-300/50 hover:bg-sky-400/10'
const panel = 'rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_18px_80px_-40px_rgba(56,189,248,0.55)] backdrop-blur'

const createReviewEvent = (title: string, detail: string): ActivityEvent => ({
  id: `activity-${crypto.randomUUID()}`,
  title,
  detail,
  status: 'Queued',
  timestamp: 'just now',
})

function App() {
  const [dashboard, setDashboard] = createSignal<DashboardData>()
  const [selectedItemId, setSelectedItemId] = createSignal<string>('')
  const [tradeUpQueue, setTradeUpQueue] = createSignal<string[]>([])
  const [selectedStorageId, setSelectedStorageId] = createSignal<string>('')
  const [collectionFilter, setCollectionFilter] = createSignal<string>('All')
  const [stickerPreset, setStickerPreset] = createSignal<string>('Precision alignment')
  const [notice, setNotice] = createSignal<Notice>({
    tone: 'info',
    message: 'Loading the placeholder-safe inventory control surface…',
  })

  onMount(() => {
    void loadDashboardData().match(
      (data) => {
        setDashboard(data)
        setSelectedItemId(data.inventory[0]?.id ?? '')
        setTradeUpQueue(data.recommendedTradeUpIds)
        setSelectedStorageId(data.storageUnits[0]?.id ?? '')
        setNotice({
          tone: 'success',
          message: 'Dashboard ready. Every action is framed as a reviewed plan with placeholder data.',
        })
      },
      (error) => {
        setNotice({ tone: 'warning', message: error.message })
      },
    )
  })

  const selectedItem = createMemo(() => dashboard()?.inventory.find((item) => item.id === selectedItemId()))
  const selectedStorage = createMemo(() => dashboard()?.storageUnits.find((unit) => unit.id === selectedStorageId()))

  const filteredInventory = createMemo(() => {
    const data = dashboard()

    if (data === undefined) {
      return []
    }

    const filter = collectionFilter()

    if (filter === 'All') {
      return data.inventory
    }

    return data.inventory.filter((item) => item.collection === filter)
  })

  const tradeUpItems = createMemo(() => {
    const data = dashboard()

    if (data === undefined) {
      return []
    }

    return tradeUpQueue()
      .map((id) => data.inventory.find((item) => item.id === id))
      .filter((item): item is InventoryItem => item !== undefined)
  })

  const tradeUpPlan = createMemo(() => buildTradeUpPlan(tradeUpItems()))
  const stickerPlan = createMemo(() => {
    const item = selectedItem()

    return item === undefined ? undefined : buildStickerPlan(item, stickerPreset())
  })
  const storagePlan = createMemo(() => {
    const item = selectedItem()
    const storageUnit = selectedStorage()

    if (item === undefined || storageUnit === undefined) {
      return undefined
    }

    return prepareStorageMove(item, storageUnit)
  })

  const stickerPlanSummary = createMemo(() => {
    return stickerPlan()?.match(
      (value) => ({ kind: 'ok' as const, message: value.confidence, value }),
      (error) => ({ kind: 'err' as const, message: error.message, value: undefined }),
    )
  })

  const tradeUpPlanSummary = createMemo(() =>
    tradeUpPlan().match(
      (value) => ({ kind: 'ok' as const, message: value.predictedTier, value }),
      (error) => ({ kind: 'err' as const, message: error.message, value: undefined }),
    ),
  )

  const storagePlanSummary = createMemo(() => {
    return storagePlan()?.match(
      (value) => ({ kind: 'ok' as const, message: value.summary, value }),
      (error) => ({ kind: 'err' as const, message: error.message, value: undefined }),
    )
  })

  const appendActivity = (event: ActivityEvent): void => {
    const current = dashboard()

    if (current === undefined) {
      return
    }

    setDashboard({
      ...current,
      activity: [event, ...current.activity].slice(0, 6),
    })
  }

  const handleTradeUpToggle = (itemId: string): void => {
    const currentQueue = tradeUpQueue()
    const alreadyQueued = currentQueue.includes(itemId)

    if (alreadyQueued) {
      setTradeUpQueue(currentQueue.filter((id) => id !== itemId))
      return
    }

    if (currentQueue.length >= 10) {
      setNotice({ tone: 'warning', message: 'Trade-up review baskets cap at 10 items.' })
      return
    }

    setTradeUpQueue([...currentQueue, itemId])
  }

  const handleStickerReview = (): void => {
    const plan = stickerPlan()?.match(
      (value) => ({ kind: 'ok' as const, value }),
      (error) => ({ kind: 'err' as const, error }),
    )

    if (plan === undefined) {
      setNotice({ tone: 'warning', message: 'Select an item before opening sticker review.' })
      return
    }

    if (plan.kind === 'err') {
      setNotice({ tone: 'warning', message: plan.error.message })
      return
    }

    setNotice({ tone: 'success', message: `${plan.value.preset} queued for manual review.` })
    appendActivity(createReviewEvent('Sticker refinement queued', plan.value.notes[0] ?? 'Review staged.'))
  }

  const handleStorageReview = (): void => {
    const plan = storagePlan()?.match(
      (value) => ({ kind: 'ok' as const, value }),
      (error) => ({ kind: 'err' as const, error }),
    )

    if (plan === undefined) {
      setNotice({ tone: 'warning', message: 'Select an item and storage unit before reviewing the move.' })
      return
    }

    if (plan.kind === 'err') {
      setNotice({ tone: 'warning', message: plan.error.message })
      return
    }

    setNotice({ tone: 'success', message: plan.value.summary })
    appendActivity(createReviewEvent('Storage move reserved', plan.value.summary))
  }

  const handleTradeUpReview = (): void => {
    const plan = tradeUpPlan().match(
      (value) => ({ kind: 'ok' as const, value }),
      (error) => ({ kind: 'err' as const, error }),
    )

    if (plan.kind === 'err') {
      setNotice({ tone: 'warning', message: plan.error.message })
      return
    }

    setNotice({ tone: 'success', message: `${plan.value.predictedTier} review staged for ${plan.value.collection}.` })
    appendActivity(createReviewEvent('Trade-up basket reviewed', plan.value.outputTheme))
  }

  const openReference = async (url: string): Promise<void> => {
    if (window.desktopShell?.isDesktop === true) {
      await window.desktopShell.openExternal(url)
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const metricCards = createMemo(() => {
    const data = dashboard()

    if (data === undefined) {
      return []
    }

    const readyCount = data.inventory.filter((item) => item.readiness === 'Ready').length
    const storageOccupancy = data.storageUnits.reduce((sum, unit) => sum + unit.occupied, 0)
    const storageCapacity = data.storageUnits.reduce((sum, unit) => sum + unit.capacity, 0)

    return [
      { label: 'Tracked items', value: `${data.inventory.length}`, detail: 'Placeholder inventory cards for visual QA' },
      { label: 'Ready actions', value: `${readyCount}`, detail: 'Safe review pathways surfaced before mutation' },
      { label: 'Storage usage', value: `${Math.round((storageOccupancy / storageCapacity) * 100)}%`, detail: 'Capacity pressure shown before routing items' },
      { label: 'Session start', value: data.sessionStartedAt.slice(11, 16) + ' UTC', detail: 'Started from the recorded implementation timestamp' },
    ]
  })

  const noticeClasses = createMemo(() => {
    const current = notice().tone

    if (current === 'success') {
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    }

    if (current === 'warning') {
      return 'border-amber-400/30 bg-amber-500/10 text-amber-50'
    }

    return 'border-sky-400/30 bg-sky-500/10 text-sky-100'
  })

  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_48%,_#020617_100%)] text-slate-100">
      <header class="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.32em] text-sky-200">CS inventory edit</p>
            <h1 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Responsive operations cockpit</h1>
            <p class="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
              {dashboard()?.platformFocus ?? 'Loading cross-platform review shell…'}
            </p>
          </div>
          <div class="hidden items-center gap-2 md:flex">
            <a class={iconButton} href="#inventory">Inventory</a>
            <a class={iconButton} href="#workbench">Workbench</a>
            <a class={iconButton} href="#activity">Activity</a>
            <button class={iconButton} onClick={() => void openReference('https://solidjs.com')} type="button">
              SolidJS
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <section class="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
          <div class="space-y-6">
            <div class={`${panel} overflow-hidden`}>
              <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <span class="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100">
                    {platformLabel}
                  </span>
                  <h2 class="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-white sm:text-4xl">
                    UI-first review flows for sticker, trade-up, and storage operations.
                  </h2>
                  <p class="mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
                    The layout keeps high-risk actions in clear view, scales cleanly from wide desktop panes to thumb-friendly mobile stacks,
                    and stays explicit about placeholder-only data.
                  </p>
                </div>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[28rem]">
                  <For each={metricCards()}>
                    {(metric) => (
                      <article class="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p class="text-xs uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                        <p class="mt-3 text-2xl font-semibold text-white">{metric.value}</p>
                        <p class="mt-2 text-xs text-slate-300">{metric.detail}</p>
                      </article>
                    )}
                  </For>
                </div>
              </div>
            </div>

            <div class={`rounded-2xl border px-4 py-3 text-sm ${noticeClasses()}`}>
              {notice().message}
            </div>
          </div>

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
              <For each={dashboard()?.complianceNotes ?? []}>
                {(note) => (
                  <article class="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <h3 class="font-medium text-white">{note.title}</h3>
                    <p class="mt-2 text-sm leading-6 text-slate-300">{note.detail}</p>
                  </article>
                )}
              </For>
            </div>
          </aside>
        </section>

        <section class="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div class="space-y-6">
            <article id="inventory" class={`${panel}`}>
              <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Inventory grid</p>
                  <h2 class="mt-2 text-2xl font-semibold text-white">Dense enough for desktop, calm enough for mobile</h2>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    class={`rounded-full px-3 py-2 text-xs font-medium ${collectionFilter() === 'All' ? 'bg-sky-400 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-200'}`}
                    onClick={() => setCollectionFilter('All')}
                    type="button"
                  >
                    All collections
                  </button>
                  <For each={dashboard()?.highlightedCollections ?? []}>
                    {(collection) => (
                      <button
                        class={`rounded-full px-3 py-2 text-xs font-medium ${collectionFilter() === collection ? 'bg-sky-400 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-200'}`}
                        onClick={() => setCollectionFilter(collection)}
                        type="button"
                      >
                        {collection}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <For each={filteredInventory()}>
                  {(item) => {
                    const isActive = () => selectedItemId() === item.id
                    const inQueue = () => tradeUpQueue().includes(item.id)

                    return (
                      <article
                        class={`group rounded-3xl border p-4 text-left transition ${isActive() ? 'border-sky-300/70 bg-sky-400/10 shadow-[0_0_0_1px_rgba(125,211,252,0.2)]' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'}`}
                      >
                        <button class="w-full text-left" onClick={() => setSelectedItemId(item.id)} type="button">
                          <div class={`h-28 rounded-2xl bg-gradient-to-br ${item.accent} p-4`}>
                            <div class="flex items-start justify-between gap-3">
                              <div>
                                <p class="text-xs uppercase tracking-[0.24em] text-slate-950/80">{item.weapon}</p>
                                <h3 class="mt-2 text-xl font-semibold text-slate-950">{item.name}</h3>
                              </div>
                              <span class={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${readinessClasses[item.readiness]}`}>
                                {item.readiness}
                              </span>
                            </div>
                          </div>
                          <div class="mt-4 flex items-start justify-between gap-4">
                            <div>
                              <p class="text-sm font-medium text-white">{item.finish}</p>
                              <p class="mt-1 text-sm text-slate-400">{item.collection}</p>
                            </div>
                            <div class="text-right text-sm text-slate-300">
                              <p>{item.wearLabel}</p>
                              <p class="mt-1 text-xs text-slate-500">Float {item.wearValue.toFixed(2)}</p>
                            </div>
                          </div>
                          <div class="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{item.rarity}</span>
                            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{item.stickers} stickers</span>
                            <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{item.priceBand}</span>
                            <Show when={item.statTrak}>
                              <span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">StatTrak</span>
                            </Show>
                            <Show when={item.inStorage}>
                              <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">In storage</span>
                            </Show>
                            <Show when={inQueue()}>
                              <span class="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-sky-100">Trade-up queue</span>
                            </Show>
                          </div>
                        </button>
                        <div class="mt-4 flex items-center justify-between">
                          <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Tap for focused review</p>
                          <button
                            class="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-400/10"
                            onClick={() => handleTradeUpToggle(item.id)}
                            type="button"
                          >
                            {inQueue() ? 'Remove from queue' : 'Queue trade-up'}
                          </button>
                        </div>
                      </article>
                    )
                  }}
                </For>
              </div>
            </article>

            <section id="workbench" class="grid gap-6 xl:grid-cols-3">
              <article class={`${panel} xl:col-span-1`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Sticker workshop</p>
                    <h2 class="mt-2 text-xl font-semibold text-white">Alignment presets</h2>
                  </div>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Manual review</span>
                </div>
                <div class="mt-5 grid gap-3">
                  <For each={['Precision alignment', 'Symmetry lock', 'Wear-preserving balance']}>
                    {(preset) => (
                      <button
                        class={`rounded-2xl border p-3 text-left ${stickerPreset() === preset ? 'border-sky-300/60 bg-sky-500/10' : 'border-white/10 bg-white/5 text-slate-300'}`}
                        onClick={() => setStickerPreset(preset)}
                        type="button"
                      >
                        <p class="font-medium text-white">{preset}</p>
                        <p class="mt-1 text-sm text-slate-400">Conservative offsets and visible approval states.</p>
                      </button>
                    )}
                  </For>
                </div>
                <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <Show when={stickerPlanSummary()} fallback={<p class="text-sm text-slate-400">Select an item to see sticker guidance.</p>}>
                    {(summary) => (
                      <Show when={summary().value} fallback={<p class="text-sm text-amber-100">{summary().message}</p>}>
                        {(value) => (
                          <div>
                            <p class="text-sm font-medium text-white">{value().confidence}</p>
                            <ul class="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                              <For each={value().notes}>{(note) => <li>• {note}</li>}</For>
                            </ul>
                          </div>
                        )}
                      </Show>
                    )}
                  </Show>
                </div>
                <button class="mt-5 w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300" onClick={handleStickerReview} type="button">
                  Queue sticker review
                </button>
              </article>

              <article class={`${panel} xl:col-span-1`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Trade-up planner</p>
                    <h2 class="mt-2 text-xl font-semibold text-white">Ten-slot basket review</h2>
                  </div>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{tradeUpQueue().length}/10 selected</span>
                </div>
                <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-5">
                  <For each={Array.from({ length: 10 }, (_, index) => tradeUpItems()[index])}>
                    {(item, index) => (
                      <div class="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p class="text-[11px] uppercase tracking-[0.22em] text-slate-500">Slot {index() + 1}</p>
                        <Show when={item} fallback={<p class="mt-3 text-sm text-slate-400">Choose item</p>}>
                          {(value) => (
                            <>
                              <p class="mt-3 text-sm font-medium text-white">{value().name}</p>
                              <p class="mt-1 text-xs text-slate-400">{value().finish}</p>
                            </>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <Show when={tradeUpPlanSummary().value} fallback={<p class="text-sm text-amber-100">{tradeUpPlanSummary().message}</p>}>
                    {(value) => (
                      <>
                        <div class="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Collection</p>
                            <p class="mt-2 font-medium text-white">{value().collection}</p>
                          </div>
                          <div>
                            <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Average float</p>
                            <p class="mt-2 font-medium text-white">{value().averageWear}</p>
                          </div>
                          <div>
                            <p class="text-xs uppercase tracking-[0.22em] text-slate-500">Output framing</p>
                            <p class="mt-2 font-medium text-white">{value().predictedTier}</p>
                          </div>
                        </div>
                        <p class="mt-4 text-sm text-slate-300">{value().outputTheme}</p>
                      </>
                    )}
                  </Show>
                </div>
                <button class="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200" onClick={handleTradeUpReview} type="button">
                  Stage trade-up review
                </button>
              </article>

              <article class={`${panel} xl:col-span-1`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Storage orchestrator</p>
                    <h2 class="mt-2 text-xl font-semibold text-white">Capacity-aware routing</h2>
                  </div>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Queue first, move later</span>
                </div>
                <div class="mt-5 space-y-3">
                  <For each={dashboard()?.storageUnits ?? []}>
                    {(storageUnit) => {
                      const active = () => storageUnit.id === selectedStorageId()
                      const fill = () => Math.round((storageUnit.occupied / storageUnit.capacity) * 100)

                      return (
                        <button
                          class={`w-full rounded-2xl border p-4 text-left ${active() ? 'border-sky-300/60 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}
                          onClick={() => setSelectedStorageId(storageUnit.id)}
                          type="button"
                        >
                          <div class="flex items-start justify-between gap-4">
                            <div>
                              <p class="font-medium text-white">{storageUnit.name}</p>
                              <p class="mt-1 text-sm text-slate-400">{storageUnit.zone}</p>
                            </div>
                            <span class="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">{fill()}%</span>
                          </div>
                          <div class="mt-4 h-2 rounded-full bg-white/10">
                            <div class="h-2 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${fill()}%` }} />
                          </div>
                          <p class="mt-3 text-sm text-slate-300">{storageUnit.theme}</p>
                        </button>
                      )
                    }}
                  </For>
                </div>
                <div class="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
                  <Show when={storagePlanSummary()} fallback={<p>Select an item and storage unit to plan the move.</p>}>
                    {(summary) => (
                      <Show when={summary().value} fallback={<p class="text-amber-100">{summary().message}</p>}>
                        {(value) => (
                          <div>
                            <p class="font-medium text-white">{value().summary}</p>
                            <p class="mt-2 text-sm text-slate-400">Free slots after move: {value().targetFreeSlots}</p>
                          </div>
                        )}
                      </Show>
                    )}
                  </Show>
                </div>
                <button class="mt-5 w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200" onClick={handleStorageReview} type="button">
                  Reserve storage move
                </button>
              </article>
            </section>
          </div>

          <aside class="space-y-6">
            <article class={`${panel}`}>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Focused item</p>
                  <h2 class="mt-2 text-2xl font-semibold text-white">Details and guardrails</h2>
                </div>
                <Show when={selectedItem()}>
                  {(item) => <span class={`rounded-full px-3 py-1 text-xs font-semibold ${readinessClasses[item().readiness]}`}>{item().readiness}</span>}
                </Show>
              </div>
              <Show when={selectedItem()} fallback={<p class="mt-5 text-sm text-slate-400">Pick an inventory card to inspect it here.</p>}>
                {(item) => (
                  <div class="mt-5 space-y-5">
                    <div class={`rounded-3xl bg-gradient-to-br ${item().accent} p-5 text-slate-950`}>
                      <p class="text-xs uppercase tracking-[0.24em] text-slate-900/70">{item().collection}</p>
                      <h3 class="mt-3 text-3xl font-semibold">{item().name}</h3>
                      <p class="mt-2 text-base font-medium">{item().finish}</p>
                    </div>
                    <dl class="grid grid-cols-2 gap-3 text-sm text-slate-300">
                      <Metric label="Wear" value={`${item().wearLabel} · ${item().wearValue.toFixed(2)}`} />
                      <Metric label="Price band" value={item().priceBand} />
                      <Metric label="Sticker count" value={`${item().stickers}`} />
                      <Metric label="Routing" value={item().inStorage ? 'Storage managed' : 'Backpack visible'} />
                    </dl>
                    <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      <p class="font-medium text-white">Why this panel matters</p>
                      <p class="mt-2 leading-6">
                        The details panel keeps destructive context, market posture, and routing state in one place so users do not have to jump
                        between unrelated screens before confirming a plan.
                      </p>
                    </div>
                  </div>
                )}
              </Show>
            </article>

            <article id="activity" class={`${panel}`}>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Activity rail</p>
                  <h2 class="mt-2 text-2xl font-semibold text-white">Recent review signals</h2>
                </div>
                <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Live mock feed</span>
              </div>
              <div class="mt-5 space-y-3">
                <For each={dashboard()?.activity ?? []}>
                  {(event) => (
                    <article class="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <h3 class="font-medium text-white">{event.title}</h3>
                          <p class="mt-2 text-sm leading-6 text-slate-300">{event.detail}</p>
                        </div>
                        <span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${activityClasses[event.status]}`}>{event.status}</span>
                      </div>
                      <p class="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">{event.timestamp}</p>
                    </article>
                  )}
                </For>
              </div>
            </article>

            <article class={`${panel}`}>
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Connection and compliance status</p>
                <h2 class="mt-2 text-2xl font-semibold text-white">Operational posture</h2>
              </div>
              <div class="mt-5 space-y-3">
                <For each={dashboard()?.statusFlags ?? []}>
                  {(status) => (
                    <div class={`rounded-2xl border p-4 ${toneClasses[status.tone]}`}>
                      <div class="flex items-center justify-between gap-3">
                        <p class="font-medium text-white">{status.label}</p>
                        <span class="text-xs uppercase tracking-[0.22em]">{status.tone}</span>
                      </div>
                      <p class="mt-2 text-sm opacity-90">{status.value}</p>
                    </div>
                  )}
                </For>
              </div>
            </article>
          </aside>
        </section>
      </main>

      <nav class="fixed inset-x-4 bottom-4 z-30 rounded-full border border-white/10 bg-slate-950/90 p-2 shadow-2xl shadow-sky-950/30 backdrop-blur md:hidden">
        <div class="grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
          <AnchorPill href="#inventory">Inventory</AnchorPill>
          <AnchorPill href="#workbench">Workbench</AnchorPill>
          <AnchorPill href="#activity">Activity</AnchorPill>
        </div>
      </nav>
    </div>
  )
}

type MetricProps = {
  label: string
  value: string
}

const Metric = (props: MetricProps): JSX.Element => (
  <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
    <dt class="text-xs uppercase tracking-[0.22em] text-slate-500">{props.label}</dt>
    <dd class="mt-2 font-medium text-white">{props.value}</dd>
  </div>
)

type AnchorPillProps = {
  href: string
  children: JSX.Element
}

const AnchorPill = (props: AnchorPillProps): JSX.Element => (
  <a class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100" href={props.href}>
    {props.children}
  </a>
)

export default App
