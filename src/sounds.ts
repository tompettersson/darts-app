// src/sounds.ts
// Web Audio API sound effects for darts game events

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

/** Triumphant ascending tones: C5-E5-G5-C6 */
export function play180Sound() {
  try {
    const ctx = getAudioCtx()
    const time = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    const noteDuration = 0.1
    const gap = 0.02

    notes.forEach((freq, i) => {
      const start = time + i * (noteDuration + gap)

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.linearRampToValueAtTime(0.25, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteDuration + 0.01)
    })
  } catch { /* ignore */ }
}

/** Short victory fanfare: 2-3 ascending tones */
export function playHighCheckoutSound() {
  try {
    const ctx = getAudioCtx()
    const time = ctx.currentTime
    const notes = [659.25, 783.99, 1046.5] // E5, G5, C6

    notes.forEach((freq, i) => {
      const start = time + i * 0.12

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.12)
    })
  } catch { /* ignore */ }
}

/** Longer celebration with a chord */
export function playMatchWinSound() {
  try {
    const ctx = getAudioCtx()
    const time = ctx.currentTime

    // Rising arpeggio
    const arpNotes = [523.25, 659.25, 783.99] // C5, E5, G5
    arpNotes.forEach((freq, i) => {
      const start = time + i * 0.1

      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, start)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.12)
    })

    // Final chord: C5 + E5 + G5 + C6
    const chordStart = time + 0.35
    const chordFreqs = [523.25, 659.25, 783.99, 1046.5]
    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, chordStart)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.001, chordStart)
      gain.gain.linearRampToValueAtTime(0.15, chordStart + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.5)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(chordStart)
      osc.stop(chordStart + 0.55)
    })
  } catch { /* ignore */ }
}

/** Short descending buzz for bust */
export function playBustSound() {
  try {
    const ctx = getAudioCtx()
    const time = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, time)
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.15)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + 0.18)
  } catch { /* ignore */ }
}
