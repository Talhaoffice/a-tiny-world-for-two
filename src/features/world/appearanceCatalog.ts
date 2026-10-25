/**
 * Appearance catalog — single source of truth for all character customisation
 * options. Every slot is indexed by integer (0-based), matching the Firestore
 * playerLooks schema and the rules allowlist.
 *
 * Available to both players; no gender-locked features.
 */

// ─── Skin tones (6) ───────────────────────────────────────────────────────────
export const SKIN_TONES = [
  { label: 'Porcelain',   color: 0xf5e6d3, shadow: 0xdec9b2 },
  { label: 'Warm ivory',  color: 0xf0c49a, shadow: 0xd9a87e },
  { label: 'Golden',      color: 0xe7b994, shadow: 0xcf9a78 },
  { label: 'Honey',       color: 0xc8855a, shadow: 0xad6840 },
  { label: 'Tawny',       color: 0xa0582a, shadow: 0x844318 },
  { label: 'Deep umber',  color: 0x6b3a1f, shadow: 0x512c12 },
] as const
export type SkinToneIndex = 0 | 1 | 2 | 3 | 4 | 5
export const SKIN_TONE_MAX = SKIN_TONES.length - 1 // 5

// ─── Hair styles (10) ─────────────────────────────────────────────────────────
export const HAIR_STYLES = [
  { label: 'Short crop',    id: 'short-crop'    },
  { label: 'Short swept',   id: 'short-swept'   },
  { label: 'Messy short',   id: 'messy-short'   },
  { label: 'Medium',        id: 'medium'        },
  { label: 'Long straight', id: 'long-straight' },
  { label: 'Long wavy',     id: 'long-wavy'     },
  { label: 'Ponytail',      id: 'ponytail'      },
  { label: 'High bun',      id: 'bun'           },
  { label: 'Curly',         id: 'curly'         },
  { label: 'Messy long',    id: 'messy-long'    },
] as const
export type HairStyleIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export const HAIR_STYLE_MAX = HAIR_STYLES.length - 1 // 9

// ─── Hair colors (12: 10 ramp tones + 2 natural dark tones) ───────────────────
export const HAIR_COLORS = [
  { label: 'Midnight',    color: 0x1a1210 },
  { label: 'Dark brown',  color: 0x493d3b },
  { label: 'Warm brown',  color: 0x7a4f35 },
  { label: 'Chestnut',    color: 0x8b4513 },
  { label: 'Auburn',      color: 0xa0522d },
  { label: 'Copper',      color: 0xb87333 },
  { label: 'Honey blond', color: 0xd4a853 },
  { label: 'Ash blond',   color: 0xc8b89a },
  { label: 'Silver',      color: 0xa8a8a8 },
  { label: 'Warm white',  color: 0xf0ece4 },
  { label: 'Natural dark (Talha default)', color: 0x493d3b },
  { label: 'Natural dark (Mannu default)', color: 0x5e443e },
] as const
export type HairColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export const HAIR_COLOR_MAX = HAIR_COLORS.length - 1 // 11

// ─── Eye colors (5) ───────────────────────────────────────────────────────────
export const EYE_COLORS = [
  { label: 'Dark brown', color: 0x3d2b1f },
  { label: 'Warm brown', color: 0x7a4f35 },
  { label: 'Hazel',      color: 0x6b7a3a },
  { label: 'Green',      color: 0x4e7c5f },
  { label: 'Blue-grey',  color: 0x5a7080 },
] as const
export type EyeColorIndex = 0 | 1 | 2 | 3 | 4
export const EYE_COLOR_MAX = EYE_COLORS.length - 1 // 4

// ─── Tops (6) ─────────────────────────────────────────────────────────────────
export const TOPS = [
  { label: 'Jacket',   id: 'jacket'   },
  { label: 'Cardigan', id: 'cardigan' },
  { label: 'Hoodie',   id: 'hoodie'   },
  { label: 'Sweater',  id: 'sweater'  },
  { label: 'Shirt',    id: 'shirt'    },
  { label: 'Kurta',    id: 'kurta'    },
] as const
export type TopIndex = 0 | 1 | 2 | 3 | 4 | 5
export const TOP_MAX = TOPS.length - 1 // 5

