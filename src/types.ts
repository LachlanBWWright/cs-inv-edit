export type Rarity = 'Consumer Grade' | 'Industrial Grade' | 'Mil-Spec' | 'Restricted' | 'Classified' | 'Covert'

export type InventoryItem = {
  id: string
  name: string
  finish: string
  weapon: string
  collection: string
  rarity: Rarity
  wearLabel: string
  wearValue: number
  statTrak: boolean
  stickers: number
  inStorage: boolean
  storageUnitId?: string
  priceBand: string
  readiness: 'Ready' | 'Review' | 'Blocked'
  accent: string
}

export type StorageUnit = {
  id: string
  name: string
  zone: string
  capacity: number
  occupied: number
  theme: string
}

export type ActivityEvent = {
  id: string
  title: string
  detail: string
  status: 'Completed' | 'Queued' | 'Review'
  timestamp: string
}

export type StatusFlag = {
  label: string
  value: string
  tone: 'Stable' | 'Watch' | 'Risk'
}

export type ComplianceNote = {
  title: string
  detail: string
}

export type DashboardData = {
  sessionStartedAt: string
  platformFocus: string
  inventory: InventoryItem[]
  storageUnits: StorageUnit[]
  activity: ActivityEvent[]
  statusFlags: StatusFlag[]
  complianceNotes: ComplianceNote[]
  highlightedCollections: string[]
  recommendedTradeUpIds: string[]
}

export type DashboardError = {
  code: 'DATA_UNAVAILABLE' | 'INVALID_SELECTION' | 'STORAGE_FULL'
  message: string
}

export type StickerPlan = {
  preset: string
  confidence: string
  notes: string[]
}

export type TradeUpPlan = {
  averageWear: string
  predictedTier: string
  collection: string
  outputTheme: string
}

export type StorageMovePlan = {
  summary: string
  targetFreeSlots: number
}
