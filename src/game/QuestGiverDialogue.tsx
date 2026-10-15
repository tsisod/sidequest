import { useState } from 'react'
import type { Quest } from '../../shared/domain'
import type { Speak } from '../../shared/speech'
import type { DialogueAudio } from './dialogue/DialogueAudio'
import { DialogueBox } from './dialogue/DialogueBox'
import type { Choice } from './dialogue/DialogueBox'
import type { QuestGiver } from './villagers'

type Scene = { kind: 'talk'; questIndex: number } | { kind: 'thanks' }
type QuestGiverDialogueProps = {
  giver: QuestGiver
  audio: DialogueAudio
  childName: string
  quests: readonly Quest[]
  busy: boolean
  speak: Speak
  onSubmit: (questId: string) => Promise<boolean>
  onClose: () => void
}

export default function QuestGiverDialogue({ giver, audio, childName, quests, busy, speak, onSubmit, onClose }: QuestGiverDialogueProps) {
  const [scene, setScene] = useState<Scene>({ kind: 'talk', questIndex: 0 })
  const remaining = quests.filter(quest => quest.status === 'todo').length
  const talk = giver.talk(quests, childName, scene.kind === 'talk' ? scene.questIndex : 0)
  const text = (scene.kind === 'thanks' ? giver.thanks(remaining, childName) : talk.lines).join('\n\n')
  const choices: Choice[] = scene.kind === 'talk' && talk.quest ? [
    { label: 'I did it!', act: () => { const quest = talk.quest; if (quest) void onSubmit(quest.id).then(ok => { if (ok) setScene({ kind: 'thanks' }) }) } },
    ...remaining > 1 ? [{ label: `Show me another ${giver.noun}`, act: () => setScene({ kind: 'talk', questIndex: scene.questIndex + 1 }) }] : [],
    { label: "I'm on it!", act: onClose },
  ] : scene.kind === 'thanks' && remaining > 0 ? [
    { label: `Next ${giver.noun}`, act: () => setScene({ kind: 'talk', questIndex: 0 }) },
    { label: 'Later', act: onClose },
  ] : [{ label: 'Goodbye', act: onClose }]

  return <DialogueBox character={giver} audio={audio} speak={speak} scene={scene.kind === 'talk' ? `talk:${scene.questIndex}` : 'thanks'} text={text} badge={remaining > 0 ? `${remaining} ${remaining === 1 ? giver.noun : `${giver.noun}s`} left` : undefined} choices={choices} busy={busy} onClose={onClose} />
}
