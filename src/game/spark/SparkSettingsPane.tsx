import { useEffect, useRef, useState } from 'react'
import { defaultSpark, MAX_SPARK_NAME, parseSparkName, sparkVoices } from '../../../shared/spark'
import type { SparkSettings, SparkVoice } from '../../../shared/spark'
import type { Speak } from '../../../shared/speech'
import Icon from '../GameIcon'
import './spark.css'

type SparkSettingsPaneProps = { spark: SparkSettings; childName: string; speak: Speak; onSpark: (spark: SparkSettings) => void }

export default function SparkSettingsPane({ spark, childName, speak, onSpark }: SparkSettingsPaneProps) {
  const [draft, setDraft] = useState(spark.name)
  const [previewing, setPreviewing] = useState<SparkVoice | null>(null)
  const [notice, setNotice] = useState('')
  const player = useRef<HTMLAudioElement | null>(null)
  const nameValid = parseSparkName(draft) !== null
  useEffect(() => () => { player.current?.pause() }, [])

  function rename(value: string) {
    setDraft(value)
    const name = parseSparkName(value)
    if (name) onSpark({ ...spark, name })
  }
  async function preview(voice: SparkVoice) {
    player.current?.pause()
    setPreviewing(voice)
    setNotice('')
    const result = await speak(`Hi ${childName}! I'm ${spark.name}. I'm here to help.`, voice)
    setPreviewing(current => current === voice ? null : current)
    if (!result.ok) { setNotice(result.message); return }
    const url = URL.createObjectURL(new Blob([result.audio], { type: 'audio/mpeg' }))
    const audio = new Audio(url)
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
    player.current = audio
    void audio.play().catch(() => setNotice('Tap Preview again to hear the voice.'))
  }

  return <div className="game-menu-pane spark-settings">
    <div className="spark-settings-hero"><span aria-hidden="true" className="spark-settings-portrait" /><p className="game-menu-note">{spark.name} is your AI helper. It knows the whole game and can send finished quests to your parent, but it cannot approve quests or change anything on the parent dashboard. If something worrying or unsuitable comes up in a chat, {spark.name} lets your parent know.</p></div>
    <label className="spark-name-field"><span>Name</span><input value={draft} maxLength={MAX_SPARK_NAME} autoComplete="off" spellCheck={false} aria-invalid={!nameValid} aria-describedby="spark-name-help" onChange={event => rename(event.target.value)} onBlur={() => { if (!nameValid) setDraft(spark.name) }} /></label>
    <p id="spark-name-help" className={nameValid ? 'spark-name-help' : 'spark-name-help spark-name-invalid'}>{nameValid ? `Up to ${MAX_SPARK_NAME} letters, numbers or spaces.` : 'Start with a letter or number. Use up to 16 letters, numbers or spaces.'}</p>
    <fieldset className="spark-voices"><legend>Voice</legend>{sparkVoices.map(option => <div className="spark-voice-row" key={option.voice}>
      <label><input type="radio" name="spark-voice" value={option.voice} checked={spark.voice === option.voice} onChange={() => onSpark({ ...spark, voice: option.voice })} /><span><strong>{option.label}</strong><small>{option.note}</small></span></label>
      <button type="button" className="spark-preview" disabled={previewing !== null} aria-label={`Preview ${option.label}`} onClick={() => void preview(option.voice)}><Icon name="play" size={14} />{previewing === option.voice ? 'Loading…' : 'Preview'}</button>
    </div>)}</fieldset>
    <p className="game-menu-status" role="status">{notice}</p>
    <button type="button" className="game-menu-button" disabled={spark.name === defaultSpark.name && spark.voice === defaultSpark.voice} onClick={() => { setDraft(defaultSpark.name); onSpark(defaultSpark) }}><Icon name="restore" size={16} />Reset to {defaultSpark.name}</button>
    <p className="game-menu-note">The name and voice are saved on this device.</p>
  </div>
}
