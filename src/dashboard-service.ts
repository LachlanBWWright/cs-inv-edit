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
  await wait(120)

  return [
    null,
    {
      code: 'DATA_UNAVAILABLE',
      message: 'No backend inventory snapshot is available from this dashboard shell.',
    },
  ]
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
