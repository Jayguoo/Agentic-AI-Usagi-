import { useCallback, useEffect, useRef, useState } from 'react'

const PHASE_FREQUENCIES = {
  listen: 262,
  sniff: 330,
  dash: 392,
  bonk: 196,
  deliver: 523,
}

export function useAgentAudio(phase) {
  const [muted, setMuted] = useState(true)
  const contextRef = useRef(null)
  const masterRef = useRef(null)
  const ambientRef = useRef([])

  const ensureContext = useCallback(() => {
    if (!contextRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      const context = new AudioContext()
      const master = context.createGain()
      master.gain.value = 0.14
      master.connect(context.destination)
      contextRef.current = context
      masterRef.current = master
    }
    return contextRef.current
  }, [])

  const tone = useCallback((frequency, duration = 0.18, volume = 0.16) => {
    const context = ensureContext()
    if (!context || muted) return
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain)
    gain.connect(masterRef.current)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.03)
  }, [ensureContext, muted])

  const startAmbient = useCallback(() => {
    const context = ensureContext()
    if (!context || ambientRef.current.length) return
    const now = context.currentTime
    ambientRef.current = [43, 64.5].map((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = index ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.value = index ? 0.018 : 0.012
      oscillator.connect(gain)
      gain.connect(masterRef.current)
      oscillator.start(now)
      return oscillator
    })
  }, [ensureContext])

  const toggleMuted = useCallback(async () => {
    const nextMuted = !muted
    const context = ensureContext()
    if (context?.state === 'suspended') await context.resume()
    if (!nextMuted) startAmbient()
    setMuted(nextMuted)
    if (!nextMuted && context) {
      window.setTimeout(() => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.value = 330
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16)
        oscillator.connect(gain)
        gain.connect(masterRef.current)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.18)
      }, 0)
    }
  }, [ensureContext, muted, startAmbient])

  useEffect(() => {
    if (!muted) tone(PHASE_FREQUENCIES[phase] ?? 262, phase === 'deliver' ? 0.46 : 0.2)
  }, [muted, phase, tone])

  useEffect(() => () => {
    ambientRef.current.forEach((oscillator) => oscillator.stop())
    contextRef.current?.close()
  }, [])

  return {
    muted,
    toggleMuted,
    playSelect: () => tone(659, 0.1, 0.08),
    playLaunch: () => tone(294, 0.34, 0.2),
  }
}