// ─── Bottoms (4) ──────────────────────────────────────────────────────────────
export const BOTTOMS = [
  { label: 'Trousers', id: 'trousers' },
  { label: 'Skirt',    id: 'skirt'    },
  { label: 'Dress',    id: 'dress'    },
  { label: 'Shorts',   id: 'shorts'   },
] as const
export type BottomIndex = 0 | 1 | 2 | 3
export const BOTTOM_MAX = BOTTOMS.length - 1 // 3

// ─── Shoes (3) ────────────────────────────────────────────────────────────────
export const SHOES = [
  { label: 'Boots',    id: 'boots'    },
  { label: 'Sneakers', id: 'sneakers' },
  { label: 'Flats',    id: 'flats'    },
] as const
export type ShoesIndex = 0 | 1 | 2
export const SHOES_MAX = SHOES.length - 1 // 2

// ─── Hats (4) ─────────────────────────────────────────────────────────────────
export const HATS = [
  { label: 'None',         id: 'none'         },
  { label: 'Cap',          id: 'cap'          },
  { label: 'Beanie',       id: 'beanie'       },
  { label: 'Flower crown', id: 'flower-crown' },
] as const
export type HatIndex = 0 | 1 | 2 | 3
export const HAT_MAX = HATS.length - 1 // 3

// ─── Accessories (5) ──────────────────────────────────────────────────────────
export const ACCESSORIES = [
  { label: 'None',        id: 'none'        },
  { label: 'Glasses',     id: 'glasses'     },
  { label: 'Scarf',       id: 'scarf'       },
  { label: 'Hair clip',   id: 'hair-clip'   },
  { label: 'Lantern pin', id: 'lantern-pin' },
] as const
export type AccessoryIndex = 0 | 1 | 2 | 3 | 4
export const ACCESSORY_MAX = ACCESSORIES.length - 1 // 4

// ─── Clothing tint palette (10 per slot) ─────────────────────────────────────
export const CLOTH_TINTS = [
  { label: 'Midnight blue', color: 0x263b58 },
  { label: 'Terracotta',    color: 0xc98575 },
  { label: 'Forest green',  color: 0x3d6b47 },
  { label: 'Dusty rose',    color: 0xc08080 },
  { label: 'Slate grey',    color: 0x6a7a8a },
  { label: 'Wheat',         color: 0xd4b896 },
  { label: 'Plum',          color: 0x7a4a6a },
  { label: 'Sage',          color: 0x789078 },
  { label: 'Cream',         color: 0xf0ece4 },
  { label: 'Coal',          color: 0x2c2c2c },
] as const
export type ClothTintIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export const CLOTH_TINT_MAX = CLOTH_TINTS.length - 1 // 9

