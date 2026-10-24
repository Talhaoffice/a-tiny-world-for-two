export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const element = target as HTMLElement
  const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
  const contentEditable = element.isContentEditable
    || ['true', 'plaintext-only', ''].includes(element.getAttribute?.('contenteditable')?.toLowerCase() ?? 'false')

  return ['input', 'textarea', 'select'].includes(tagName)
    || contentEditable
    || element.getAttribute?.('role')?.toLowerCase() === 'textbox'
}

export function shouldCaptureGameKeyboard(eventTarget: EventTarget | null, activeElement: EventTarget | null): boolean {
  return !isEditableTarget(eventTarget) && !isEditableTarget(activeElement)
}
