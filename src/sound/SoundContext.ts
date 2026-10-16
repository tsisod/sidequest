import { createContext, useContext } from 'react'
import type { PlaySound } from './GameSounds'

const silent: PlaySound = () => () => {}

export const SoundContext = createContext<PlaySound>(silent)
export const useSound = () => useContext(SoundContext)
