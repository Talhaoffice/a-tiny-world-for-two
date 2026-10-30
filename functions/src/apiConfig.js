const EXPECTED_PROJECT_ID = 'a-tiny-world-for-two'
const PRODUCTION_ORIGIN = 'https://a-tiny-world-for-two.web.app'
const DEFAULT_ALLOWED_ORIGINS = [
  PRODUCTION_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function validDatabaseUrl(value, projectId) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return false
    const projectPrefix = projectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${projectPrefix}-default-rtdb\\.firebaseio\\.com$`).test(parsed.hostname)
      || new RegExp(`^${projectPrefix}-default-rtdb\\.[a-z0-9-]+\\.firebasedatabase\\.app$`).test(parsed.hostname)
  } catch {
    return false
  }
}

function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) return new Set(DEFAULT_ALLOWED_ORIGINS)
  const origins = value.split(',').map(origin => origin.trim()).filter(Boolean)
  if (!origins.includes(PRODUCTION_ORIGIN)) throw new Error('COMBAT_ALLOWED_ORIGINS must include the production website origin.')
  for (const origin of origins) {
    let parsed
    try { parsed = new URL(origin) } catch { throw new Error('COMBAT_ALLOWED_ORIGINS contains an invalid origin.') }
    if (parsed.origin !== origin || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('COMBAT_ALLOWED_ORIGINS entries must be bare origins.')
    }
    if (parsed.protocol !== 'https:' && !['http://localhost', 'http://127.0.0.1'].some(local => origin.startsWith(`${local}:`))) {
      throw new Error('Non-local combat API origins must use HTTPS.')
    }
  }
  return new Set(origins)
}

export function readCombatApiConfig(env = process.env) {
  if (env.FIREBASE_PROJECT_ID !== EXPECTED_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID must match the configured Firebase project.')
  let serviceAccount
  const emulatorMode = env.COMBAT_API_EMULATOR_MODE === 'true'
  if (env.COMBAT_API_EMULATOR_MODE !== undefined && env.COMBAT_API_EMULATOR_MODE !== 'true' && env.COMBAT_API_EMULATOR_MODE !== 'false') {
    throw new Error('COMBAT_API_EMULATOR_MODE must be true or false when set.')
  }
  if (emulatorMode) {
    const localEndpoint = value => {
      if (typeof value !== 'string') return false
      const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(value)
      return Boolean(match && Number(match[1]) > 0 && Number(match[1]) <= 65535)
    }
    if (!localEndpoint(env.FIREBASE_AUTH_EMULATOR_HOST) || !localEndpoint(env.FIREBASE_DATABASE_EMULATOR_HOST)) {
      throw new Error('Emulator mode requires loopback Auth and Realtime Database emulator endpoints.')
    }
  } else {
    if (typeof env.FIREBASE_SERVICE_ACCOUNT_JSON !== 'string' || !env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.')
    }
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.')
    }
    if (!serviceAccount || serviceAccount.project_id !== EXPECTED_PROJECT_ID
      || typeof serviceAccount.client_email !== 'string' || !serviceAccount.client_email
      || typeof serviceAccount.private_key !== 'string' || !serviceAccount.private_key.includes('PRIVATE KEY')) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON does not contain a matching service account.')
    }
  }
  if (!validDatabaseUrl(env.FIREBASE_DATABASE_URL, EXPECTED_PROJECT_ID)) {
    throw new Error('FIREBASE_DATABASE_URL must be the HTTPS Realtime Database instance for the configured project.')
  }
  const port = env.PORT === undefined ? 8787 : Number(env.PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')

  return {
    projectId: EXPECTED_PROJECT_ID,
    databaseURL: env.FIREBASE_DATABASE_URL,
    serviceAccount,
    emulatorMode,
    port,
    allowedOrigins: parseAllowedOrigins(env.COMBAT_ALLOWED_ORIGINS),
  }
}

export const combatApiDefaults = Object.freeze({
  expectedProjectId: EXPECTED_PROJECT_ID,
  productionOrigin: PRODUCTION_ORIGIN,
  allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
})
