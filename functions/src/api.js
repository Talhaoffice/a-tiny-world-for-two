import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import { readCombatApiConfig } from './apiConfig.js'
import { createCombatApi } from './combatApi.js'

const config = readCombatApiConfig()
const app = initializeApp({
  ...(config.serviceAccount ? { credential: cert(config.serviceAccount) } : {}),
  projectId: config.projectId,
  databaseURL: config.databaseURL,
})
const server = createCombatApi({
  verifyIdToken: token => getAuth(app).verifyIdToken(token, true),
  database: getDatabase(app),
  allowedOrigins: config.allowedOrigins,
})

server.listen(config.port, '0.0.0.0', () => {
  process.stdout.write(`Combat API listening on port ${config.port}\n`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
