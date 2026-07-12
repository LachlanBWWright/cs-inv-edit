import { err, ok, Result } from 'neverthrow'
import type {
  DashboardData,
  DashboardError,
  InventoryItem,
  StickerPlan,
  StorageMovePlan,
  StorageUnit,
  TradeUpPlan,
} from './types'

const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const createInvalidSelectionError = (message: string): DashboardError => ({
  code: 'INVALID_SELECTION',
  message,
})

export type ResultTuple<T, E> = readonly [T, null] | readonly [null, E]

export const loadDashboardData = async (): Promise<ResultTuple<DashboardData, DashboardError>> => {
  await wait(180)

  const inventory: InventoryItem[] = [
    {
      id: 'itm-001',
      name: 'M4A1-S',
      finish: 'Nitro Signal',
      weapon: 'Rifle',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Minimal Wear',
      wearValue: 0.09,
      statTrak: false,
      stickers: 3,
      inStorage: false,
      priceBand: '$24-$36',
      readiness: 'Ready',
      accent: 'from-sky-300 via-cyan-200 to-emerald-200',
    },
    {
      id: 'itm-002',
      name: 'USP-S',
      finish: 'Temple Drift',
      weapon: 'Pistol',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Factory New',
      wearValue: 0.02,
      statTrak: false,
      stickers: 4,
      inStorage: false,
      priceBand: '$18-$24',
      readiness: 'Ready',
      accent: 'from-violet-300 via-fuchsia-200 to-rose-200',
    },
    {
      id: 'itm-003',
      name: 'P250',
      finish: 'Scarab Coil',
      weapon: 'Pistol',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Field-Tested',
      wearValue: 0.17,
      statTrak: true,
      stickers: 2,
      inStorage: false,
      priceBand: '$31-$42',
      readiness: 'Review',
      accent: 'from-amber-300 via-orange-200 to-rose-200',
    },
    {
      id: 'itm-004',
      name: 'MAC-10',
      finish: 'Dune Rhythm',
      weapon: 'SMG',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Minimal Wear',
      wearValue: 0.08,
      statTrak: false,
      stickers: 1,
      inStorage: false,
      priceBand: '$8-$12',
      readiness: 'Ready',
      accent: 'from-emerald-300 via-teal-200 to-cyan-200',
    },
    {
      id: 'itm-005',
      name: 'AUG',
      finish: 'Sun Vault',
      weapon: 'Rifle',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Field-Tested',
      wearValue: 0.15,
      statTrak: false,
      stickers: 2,
      inStorage: false,
      priceBand: '$11-$16',
      readiness: 'Ready',
      accent: 'from-amber-200 via-yellow-100 to-orange-200',
    },
    {
      id: 'itm-006',
      name: 'P250',
      finish: 'Civic Sand',
      weapon: 'Pistol',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Minimal Wear',
      wearValue: 0.07,
      statTrak: false,
      stickers: 0,
      inStorage: false,
      priceBand: '$4-$7',
      readiness: 'Ready',
      accent: 'from-stone-300 via-slate-200 to-zinc-200',
    },
    {
      id: 'itm-007',
      name: 'Galil AR',
      finish: 'Pharaoh Circuit',
      weapon: 'Rifle',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Factory New',
      wearValue: 0.03,
      statTrak: false,
      stickers: 2,
      inStorage: false,
      priceBand: '$9-$13',
      readiness: 'Ready',
      accent: 'from-rose-300 via-orange-200 to-amber-200',
    },
    {
      id: 'itm-008',
      name: 'MP9',
      finish: 'Glyph Sprint',
      weapon: 'SMG',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Factory New',
      wearValue: 0.01,
      statTrak: false,
      stickers: 1,
      inStorage: false,
      priceBand: '$6-$10',
      readiness: 'Ready',
      accent: 'from-cyan-300 via-sky-200 to-blue-200',
    },
    {
      id: 'itm-009',
      name: 'Five-SeveN',
      finish: 'Copper Delta',
      weapon: 'Pistol',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Minimal Wear',
      wearValue: 0.05,
      statTrak: false,
      stickers: 2,
      inStorage: false,
      priceBand: '$7-$11',
      readiness: 'Ready',
      accent: 'from-lime-300 via-emerald-200 to-green-200',
    },
    {
      id: 'itm-010',
      name: 'FAMAS',
      finish: 'Canal Mesh',
      weapon: 'Rifle',
      collection: 'Anubis',
      rarity: 'Mil-Spec',
      wearLabel: 'Field-Tested',
      wearValue: 0.19,
      statTrak: false,
      stickers: 1,
      inStorage: false,
      priceBand: '$10-$15',
      readiness: 'Review',
      accent: 'from-indigo-300 via-slate-200 to-violet-200',
    },
    {
      id: 'itm-011',
      name: 'AWP',
      finish: 'Parcel Shade',
      weapon: 'Sniper',
      collection: 'Mirage 2025',
      rarity: 'Classified',
      wearLabel: 'Factory New',
      wearValue: 0.01,
      statTrak: false,
      stickers: 4,
      inStorage: true,
      storageUnitId: 'sto-002',
      priceBand: '$104-$128',
      readiness: 'Blocked',
      accent: 'from-slate-300 via-slate-200 to-slate-100',
    },
  ]

  const data: DashboardData = {
    sessionStartedAt: '2026-06-22T13:39:58Z',
    platformFocus: 'CS2 inventory edit · live review shell for sticker, trade-up, and storage workflows',
    inventory,
    storageUnits: [
      { id: 'sto-001', name: 'Operations Queue', zone: 'Trade-up staging', capacity: 80, occupied: 62, theme: 'Fast-moving route for aspirational baskets.' },
      { id: 'sto-002', name: 'Premium Showcase', zone: 'High-value preservation', capacity: 50, occupied: 48, theme: 'Tight capacity calls for deliberate routing.' },
    ],
    activity: [
      { id: 'activity-1', title: 'Sticker presets loaded', detail: 'Three review modes are ready for manual checking.', status: 'Completed', timestamp: '2m ago' },
      { id: 'activity-2', title: 'Trade-up basket staged', detail: '10-item overview is prepared for a single collection review.', status: 'Queued', timestamp: '8m ago' },
      { id: 'activity-3', title: 'Storage watch enabled', detail: 'Premium items are flagged for capacity pressure before any move.', status: 'Review', timestamp: '12m ago' },
    ],
    statusFlags: [
      { label: 'Inventory sync', value: 'Preview shell is connected to a mock snapshot.', tone: 'Stable' },
      { label: 'Storage pressure', value: 'Premium showcase is 96% occupied.', tone: 'Watch' },
      { label: 'Policy gate', value: 'Write actions remain human-approved.', tone: 'Risk' },
    ],
    complianceNotes: [
      { title: 'Manual approval preserved', detail: 'Every action remains reviewable before any write path is touched.' },
      { title: 'Collection consistency', detail: 'Trade-up baskets stay isolated to a single collection and rarity for clear review.' },
      { title: 'Storage queue discipline', detail: 'Capacity pressure is surfaced before any move is reserved.' },
    ],
    highlightedCollections: ['Anubis', 'Mirage 2025'],
    recommendedTradeUpIds: inventory.slice(0, 10).map((item) => item.id),
  }

  return [data, null]
}

