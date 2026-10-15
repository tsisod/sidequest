import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SPEECH_CHARACTERS } from '../shared/speech.ts'
import { dialoguePages } from '../src/game/dialogue/dialoguePages.ts'
import { anglerChats, dogChats, gardenerChats } from '../src/game/smallTalk.ts'

const chatters = { dog: dogChats('Alex'), angler: anglerChats('Alex'), gardener: gardenerChats('Alex') }

test('each casual villager has several short chats that greet the child first', () => {
  for (const [name, chats] of Object.entries(chatters)) {
    assert.ok(chats.length >= 4, `${name} has enough to say`)
    assert.match(chats[0][0], /Alex/, `${name} greets the child by name`)
    assert.equal(new Set(chats.map(chat => chat.join(' '))).size, chats.length, `${name} never repeats a chat`)
    for (const line of chats.flat()) {
      assert.ok(line.length <= MAX_SPEECH_CHARACTERS, `${name}: "${line}" can be voiced`)
      assert.equal(dialoguePages(line).length, 1, `${name}: "${line}" fits on one page`)
    }
  }
})

test('the dog speaks dog first', () => {
  for (const chat of chatters.dog) assert.match(chat[0], /woof|arf/i)
})
