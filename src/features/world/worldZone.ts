export type WorldZone = 'island' | 'home'

// Older position records have no zone; treat them as island presence.
export function positionMatchesZone(localZone: WorldZone, remoteZone: unknown) {
  const normalizedZone: WorldZone = remoteZone === 'home' ? 'home' : 'island'
  return localZone === normalizedZone
}