export const buildStickerPlan = (item: InventoryItem, preset: string): Result<StickerPlan, DashboardError> => {
  if (item.inStorage) {
    return err(createInvalidSelectionError('Move the item out of storage before applying a sticker refinement plan.'))
  }

  return ok({
    preset,
    confidence: item.stickers >= 3 ? 'High confidence alignment' : 'Moderate confidence alignment',
    notes: [
      `${item.name} ${item.finish} keeps a clean focal point at ${item.wearLabel}.`,
      'Offset adjustments stay conservative to preserve a premium inspection silhouette.',
      'Manual approval remains visible because live CS2 write paths are policy-sensitive.',
    ],
  })
}

export const buildTradeUpPlan = (items: InventoryItem[]): Result<TradeUpPlan, DashboardError> => {
  if (items.length !== 10) {
    return err(createInvalidSelectionError('Select exactly 10 items to review a trade-up basket.'))
  }

  const collection = items[0]?.collection
  const rarity = items[0]?.rarity
  const hasMixedCollection = items.some((item) => item.collection !== collection)
  const hasMixedRarity = items.some((item) => item.rarity !== rarity)

  if (collection === undefined || rarity === undefined || hasMixedCollection || hasMixedRarity) {
    return err(createInvalidSelectionError('Trade-up baskets must stay on one collection and one rarity for a clean review surface.'))
  }

  const averageWear = items.reduce((sum, item) => sum + item.wearValue, 0) / items.length

  return ok({
    averageWear: averageWear.toFixed(3),
    predictedTier: rarity === 'Mil-Spec' ? 'Restricted target pool' : 'Tier review required',
    collection,
    outputTheme: averageWear <= 0.07 ? 'Factory-leaning output odds' : 'Balanced float with moderate wear spread',
  })
}

export const prepareStorageMove = (
  item: InventoryItem,
  storageUnit: StorageUnit,
): Result<StorageMovePlan, DashboardError> => {
  if (storageUnit.occupied >= storageUnit.capacity) {
    return err({
      code: 'STORAGE_FULL',
      message: `${storageUnit.name} is full. Choose a roomier storage unit before reserving the move.`,
    })
  }

  if (item.storageUnitId === storageUnit.id) {
    return err(createInvalidSelectionError('This item is already assigned to the selected storage unit.'))
  }

  return ok({
    summary: `${item.name} ${item.finish} can move into ${storageUnit.name} for ${storageUnit.zone.toLowerCase()}.`,
    targetFreeSlots: storageUnit.capacity - storageUnit.occupied - 1,
  })
}
