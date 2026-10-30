export function resolveCombatApiBaseUrl(isDevelopment: boolean, configuredValue: string | undefined): string | null {
  const value = configuredValue?.trim()
  if (!value) return null
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('VITE_COMBAT_API_URL must be a valid URL.') }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_COMBAT_API_URL must not contain credentials or query parameters.')
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (!isDevelopment && (parsed.protocol !== 'https:' || local)) {
    throw new Error('Production combat API URLs must use HTTPS and cannot point to localhost.')
  }
  if (parsed.protocol !== 'https:' && !(isDevelopment && local && parsed.protocol === 'http:')) {
    throw new Error('Combat API URLs must use HTTPS except for local development.')
  }
  return value.replace(/\/+$/, '')
}
