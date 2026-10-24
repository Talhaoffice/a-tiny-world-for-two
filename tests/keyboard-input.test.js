import assert from 'node:assert/strict'
import test from 'node:test'
import { isEditableTarget, shouldCaptureGameKeyboard } from '../src/features/world/keyboardInput.ts'

function target(tagName, attributes = {}, isContentEditable = false) {
  return {
    tagName,
    isContentEditable,
    getAttribute(name) {
      return attributes[name] ?? null
    },
  }
}

test('recognizes editable form controls and contenteditable targets', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(isEditableTarget(target(tagName)), true)
  }
  assert.equal(isEditableTarget(target('DIV', { contenteditable: 'true' })), true)
  assert.equal(isEditableTarget(target('SPAN', {}, true)), true)
  assert.equal(isEditableTarget(target('DIV', { role: 'textbox' })), true)
})

test('does not treat ordinary elements or contenteditable=false as editable', () => {
  assert.equal(isEditableTarget(target('DIV')), false)
  assert.equal(isEditableTarget(target('DIV', { contenteditable: 'false' })), false)
  assert.equal(isEditableTarget(null), false)
})

test('game keyboard capture is disabled for editable event targets or focused elements', () => {
  const input = target('TEXTAREA')
  const body = target('BODY')
  assert.equal(shouldCaptureGameKeyboard(body, body), true)
  assert.equal(shouldCaptureGameKeyboard(input, body), false)
  assert.equal(shouldCaptureGameKeyboard(body, input), false)
})
