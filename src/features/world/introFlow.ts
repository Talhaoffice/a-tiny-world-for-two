export type IntroMode = 'first-entry' | 'preview' | 'read' | 'edit'

export async function continueIntroFlow(mode: IntroMode, completeFirstEntry: () => Promise<unknown>) {
  if (mode !== 'first-entry') return false
  await completeFirstEntry()
  return true
}
