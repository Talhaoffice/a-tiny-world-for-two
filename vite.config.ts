import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertBuildTarget } from './src/lib/firebaseTarget.ts'

function stampServiceWorkerBuild(): import('vite').Plugin {
  const buildVersion = `${Date.now().toString(36)}-${randomUUID()}`
  let outputDirectory = ''
  return {
    name: 'stamp-service-worker-build',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const workerPath = resolve(outputDirectory, 'sw.js')
      const source = await readFile(workerPath, 'utf8')
      if (!source.includes('__BUILD_VERSION__')) {
        throw new Error('Service worker build version placeholder is missing.')
      }
      await writeFile(workerPath, source.replaceAll('__BUILD_VERSION__', buildVersion), 'utf8')
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd())
  assertBuildTarget(command, env.VITE_FIREBASE_TARGET)
  return { plugins: [react(), stampServiceWorkerBuild()] }
})
