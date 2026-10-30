export const LOCAL_FIREBASE_PROJECT_ID = 'a-tiny-world-for-two'
export const FIREBASE_FUNCTIONS_REGION = 'us-central1'

export type FirebaseTarget = 'emulator' | 'hosted'

export function resolveFirebaseTarget(isDevelopment: boolean, requestedTarget?: string): FirebaseTarget {
  const target = requestedTarget?.trim().toLowerCase()
  if (!target) return isDevelopment ? 'emulator' : 'hosted'
  if (target !== 'emulator' && target !== 'hosted') {
    throw new Error('VITE_FIREBASE_TARGET must be either "emulator" or "hosted".')
  }
  if (target === 'emulator' && !isDevelopment) {
    throw new Error('Firebase emulator mode is only available in Vite development mode.')
  }
  return target
}

export function assertBuildTarget(command: string, requestedTarget?: string): void {
  if (command === 'build' && requestedTarget?.trim().toLowerCase() === 'emulator') {
    throw new Error('Production builds cannot use Firebase emulator mode. Remove VITE_FIREBASE_TARGET=emulator before building.')
  }
}

export function assertEmulatorProject(target: FirebaseTarget, projectId: string | undefined): void {
  if (target === 'emulator' && projectId !== LOCAL_FIREBASE_PROJECT_ID) {
    throw new Error(`Local Firebase emulator mode requires project ${LOCAL_FIREBASE_PROJECT_ID}.`)
  }
}

export function requireEmulatorServices<T extends Record<string, unknown>>(
  services: T,
): asserts services is { [K in keyof T]: NonNullable<T[K]> } {
  if (Object.values(services).some(service => !service)) {
    throw new Error('Firebase emulator mode could not initialize every required service; no hosted fallback was attempted.')
  }
}

export function firebaseAppName(target: FirebaseTarget): string {
  return target === 'emulator' ? 'tiny-world-local-emulators' : '[DEFAULT]'
}
