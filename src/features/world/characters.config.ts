export type CharacterId = 'talha' | 'mannu'
export type CharacterDirection = 'down' | 'left' | 'right' | 'up'
export type CharacterPose = 'idle' | 'walk' | 'wave' | 'sit'

export type CharacterAppearance = {
  hair: 'short' | 'long'
  outfit: 'jacket' | 'cardigan' | 'dress'
  accessory: 'none' | 'lantern-clip' | 'sage-accent'
}

export type CharacterConfig = {
  id: CharacterId
  name: string
  defaultAppearance: CharacterAppearance
  spawn: { x: number; y: number }
  palette: {
    skin: number
    hair: number
    jacket: number
    cardigan: number
    dress: number
    trousers: number
    boots: number
    shoes: number
    gold: number
    sage: number
    outline: number
  }
  footwear: 'boots' | 'light-shoes'
}

export function isCharacterAppearance(value: unknown): value is CharacterAppearance {
  if (!value || typeof value !== 'object') return false
  const appearance = value as Record<string, unknown>
  return Object.keys(appearance).length === 3
    && (appearance.hair === 'short' || appearance.hair === 'long')
    && (appearance.outfit === 'jacket' || appearance.outfit === 'cardigan' || appearance.outfit === 'dress')
    && (appearance.accessory === 'none' || appearance.accessory === 'lantern-clip' || appearance.accessory === 'sage-accent')
}

export function resolveCharacterIds(uid: string, memberUids: string[], talhaUid: string, mannuUid: string) {
  if (memberUids.length !== 2 || talhaUid === mannuUid
    || !memberUids.includes(talhaUid) || !memberUids.includes(mannuUid) || !memberUids.includes(uid)) return null
  return uid === talhaUid
    ? { localId: 'talha' as const, remoteId: 'mannu' as const, remoteUid: mannuUid }
    : uid === mannuUid
      ? { localId: 'mannu' as const, remoteId: 'talha' as const, remoteUid: talhaUid }
      : null
}

export const characters: Record<CharacterId, CharacterConfig> = {
  talha: {
    id: 'talha',
    name: 'Talha',
    defaultAppearance: { hair: 'short', outfit: 'jacket', accessory: 'none' },
    spawn: { x: 752, y: 528 },
    palette: {
      skin: 0xe7b994,
      hair: 0x493d3b,
      jacket: 0x263b58,
      cardigan: 0x9b6157,
      dress: 0x8a6c72,
      trousers: 0x435464,
      boots: 0x3a3436,
      shoes: 0xd7c7aa,
      gold: 0xe9bd68,
      sage: 0x789078,
      outline: 0x192d39,
    },
    footwear: 'boots',
  },
  mannu: {
    id: 'mannu',
    name: 'Mannu',
    defaultAppearance: { hair: 'long', outfit: 'cardigan', accessory: 'lantern-clip' },
    spawn: { x: 816, y: 528 },
    palette: {
      skin: 0xf0c49a,
      hair: 0x5e443e,
      jacket: 0x354862,
      cardigan: 0xc98575,
      dress: 0xb9776a,
      trousers: 0x665f64,
      boots: 0x55413d,
      shoes: 0xe8dcc5,
      gold: 0xe9bd68,
      sage: 0x789078,
      outline: 0x263747,
    },
    footwear: 'light-shoes',
  },
}
