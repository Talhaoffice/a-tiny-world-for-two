export const WORLD_EMOTE_TYPES = [
  'wave', 'heart', 'sparkle', 'hug', 'sit-bench', 'sit-blanket',
  'pond-lantern-on', 'pond-lantern-off', 'mood-off', 'mood-gold', 'mood-rose', 'mood-sage',
] as const
export type WorldEmoteType = typeof WORLD_EMOTE_TYPES[number]

export const WORLD_EMOTE_COOLDOWN_MS = 2500
export const WORLD_EMOTE_FRESH_MS = 7000

export function isWorldEmoteType(value: unknown): value is WorldEmoteType {
  return typeof value === 'string' && WORLD_EMOTE_TYPES.includes(value as WorldEmoteType)
}

export function canSendWorldEmote(lastSentAt: number, now: number, cooldownMs = WORLD_EMOTE_COOLDOWN_MS) {
  return Number.isFinite(now) && now - lastSentAt >= cooldownMs
}

export function isFreshWorldEmote(sentAt: number, serverNow: number, maxAgeMs = WORLD_EMOTE_FRESH_MS) {
  if (!Number.isFinite(sentAt) || !Number.isFinite(serverNow)) return false
  const age = serverNow - sentAt
  return age >= 0 && age <= maxAgeMs
}
