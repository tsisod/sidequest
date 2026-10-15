import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parentViewForPathname, roleForPathname, routes } from '../src/routes.ts'

test('the root opens the child game and only the parents route opens the dashboard', () => {
  assert.equal(routes.game, '/')
  assert.equal(routes.parents, '/parents')
  assert.equal(roleForPathname('/'), 'child')
  assert.equal(roleForPathname('/parents'), 'parent')
  assert.equal(roleForPathname('/parents/'), 'parent')
  assert.equal(roleForPathname('/parents-other'), 'child')
})

test('the inbox is a parent page inside the dashboard', () => {
  assert.equal(routes.inbox, '/parents/inbox')
  assert.equal(roleForPathname('/parents/inbox'), 'parent')
  assert.equal(roleForPathname('/parents/inbox/'), 'parent')
  assert.equal(roleForPathname('/parents/inbox-other'), 'child')
  assert.equal(parentViewForPathname('/parents/inbox'), 'inbox')
  assert.equal(parentViewForPathname('/parents'), 'dashboard')
})
