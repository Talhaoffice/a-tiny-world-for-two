export function normalizeDreamText(text: string) {
  const normalized = text.trim()
  if (!normalized || normalized.length > 300) throw new Error('Keep each dream between 1 and 300 characters.')
  return normalized
}
