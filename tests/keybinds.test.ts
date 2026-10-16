import assert from 'node:assert/strict'
import test from 'node:test'
import { actionFor, defaultKeybinds, heldDirection, keyLabel, parseKeybinds, rebind } from '../shared/keybinds.ts'

test('default keys and arrow keys both control the hero', () => {
  assert.equal(actionFor(defaultKeybinds, 'w'), 'up')
  assert.equal(actionFor(defaultKeybinds, 'arrowup'), 'up')
  assert.equal(actionFor(defaultKeybinds, ' '), 'jump')
  assert.equal(actionFor(defaultKeybinds, 'e'), 'interact')
  assert.equal(actionFor(defaultKeybinds, 'q'), 'helper')
  assert.equal(actionFor(defaultKeybinds, 'shift'), 'sprint')
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

test('only letters, numbers, symbols, Space and Shift can be bound', () => {
  for (const key of ['escape', 'tab', 'enter', 'control', 'arrowup', 'f5', 'W']) assert.equal(rebind(defaultKeybinds, 'jump', key).ok, false, key)
  assert.ok(rebind(defaultKeybinds, 'jump', '1').ok)
})

test('sprint defaults to Shift and can move to another key, or give Shift away', () => {
  const toF = rebind(defaultKeybinds, 'sprint', 'f')
  assert.ok(toF.ok)
  assert.equal(toF.keybinds.sprint, 'f')
  assert.equal(actionFor(toF.keybinds, 'shift'), null)
  const shiftJump = rebind(defaultKeybinds, 'jump', 'shift')
  assert.ok(shiftJump.ok)
  assert.equal(shiftJump.swapped, 'sprint')
  assert.equal(shiftJump.keybinds.sprint, ' ')
  assert.equal(actionFor(shiftJump.keybinds, 'shift'), 'jump')
})

test('saved keybinds fall back to the defaults only when they are damaged', () => {
  const saved = { up: 'i', left: 'j', down: 'k', right: 'l', sprint: 'shift', jump: ' ', interact: 'e', helper: 'q', hints: 'h' }
  assert.deepEqual(parseKeybinds(saved), saved)
  const { sprint: _, ...beforeSprint } = saved
  assert.deepEqual(parseKeybinds(beforeSprint), saved, 'keybinds saved before sprint existed gain Shift')
  assert.deepEqual(parseKeybinds(null), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, interact: 'i' }), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, jump: 'escape' }), defaultKeybinds)
  assert.deepEqual(parseKeybinds({ ...saved, interact: 7 }), defaultKeybinds)
})

test('keybinds saved before the hints key existed keep every key and gain H, or a spare key if H is taken', () => {
  const { hints: _, ...beforeHints } = defaultKeybinds
  assert.deepEqual(parseKeybinds(beforeHints), defaultKeybinds)
  const helperOnH = { up: 'i', left: 'j', down: 'k', right: 'l', sprint: 'shift', jump: ' ', interact: 'e', helper: 'h' }
  const migrated = parseKeybinds(helperOnH)
  assert.deepEqual(migrated, { ...helperOnH, hints: 'g' })
  assert.equal(actionFor(migrated, 'h'), 'helper')
  assert.equal(actionFor(migrated, 'g'), 'hints')
  const missingHelper = parseKeybinds({ ...helperOnH, helper: undefined, interact: 'q' })
  assert.equal(new Set(Object.values(missingHelper)).size, Object.keys(missingHelper).length)
  assert.deepEqual(missingHelper, { ...helperOnH, interact: 'q', helper: 'h', hints: 'g' })
})

test('H toggles the key hints by default and can be rebound like any action', () => {
  assert.equal(actionFor(defaultKeybinds, 'h'), 'hints')
  const moved = rebind(defaultKeybinds, 'hints', 'k')
  assert.ok(moved.ok)
  assert.equal(actionFor(moved.keybinds, 'k'), 'hints')
  assert.equal(actionFor(moved.keybinds, 'h'), null)
})

test('key labels match the keyboard', () => {
  assert.equal(keyLabel(' '), 'Space')
  assert.equal(keyLabel('e'), 'E')
  assert.equal(keyLabel('shift'), 'Shift')
  assert.equal(keyLabel('/'), '/')
})
