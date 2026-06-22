import { describe, expect, it } from 'vitest'
import { buildStickerPlan, buildTradeUpPlan, prepareStorageMove } from './dashboard-service'
import { dashboardFixture } from './mock-data'

describe('dashboard service', () => {
  it('builds a trade-up plan for ten matching items', () => {
    const items = dashboardFixture.inventory.filter((item) =>
      dashboardFixture.recommendedTradeUpIds.includes(item.id),
    )

    const result = buildTradeUpPlan(items)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().collection).toBe('Anubis')
  })

  it('rejects storage moves into a full storage unit', () => {
    const item = dashboardFixture.inventory.at(0)
    const candidateStorage = dashboardFixture.storageUnits.at(1)

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
    const item = dashboardFixture.inventory.find((candidate) => candidate.inStorage)

    expect(item).toBeDefined()

    if (item === undefined) {
      return
    }

    const result = buildStickerPlan(item, 'Precision alignment')

    expect(result.isErr()).toBe(true)
  })
})
