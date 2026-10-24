import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveGardenCornerEffects } from '../src/features/world/gardenCornerEffects.ts'

describe('personal-corner garden effects', () => {
  it('lets a lit lantern cast a glow over the garden', () => {
    assert.deepEqual(deriveGardenCornerEffects(
      { postLanternLit: true, workshopLanternLit: false },
      { plotOneWatered: false, plotTwoWatered: false },
    ), { lanternGlow: true, gardenFireflies: false, gardenGrowth: false })
  })

  it('draws fireflies when either greenhouse plot is watered', () => {
    assert.deepEqual(deriveGardenCornerEffects(
      { postLanternLit: false, workshopLanternLit: false },
      { plotOneWatered: false, plotTwoWatered: true },
    ), { lanternGlow: false, gardenFireflies: true, gardenGrowth: true })
  })

  it('keeps both garden effects quiet when no one has changed a corner', () => {
    assert.deepEqual(deriveGardenCornerEffects(
      { postLanternLit: false, workshopLanternLit: false },
      { plotOneWatered: false, plotTwoWatered: false },
    ), { lanternGlow: false, gardenFireflies: false, gardenGrowth: false })
  })
})
