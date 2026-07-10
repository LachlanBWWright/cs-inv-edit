import { describe, expect, it } from 'vitest'
import { buildStickerPlan, buildTradeUpPlan, prepareStorageMove } from './dashboard-service'
import type { DashboardData } from './types'

const dashboardTestData: DashboardData = {
  sessionStartedAt: '2026-06-22T13:39:58Z',
  platformFocus: 'test fixture',
  highlightedCollections: ['Anubis'],
  recommendedTradeUpIds: ['itm-001', 'itm-002', 'itm-003', 'itm-004', 'itm-005', 'itm-006', 'itm-007', 'itm-008', 'itm-009', 'itm-010'],
  inventory: [
    { id: 'itm-001', name: 'M4A1-S', finish: 'Nitro Signal', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.09, statTrak: false, stickers: 3, inStorage: false, priceBand: '$24-$36', readiness: 'Ready', accent: '' },
    { id: 'itm-002', name: 'USP-S', finish: 'Temple Drift', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.02, statTrak: false, stickers: 4, inStorage: false, priceBand: '$18-$24', readiness: 'Ready', accent: '' },
    { id: 'itm-003', name: 'P250', finish: 'Scarab Coil', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.17, statTrak: true, stickers: 2, inStorage: false, priceBand: '$31-$42', readiness: 'Review', accent: '' },
    { id: 'itm-004', name: 'MAC-10', finish: 'Dune Rhythm', weapon: 'SMG', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.08, statTrak: false, stickers: 1, inStorage: false, priceBand: '$8-$12', readiness: 'Ready', accent: '' },
    { id: 'itm-005', name: 'AUG', finish: 'Sun Vault', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.15, statTrak: false, stickers: 2, inStorage: false, priceBand: '$11-$16', readiness: 'Ready', accent: '' },
    { id: 'itm-006', name: 'P250', finish: 'Civic Sand', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.07, statTrak: false, stickers: 0, inStorage: false, priceBand: '$4-$7', readiness: 'Ready', accent: '' },
    { id: 'itm-007', name: 'Galil AR', finish: 'Pharaoh Circuit', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.03, statTrak: false, stickers: 2, inStorage: false, priceBand: '$9-$13', readiness: 'Ready', accent: '' },
    { id: 'itm-008', name: 'MP9', finish: 'Glyph Sprint', weapon: 'SMG', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.01, statTrak: false, stickers: 1, inStorage: false, priceBand: '$6-$10', readiness: 'Ready', accent: '' },
    { id: 'itm-009', name: 'Five-SeveN', finish: 'Copper Delta', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.05, statTrak: false, stickers: 2, inStorage: false, priceBand: '$7-$11', readiness: 'Ready', accent: '' },
    { id: 'itm-010', name: 'FAMAS', finish: 'Canal Mesh', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.19, statTrak: false, stickers: 1, inStorage: false, priceBand: '$10-$15', readiness: 'Review', accent: '' },
    { id: 'itm-011', name: 'AWP', finish: 'Parcel Shade', weapon: 'Sniper', collection: 'Mirage 2025', rarity: 'Classified', wearLabel: 'Factory New', wearValue: 0.01, statTrak: false, stickers: 4, inStorage: true, storageUnitId: 'sto-002', priceBand: '$104-$128', readiness: 'Blocked', accent: '' },
  ],
  storageUnits: [
    { id: 'sto-001', name: 'Operations Queue', zone: 'Trade-up staging', capacity: 80, occupied: 62, theme: 'Ready for churn' },
    { id: 'sto-002', name: 'Premium Showcase', zone: 'High-value preservation', capacity: 50, occupied: 48, theme: 'Tight capacity' },
  ],
  activity: [],
  statusFlags: [],
  complianceNotes: [],
}

describe('dashboard service', () => {
  it('builds a trade-up plan for ten matching items', () => {
    const items = dashboardTestData.inventory.filter((item) =>
      dashboardTestData.recommendedTradeUpIds.includes(item.id),
    )

    const result = buildTradeUpPlan(items)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().collection).toBe('Anubis')
  })

  it('rejects storage moves into a full storage unit', () => {
    const item = dashboardTestData.inventory.at(0)
    const candidateStorage = dashboardTestData.storageUnits.at(1)

    expect(item).toBeDefined()
    expect(candidateStorage).toBeDefined()

    if (item === undefined || candidateStorage === undefined) {
      return
    }

    const storage = { ...candidateStorage, occupied: candidateStorage.capacity }

    const result = prepareStorageMove(item, storage)

    expect(result.isErr()).toBe(true)
  })

  it('rejects sticker plans for items still in storage', () => {
    const item = dashboardTestData.inventory.find((candidate) => candidate.inStorage)

    expect(item).toBeDefined()

    if (item === undefined) {
      return
    }

    const result = buildStickerPlan(item, 'Precision alignment')

    expect(result.isErr()).toBe(true)
  })
})
