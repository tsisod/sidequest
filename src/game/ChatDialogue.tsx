import { useState } from 'react'
import type { Speak } from '../../shared/speech'
import type { DialogueAudio } from './dialogue/DialogueAudio'
import { DialogueBox } from './dialogue/DialogueBox'
import type { Chatter } from './villagers'

type ChatDialogueProps = {
  chatter: Chatter
  audio: DialogueAudio
  childName: string
  start: number
  speak: Speak
  onClose: (next: number) => void
}

export default function ChatDialogue({ chatter, audio, childName, start, speak, onClose }: ChatDialogueProps) {
  const [turn, setTurn] = useState(start)
  const chats = chatter.chats(childName)
  const close = () => onClose(turn + 1)
  return <DialogueBox character={chatter} audio={audio} speak={speak} scene={String(turn)} text={chats[turn % chats.length].join('\n\n')} choices={[
    { label: chatter.more, act: () => setTurn(turn + 1) },
    { label: 'Goodbye', act: close },
  ]} busy={false} onClose={close} />
}
