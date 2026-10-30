import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCombatApiBaseUrl } from '../src/features/world/combatApiTarget.ts'

test('combat API base URL may be omitted for local emulator Functions development', () => {
  assert.equal(resolveCombatApiBaseUrl(true, undefined), null)
  assert.equal(resolveCombatApiBaseUrl(true, '  http://127.0.0.1:8787///  '), 'http://127.0.0.1:8787')
})

test('production combat API URL requires HTTPS and rejects localhost', () => {
  assert.equal(resolveCombatApiBaseUrl(false, 'https://combat-api.onrender.com/'), 'https://combat-api.onrender.com')
  assert.throws(() => resolveCombatApiBaseUrl(false, 'http://combat-api.onrender.com'), /HTTPS/)
  assert.throws(() => resolveCombatApiBaseUrl(false, 'https://localhost:8787'), /localhost/)
})

test('combat API URL rejects credentials and query strings', () => {
  assert.throws(() => resolveCombatApiBaseUrl(true, 'https://user:pass@api.example'), /credentials/)
  assert.throws(() => resolveCombatApiBaseUrl(true, 'https://api.example?token=hidden'), /credentials/)
})