// ─── PlayerLook schema ────────────────────────────────────────────────────────
/** The full look stored in playerLooks/{uid}. All fields are ints in range. */
export type PlayerLook = {
  skin: SkinToneIndex
  hairStyle: HairStyleIndex
  hairColor: HairColorIndex
  eyes: EyeColorIndex
  top: TopIndex
  topColor: ClothTintIndex
  bottom: BottomIndex
  bottomColor: ClothTintIndex
  shoes: ShoesIndex
  shoesColor: ClothTintIndex
  hat: HatIndex
  accessory: AccessoryIndex
  updatedAt?: unknown // serverTimestamp on write
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
/** [Talha: write this] — defaults per character (both options still available) */
export const TALHA_DEFAULT_LOOK: Omit<PlayerLook, 'updatedAt'> = {
  skin: 2,
  hairStyle: 2, // messy short
  hairColor: 10, // natural dark (Talha)
  eyes: 1,
  top: 0, // jacket
  topColor: 0, // midnight blue
  bottom: 0, // trousers
  bottomColor: 4, // slate grey
  shoes: 0, // boots
  shoesColor: 9, // coal
  hat: 0, // none
  accessory: 0, // none
}

export const MANNU_DEFAULT_LOOK: Omit<PlayerLook, 'updatedAt'> = {
  skin: 1,
  hairStyle: 4, // long straight
  hairColor: 11, // natural dark (Mannu)
  eyes: 0,
  top: 1, // cardigan
  topColor: 1, // terracotta
  bottom: 2, // dress
  bottomColor: 1, // terracotta
  shoes: 2, // flats
  shoesColor: 8, // cream
  hat: 0, // none
  accessory: 3, // hair clip
}

// ─── Look key generator (for texture caching) ─────────────────────────────────
export function getLookKey(look: Omit<PlayerLook, 'updatedAt'>): string {
  return `${look.skin}_${look.hairStyle}_${look.hairColor}_${look.eyes}_${look.top}_${look.topColor}_${look.bottom}_${look.bottomColor}_${look.shoes}_${look.shoesColor}_${look.hat}_${look.accessory}`
}

// ─── Validation ───────────────────────────────────────────────────────────────
function inRange(value: unknown, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

export function isPlayerLook(value: unknown): value is PlayerLook {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    inRange(v.skin, SKIN_TONE_MAX) &&
    inRange(v.hairStyle, HAIR_STYLE_MAX) &&
    inRange(v.hairColor, HAIR_COLOR_MAX) &&
    inRange(v.eyes, EYE_COLOR_MAX) &&
    inRange(v.top, TOP_MAX) &&
    inRange(v.topColor, CLOTH_TINT_MAX) &&
    inRange(v.bottom, BOTTOM_MAX) &&
    inRange(v.bottomColor, CLOTH_TINT_MAX) &&
    inRange(v.shoes, SHOES_MAX) &&
    inRange(v.shoesColor, CLOTH_TINT_MAX) &&
    inRange(v.hat, HAT_MAX) &&
    inRange(v.accessory, ACCESSORY_MAX)
  )
}

// ─── Migration from old CharacterAppearance ───────────────────────────────────
/** Convert the old 3-field appearance to a PlayerLook, merging with defaults. */
export function migrateOldAppearance(
  oldAppearance: { hair?: unknown; outfit?: unknown; accessory?: unknown },
  defaults: Omit<PlayerLook, 'updatedAt'>,
): Omit<PlayerLook, 'updatedAt'> {
  let hairStyle = defaults.hairStyle
  if (oldAppearance.hair === 'short') hairStyle = 2 // messy short
  else if (oldAppearance.hair === 'long') hairStyle = 4 // long straight

  let top = defaults.top
  let topColor = defaults.topColor
  let bottom = defaults.bottom
  let bottomColor = defaults.bottomColor

  if (oldAppearance.outfit === 'jacket') {
    top = 0
    topColor = 0
    bottom = 0
    bottomColor = 4
  } else if (oldAppearance.outfit === 'cardigan') {
    top = 1
    topColor = 1
    bottom = 0
    bottomColor = 0
  } else if (oldAppearance.outfit === 'dress') {
    top = 1
    topColor = 1
    bottom = 2
    bottomColor = 1
  }

  let hat = defaults.hat
  let accessory = defaults.accessory
  if (oldAppearance.accessory === 'none') {
    hat = 0
    accessory = 0
  } else if (oldAppearance.accessory === 'lantern-clip') {
    hat = 0
    accessory = 4 // lantern pin
  } else if (oldAppearance.accessory === 'sage-accent') {
    hat = 0
    accessory = 2 // scarf
  }

  return { ...defaults, hairStyle, top, topColor, bottom, bottomColor, hat, accessory }
}

// ─── Randomize ────────────────────────────────────────────────────────────────
function randInt(max: number): number {
  return Math.floor(Math.random() * (max + 1))
}

export function randomLook(): Omit<PlayerLook, 'updatedAt'> {
  return {
    skin: randInt(SKIN_TONE_MAX) as SkinToneIndex,
    hairStyle: randInt(HAIR_STYLE_MAX) as HairStyleIndex,
    hairColor: randInt(HAIR_COLOR_MAX) as HairColorIndex,
    eyes: randInt(EYE_COLOR_MAX) as EyeColorIndex,
    top: randInt(TOP_MAX) as TopIndex,
    topColor: randInt(CLOTH_TINT_MAX) as ClothTintIndex,
    bottom: randInt(BOTTOM_MAX) as BottomIndex,
    bottomColor: randInt(CLOTH_TINT_MAX) as ClothTintIndex,
    shoes: randInt(SHOES_MAX) as ShoesIndex,
    shoesColor: randInt(CLOTH_TINT_MAX) as ClothTintIndex,
    hat: randInt(HAT_MAX) as HatIndex,
    accessory: randInt(ACCESSORY_MAX) as AccessoryIndex,
  }
}
