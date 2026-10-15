import assert from 'node:assert/strict'
import test from 'node:test'
import { actionFor, defaultKeybinds, heldDirection, keyLabel, parseKeybinds, rebind } from '../shared/keybinds.ts'

test('default keys and arrow keys both control the hero', () => {
  assert.equal(actionFor(defaultKeybinds, 'w'), 'up')
  assert.equal(actionFor(defaultKeybinds, 'arrowup'), 'up')
  assert.equal(actionFor(defaultKeybinds, ' '), 'jump')
  assert.equal(actionFor(defaultKeybinds, 'e'), 'interact')
  assert.equal(actionFor(defaultKeybinds, 'q'), 'helper')
  assert.equal(actionFor(defaultKeybinds, 'z'), null)
  assert.equal(actionFor(defaultKeybinds, 'escape'), null)
  assert.deepEqual(heldDirection(defaultKeybinds, ['d', 'arrowup']), { dx: 1, dy: -1 })
  assert.deepEqual(heldDirection(defaultKeybinds, ['a', 'arrowright']), { dx: 0, dy: 0 })
})

test('rebinding moves an action to the new key', () => {
  const result = rebind(defaultKeybinds, 'jump', 'j')
  assert.ok(result.ok)
  assert.equal(result.swapped, null)
  assert.equal(actionFor(result.keybinds, 'j'), 'jump')
  assert.equal(actionFor(result.keybinds, ' '), null)
})

test('taking a key from another action swaps the two keys', () => {
  const result = rebind(defaultKeybinds, 'interact', 'w')
  assert.ok(result.ok)
  assert.equal(result.swapped, 'up')
  assert.equal(result.keybinds.interact, 'w')
  assert.equal(result.keybinds.up, 'e')
  assert.deepEqual(heldDirection(result.keybinds, ['e']), { dx: 0, dy: -1 })
})

test('only letters, numbers, symbols and Space can be bound', () => {
  for (const key of ['escape', 'tab', 'enter', 'shift', 'arrowup', 'f5', 'W']) assert.equal(rebind(defaultKeybinds, 'jump', key).ok, false, key)
  assert.ok(rebind(defaultKeybinds, 'jump', '1').ok)
})

test('saved keybinds fall back to the defaults when they are damaged', () => {
  const saved = { up: 'i', left: 'j', down: 'k', right: 'l', jump: ' ', interact: 'e', helper: 'h' }
  assert.deepEqual(parseKeybinds(saved), saved)
  assert.deepEqual(parseKeybinds({ ...saved, helper: undefined }), { ...saved, helper: 'q' })
  assert.deepEqual(parseKeybinds({ ...saved, helper: undefined, interact: 'q' }), defaultKeybinds)
  assert.deepEqual(parseKeybinds(null), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, interact: 'i' }), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, jump: 'escape' }), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, interact: 7 }), defaultKeybinds)
})

test('key labels match the keyboard', () => {
  assert.equal(keyLabel(' '), 'Space')
  assert.equal(keyLabel('e'), 'E')
  assert.equal(keyLabel('/'), '/')
})
