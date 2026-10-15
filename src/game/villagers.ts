import type { Place, Quest } from '../../shared/domain'
import type { Voice } from '../../shared/speech'
import { housekeeperDialog, housekeeperThanks } from './housekeeperDialog'
import { librarianDialog, librarianThanks } from './librarianDialog'
import { smithDialog, smithThanks } from './smithDialog'
import { anglerChats, dogChats, gardenerChats } from './smallTalk'
import type { NpcKind } from './world'

export type QuestTalk = { lines: string[]; quest: Quest | null }
export type Character = { name: string; portrait: string; voice: Voice }
export type QuestGiver = Character & {
  role: 'quests'
  place: Place
  noun: string
  talk: (quests: readonly Quest[], childName: string, questIndex: number) => QuestTalk
  thanks: (remaining: number, childName: string) => string[]
}
export type Chatter = Character & { role: 'chat'; more: string; chats: (childName: string) => string[][] }
export type Villager = QuestGiver | Chatter

export const villagers: Record<NpcKind, Villager> = {
  housekeeper: { role: 'quests', name: 'Poppy the housekeeper', portrait: 'housekeeper-portrait', voice: 'housekeeper', place: 'cottage', noun: 'chore', talk: housekeeperDialog, thanks: housekeeperThanks },
  librarian: { role: 'quests', name: 'Ambrose the librarian', portrait: 'librarian-portrait', voice: 'librarian', place: 'library', noun: 'task', talk: librarianDialog, thanks: librarianThanks },
  smith: { role: 'quests', name: 'Bram the blacksmith', portrait: 'smith-portrait', voice: 'smith', place: 'chores', noun: 'exercise', talk: smithDialog, thanks: smithThanks },
  dog: { role: 'chat', name: 'Biscuit the dog', portrait: 'dog-portrait', voice: 'dog', more: 'Pat Biscuit', chats: dogChats },
  angler: { role: 'chat', name: 'Gill the angler', portrait: 'angler-portrait', voice: 'angler', more: 'Any bites?', chats: anglerChats },
  gardener: { role: 'chat', name: 'Hazel the gardener', portrait: 'gardener-portrait', voice: 'gardener', more: 'Tell me more', chats: gardenerChats },
}
