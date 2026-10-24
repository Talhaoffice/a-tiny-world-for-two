export function canLoadLetterBody(isRecipient: boolean, releaseAtMillis: number | null, serverNow: number | null) {
  return !isRecipient || (releaseAtMillis !== null && serverNow !== null && releaseAtMillis <= serverNow)
}

export async function loadLetterBodyWhenAvailable<T>(
  isRecipient: boolean,
  releaseAtMillis: number | null,
  serverNow: number | null,
  load: () => Promise<T>,
): Promise<{ ready: true; body: T } | { ready: false }> {
  if (!canLoadLetterBody(isRecipient, releaseAtMillis, serverNow)) return { ready: false }
  return { ready: true, body: await load() }
}
