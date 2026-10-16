export type Tone = {
  at: number
  length: number
  wave: Exclude<OscillatorType, 'custom'> | 'noise'
  from: number
  to?: number
  volume?: number
}

const note = { G3: 196, B3: 247, C4: 262, E4: 330, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093, E7: 2637.02 }
const blip = (at: number, from: number, length = .07, wave: Tone['wave'] = 'square', volume = .35): Tone => ({ at, length, wave, from, volume })

export const soundEffects = {
  tap: [{ at: 0, length: .045, wave: 'triangle', from: note.A5, to: note.E5, volume: .5 }],
  open: [blip(0, note.C5, .06), blip(.05, note.G5, .09)],
  close: [blip(0, note.G5, .06), blip(.05, note.C5, .09)],
  talk: [blip(0, note.A4, .05, 'square', .3), blip(.05, note.D5, .08, 'square', .3)],
  advance: [blip(0, note.A5, .04, 'square', .22)],
  page: [{ at: 0, length: .2, wave: 'noise', from: 1400, to: 5200, volume: .45 }, blip(.02, note.E6, .04, 'triangle', .2)],
  confirm: [blip(0, note.E5, .08), blip(.07, note.G5, .08), blip(.14, note.C6, .18)],
  remove: [{ at: 0, length: .14, wave: 'square', from: note.G4, to: note.G3, volume: .3 }, { at: 0, length: .12, wave: 'noise', from: 900, to: 300, volume: .35 }],
  error: [blip(0, note.E4 * .67, .1, 'square', .3), blip(.11, note.E4 * .53, .16, 'square', .3)],
  coin: [blip(0, note.B5, .06, 'square', .26), blip(.06, note.E6, .26, 'square', .26)],
  sparkle: [blip(0, note.G6, .07, 'triangle', .4), blip(.06, note.C7, .07, 'triangle', .4), blip(.12, note.E7, .07, 'triangle', .4), blip(.18, note.G6 * 2, .22, 'triangle', .35)],
  fanfare: [blip(0, note.C5, .1), blip(.1, note.E5, .1), blip(.2, note.G5, .1), blip(.3, note.C6, .38), { at: 0, length: .68, wave: 'triangle', from: note.C4 / 2, volume: .45 }],
  loss: [blip(0, note.G4, .15, 'square', .3), blip(.15, note.E4, .15, 'square', .3), { at: .3, length: .35, wave: 'square', from: note.C4, to: note.C4 * .9, volume: .3 }],
  jump: [{ at: 0, length: .16, wave: 'square', from: 260, to: 620, volume: .22 }],
  spark: [blip(0, note.E6, .08, 'triangle', .4), blip(.07, note.A6, .08, 'triangle', .4), blip(.14, note.E7, .2, 'triangle', .35)],
  reminder: [blip(0, note.C6, .3, 'triangle', .45), blip(.18, note.E6, .45, 'triangle', .45), blip(.18, note.E6 * 2, .3, 'sine', .1)],
  send: [{ at: 0, length: .07, wave: 'square', from: note.E5, to: note.B5, volume: .25 }],
  reply: [blip(0, note.G6, .06, 'triangle', .35), blip(.06, note.C7, .14, 'triangle', .35)],
  hit: [{ at: 0, length: .06, wave: 'noise', from: 1600, to: 500, volume: .6 }, { at: 0, length: .13, wave: 'square', from: note.E4, to: 110, volume: .35 }],
  flip: [{ at: 0, length: .07, wave: 'noise', from: 3200, to: 1600, volume: .35 }, blip(0, note.E5, .05, 'triangle', .2)],
  match: [blip(0, note.G5, .09), blip(.08, note.D6, .2)],
  splash: [{ at: 0, length: .26, wave: 'noise', from: 1800, to: 380, volume: .5 }, { at: 0, length: .14, wave: 'sine', from: 520, to: 170, volume: .35 }],
  mismatch: [blip(0, note.B3, .12, 'square', .28), blip(.12, note.G3 * 1.06, .2, 'square', .28)],
} satisfies Record<string, readonly Tone[]>

export type SoundEffect = keyof typeof soundEffects
