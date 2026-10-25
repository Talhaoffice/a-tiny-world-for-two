import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESSORIES,
  ACCESSORY_MAX,
  BOTTOMS,
  BOTTOM_MAX,
  CLOTH_TINTS,
  CLOTH_TINT_MAX,
  EYE_COLORS,
  EYE_COLOR_MAX,
  HAIR_COLORS,
  HAIR_COLOR_MAX,
  HAIR_STYLES,
  HAIR_STYLE_MAX,
  HATS,
  HAT_MAX,
  SHOES,
  SHOES_MAX,
  SKIN_TONES,
  SKIN_TONE_MAX,
  TOPS,
  TOP_MAX,
  TALHA_DEFAULT_LOOK,
  MANNU_DEFAULT_LOOK,
  isPlayerLook,
  migrateOldAppearance,
  randomLook,
  getLookKey,
} from '../src/features/world/appearanceCatalog.ts'

describe('Appearance catalog & PlayerLook', () => {
  it('Talha and Mannu default looks are valid', () => {
    assert.equal(isPlayerLook(TALHA_DEFAULT_LOOK), true)
    assert.equal(isPlayerLook(MANNU_DEFAULT_LOOK), true)
  })

  it('catalog lengths match declared MAX constants', () => {
    assert.equal(SKIN_TONES.length - 1, SKIN_TONE_MAX)
    assert.equal(HAIR_STYLES.length - 1, HAIR_STYLE_MAX)
    assert.equal(HAIR_COLORS.length - 1, HAIR_COLOR_MAX)
    assert.equal(EYE_COLORS.length - 1, EYE_COLOR_MAX)
    assert.equal(TOPS.length - 1, TOP_MAX)
    assert.equal(BOTTOMS.length - 1, BOTTOM_MAX)
    assert.equal(SHOES.length - 1, SHOES_MAX)
    assert.equal(HATS.length - 1, HAT_MAX)
    assert.equal(ACCESSORIES.length - 1, ACCESSORY_MAX)
    assert.equal(CLOTH_TINTS.length - 1, CLOTH_TINT_MAX)
  })

  it('catalog sizes do not exceed firestore.rules bounds', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

    // Extract the max bounds defined in validPlayerLook in firestore.rules
    const extractBound = field => {
      const regex = new RegExp(`data\\.${field}\\s+<=\\s+(\\d+)`)
      const match = rules.match(regex)
      assert.ok(match, `Could not find rule bound for ${field} in firestore.rules`)
      return parseInt(match[1], 10)
    }

    assert.ok(SKIN_TONE_MAX <= extractBound('skin'), 'skin exceeds rule range')
    assert.ok(HAIR_STYLE_MAX <= extractBound('hairStyle'), 'hairStyle exceeds rule range')
    assert.ok(HAIR_COLOR_MAX <= extractBound('hairColor'), 'hairColor exceeds rule range')
    assert.ok(EYE_COLOR_MAX <= extractBound('eyes'), 'eyes exceeds rule range')
    assert.ok(TOP_MAX <= extractBound('top'), 'top exceeds rule range')
    assert.ok(BOTTOM_MAX <= extractBound('bottom'), 'bottom exceeds rule range')
    assert.ok(SHOES_MAX <= extractBound('shoes'), 'shoes exceeds rule range')
    assert.ok(HAT_MAX <= extractBound('hat'), 'hat exceeds rule range')
    assert.ok(ACCESSORY_MAX <= extractBound('accessory'), 'accessory exceeds rule range')
    assert.ok(CLOTH_TINT_MAX <= extractBound('topColor'), 'topColor exceeds rule range')
    assert.ok(CLOTH_TINT_MAX <= extractBound('bottomColor'), 'bottomColor exceeds rule range')
    assert.ok(CLOTH_TINT_MAX <= extractBound('shoesColor'), 'shoesColor exceeds rule range')
  })

  it('rejects out of range and malformed look objects', () => {
    assert.equal(isPlayerLook(null), false)
    assert.equal(isPlayerLook('invalid'), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, skin: 99 }), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, skin: -1 }), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, skin: 1.5 }), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, hairStyle: 50 }), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, hat: 10 }), false)
    assert.equal(isPlayerLook({ ...TALHA_DEFAULT_LOOK, accessory: 20 }), false)
  })

  it('migrates legacy 3-field appearance correctly', () => {
    const migratedTalha = migrateOldAppearance(
      { hair: 'short', outfit: 'jacket', accessory: 'none' },
      TALHA_DEFAULT_LOOK,
    )
    assert.equal(migratedTalha.hairStyle, 2)
    assert.equal(migratedTalha.top, 0)
    assert.equal(migratedTalha.accessory, 0)

    const migratedMannu = migrateOldAppearance(
      { hair: 'long', outfit: 'cardigan', accessory: 'lantern-clip' },
      MANNU_DEFAULT_LOOK,
    )
    assert.equal(migratedMannu.hairStyle, 4)
    assert.equal(migratedMannu.top, 1)
    assert.equal(migratedMannu.accessory, 4) // lantern pin
  })

  it('randomLook produces a valid look within bounds', () => {
    for (let i = 0; i < 20; i += 1) {
      const look = randomLook()
      assert.equal(isPlayerLook(look), true)
    }
  })

  it('getLookKey produces deterministic strings', () => {
    const key1 = getLookKey(TALHA_DEFAULT_LOOK)
    const key2 = getLookKey(TALHA_DEFAULT_LOOK)
    assert.equal(key1, key2)
    assert.notEqual(key1, getLookKey(MANNU_DEFAULT_LOOK))
  })
})
