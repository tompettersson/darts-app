// src/speech.ts
// Sprachausgabe-Modul für Darts — Web Speech API

import { speechTexts, type SpeechLang } from './speechTranslations'

let enabled = true

// ===== Stimmen-Konfiguration =====
export type { SpeechLang }
/** @deprecated Verwende SpeechLang */
export type VoiceLang = SpeechLang

const VOICE_LANG_KEY = 'darts-voice-lang'
const VOICE_NAME_KEY = 'darts-voice-name'

let voiceLang: SpeechLang = (localStorage.getItem(VOICE_LANG_KEY) as SpeechLang) || 'de'
let preferredVoiceName: string | null = localStorage.getItem(VOICE_NAME_KEY)

/** Aktuellen Translation-Katalog zurückgeben */
function t() { return speechTexts[voiceLang] }

export function getVoiceLang(): SpeechLang {
  return voiceLang
}

export function setVoiceLang(lang: SpeechLang) {
  voiceLang = lang
  localStorage.setItem(VOICE_LANG_KEY, lang)
  // Gespeicherte Stimme zurücksetzen bei Sprachwechsel
  preferredVoiceName = null
  localStorage.removeItem(VOICE_NAME_KEY)
  // Voice neu laden
  webSpeechInitialized = false
  webSpeechVoice = null
  initWebSpeechFallback()
}

/** Bevorzugte Stimme setzen (Name aus getAvailableVoices) */
export function setPreferredVoice(voiceName: string | null) {
  preferredVoiceName = voiceName
  if (voiceName) {
    localStorage.setItem(VOICE_NAME_KEY, voiceName)
  } else {
    localStorage.removeItem(VOICE_NAME_KEY)
  }
  // Voice neu laden mit neuer Präferenz
  webSpeechInitialized = false
  webSpeechVoice = null
  initWebSpeechFallback()
}

export function getPreferredVoice(): string | null {
  return preferredVoiceName
}

/** Verfügbare Stimmen für die aktuelle Sprache zurückgeben */
export function getAvailableVoices(): { name: string; lang: string; isDefault: boolean }[] {
  if (typeof speechSynthesis === 'undefined') return []
  const voices = speechSynthesis.getVoices()
  const langPrefix = LANG_LOCALE[voiceLang].slice(0, 2)
  return voices
    .filter(v => v.lang.startsWith(langPrefix))
    .map(v => ({
      name: v.name,
      lang: v.lang,
      isDefault: v.name === findBestVoice(voices)?.name,
    }))
}

// Fallback: Web Speech API
let webSpeechVoice: SpeechSynthesisVoice | null = null
let webSpeechInitialized = false

// Sprach-Locale Mapping für Web Speech API
const LANG_LOCALE: Record<SpeechLang, string> = {
  en: 'en-GB',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  sv: 'sv-SE',
  nl: 'nl-NL',
}

// Bevorzugte männliche Stimmen pro Sprache
const PREFERRED_VOICES: Record<SpeechLang, string[]> = {
  en: ['google uk english male', 'daniel', 'james', 'google us english', 'microsoft mark', 'microsoft david', 'microsoft george', 'male'],
  de: ['microsoft stefan', 'microsoft conrad', 'stefan', 'conrad', 'markus', 'hans', 'google deutsch'],
  fr: ['microsoft paul', 'google français', 'thomas', 'paul'],
  it: ['microsoft cosimo', 'google italiano', 'luca', 'cosimo'],
  sv: ['microsoft mattias', 'google svenska', 'mattias'],
  nl: ['microsoft frank', 'google nederlands', 'frank'],
}

// Bekannte weibliche Stimmen (ausschließen)
const FEMALE_NAMES = ['hedda', 'katja', 'petra', 'vicki', 'anna', 'marlene', 'female', 'zira', 'hazel', 'hortense', 'elsa', 'caroline']

function findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const locale = LANG_LOCALE[voiceLang]
  const langPrefix = locale.slice(0, 2)
  const langVoices = voices.filter(v => v.lang.startsWith(langPrefix))

  // 1. Vom User gewählte Stimme hat Priorität
  if (preferredVoiceName) {
    const userChoice = langVoices.find(v => v.name === preferredVoiceName)
    if (userChoice) return userChoice
  }

  // 2. Automatische Auswahl (bevorzugt männlich)
  const preferred = PREFERRED_VOICES[voiceLang]
  let bestVoice: SpeechSynthesisVoice | null = null
  for (const pref of preferred) {
    const found = langVoices.find(v => v.name.toLowerCase().includes(pref))
    if (found) { bestVoice = found; break }
  }

  if (!bestVoice) {
    bestVoice = langVoices.find(v =>
      !FEMALE_NAMES.some(f => v.name.toLowerCase().includes(f))
    ) || langVoices[0] || null
  }

  return bestVoice || voices[0] || null
}

function initWebSpeechFallback() {
  if (webSpeechInitialized || typeof speechSynthesis === 'undefined') return

  const loadVoices = () => {
    const voices = speechSynthesis.getVoices()
    console.debug('Verfügbare Stimmen:', voices.map(v => `${v.name} (${v.lang})`).join(', '))

    webSpeechVoice = findBestVoice(voices)
    webSpeechInitialized = true

    if (webSpeechVoice) {
      console.debug(`Darts-Caller Stimme: ${webSpeechVoice.name} (${webSpeechVoice.lang})`)
    }
  }

  if (speechSynthesis.getVoices().length > 0) {
    loadVoices()
  } else {
    speechSynthesis.onvoiceschanged = loadVoices
  }
}

// Queue für Sprachausgabe - verhindert das Abschneiden von Ansagen
type SpeechQueueItem = {
  text: string
  options?: { pitch?: number; rate?: number }
}
const speechQueue: SpeechQueueItem[] = []
let isSpeaking = false

function ensureVoiceSelected(): SpeechSynthesisVoice | null {
  if (webSpeechVoice) return webSpeechVoice
  if (typeof speechSynthesis === 'undefined') return null

  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null

  webSpeechVoice = findBestVoice(voices)

  if (webSpeechVoice) {
    console.debug(`Stimme ausgewählt: ${webSpeechVoice.name} (${webSpeechVoice.lang})`)
  }

  return webSpeechVoice
}

function processNextInQueue() {
  if (speechQueue.length === 0) {
    isSpeaking = false
    return
  }

  isSpeaking = true
  const item = speechQueue.shift()!

  if (typeof speechSynthesis === 'undefined') {
    isSpeaking = false
    return
  }

  const voice = ensureVoiceSelected()

  const utterance = new SpeechSynthesisUtterance(item.text)
  utterance.lang = LANG_LOCALE[voiceLang]
  utterance.rate = item.options?.rate ?? 0.95
  utterance.pitch = item.options?.pitch ?? 0.9
  utterance.volume = 1.0

  if (voice) {
    utterance.voice = voice
  }

  utterance.onend = () => {
    setTimeout(processNextInQueue, 150)
  }

  utterance.onerror = () => {
    setTimeout(processNextInQueue, 50)
  }

  speechSynthesis.speak(utterance)
}

function speakWebSpeechFallback(text: string, options?: { pitch?: number; rate?: number }) {
  if (typeof speechSynthesis === 'undefined') return

  speechQueue.push({ text, options })

  if (!isSpeaking) {
    processNextInQueue()
  }
}

/**
 * Initialisiert die Sprachausgabe
 */
export function initSpeech() {
  initWebSpeechFallback()
}

/**
 * Spricht Text mit Web Speech API.
 * - Wenn nichts spricht → sofort abspielen
 * - Wenn etwas spricht aber Queue leer → einreihen (aktuelle Ansage zu Ende sprechen)
 * - Wenn Queue schon voll (≥2 wartend) → altes abbrechen, nur neuestes behalten
 */
let pendingSpeechTimer: ReturnType<typeof setTimeout> | null = null

export async function speak(text: string, options?: { pitch?: number; rate?: number; volume?: number }) {
  if (!enabled) return

  if (pendingSpeechTimer) {
    clearTimeout(pendingSpeechTimer)
    pendingSpeechTimer = null
  }

  if (!isSpeaking) {
    // Nothing playing → speak immediately
    speakWebSpeechFallback(text, options)
  } else if (speechQueue.length === 0) {
    // Something playing but queue empty → let it finish, then play this
    speakWebSpeechFallback(text, options)
  } else {
    // Queue already has items → drop the queue, keep only this new one
    speechQueue.length = 0
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
      isSpeaking = false
    }
    speakWebSpeechFallback(text, options)
  }
}

/**
 * Aktiviert oder deaktiviert die Sprachausgabe
 */
export function setSpeechEnabled(value: boolean) {
  enabled = value
  if (!value) {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
    }
  }
}

/**
 * Gibt zurück, ob die Sprachausgabe aktiviert ist
 */
export function isSpeechEnabled(): boolean {
  return enabled
}

/**
 * Spricht Text OHNE die aktuelle Ansage abzubrechen.
 * Reiht sich in die Queue ein und wartet bis die vorherige Ansage fertig ist.
 */
export function speakQueued(text: string, options?: { pitch?: number; rate?: number }) {
  if (!enabled) return
  speakWebSpeechFallback(text, options)
}

/**
 * Debounced Ansage: Wartet die angegebene Zeit ab bevor gesprochen wird.
 * Wird innerhalb der Wartezeit erneut aufgerufen, wird die vorherige
 * Ansage verworfen und nur die neue gesprochen. Verhindert "Ansage-Stau"
 * bei schnellem Undo/Redo.
 */
let debouncedTimer: ReturnType<typeof setTimeout> | null = null

export function debouncedAnnounce(fn: () => void, delayMs = 350) {
  if (debouncedTimer) clearTimeout(debouncedTimer)
  debouncedTimer = setTimeout(() => {
    debouncedTimer = null
    fn()
  }, delayMs)
}

export function cancelDebouncedAnnounce() {
  if (debouncedTimer) {
    clearTimeout(debouncedTimer)
    debouncedTimer = null
  }
  cancelPendingSpeech()
}

/**
 * Bricht alle ausstehenden Sprachansagen ab (Queue leeren + aktuelle Ansage stoppen).
 */
export function cancelPendingSpeech() {
  speechQueue.length = 0
  isSpeaking = false
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel()
  }
}

// ===== Spezifische Ansagen =====

let lastGameStartAnnounced: { name: string; time: number } | null = null

export function announceGameStart(firstPlayerName: string) {
  const now = Date.now()
  if (lastGameStartAnnounced &&
      lastGameStartAnnounced.name === firstPlayerName &&
      now - lastGameStartAnnounced.time < 2000) {
    return
  }
  lastGameStartAnnounced = { name: firstPlayerName, time: now }
  speak(t().gameStart(firstPlayerName))
}

let lastPlayerAnnounced: { name: string; time: number } | null = null

export function announceNextPlayer(playerName: string) {
  const now = Date.now()
  if (lastPlayerAnnounced &&
      lastPlayerAnnounced.name === playerName &&
      now - lastPlayerAnnounced.time < 1000) {
    return
  }
  lastPlayerAnnounced = { name: playerName, time: now }
  speakQueued(t().nextPlayer(playerName))
}

let lastScoreAnnounced: { score: number; bust: boolean; time: number } | null = null

export function announceScore(score: number, bust: boolean) {
  const now = Date.now()
  if (lastScoreAnnounced &&
      lastScoreAnnounced.score === score &&
      lastScoreAnnounced.bust === bust &&
      now - lastScoreAnnounced.time < 500) {
    return
  }
  lastScoreAnnounced = { score, bust, time: now }

  if (bust) {
    speak(t().noScore())
    return
  }

  if (score === 180) {
    speak(t().oneEighty())
  } else if (score >= 140) {
    speak(t().scoreExcited(score))
  } else {
    speak(t().score(score))
  }
}

let lastCheckoutDoubleAnnounced: { double: string; time: number } | null = null

export function announceCheckoutDouble(finishDouble: string) {
  const now = Date.now()
  if (lastCheckoutDoubleAnnounced &&
      lastCheckoutDoubleAnnounced.double === finishDouble &&
      now - lastCheckoutDoubleAnnounced.time < 1000) {
    return
  }
  lastCheckoutDoubleAnnounced = { double: finishDouble, time: now }

  if (finishDouble === 'BULL' || finishDouble === 'Bull') {
    speak(t().bull())
  } else if (finishDouble.startsWith('D')) {
    const num = parseInt(finishDouble.slice(1), 10)
    speak(t().double(num))
  }
}

let lastFinishAreaAnnounced: { name: string; remaining: number; time: number } | null = null

export function announcePlayerFinishArea(playerName: string, remaining: number) {
  const now = Date.now()
  if (lastFinishAreaAnnounced &&
      lastFinishAreaAnnounced.name === playerName &&
      lastFinishAreaAnnounced.remaining === remaining &&
      now - lastFinishAreaAnnounced.time < 1000) {
    return
  }
  lastFinishAreaAnnounced = { name: playerName, remaining, time: now }
  speakQueued(t().playerRemaining(playerName, remaining))
}

export function announceDouble(remaining: number) {
  if (remaining === 50) {
    speak(t().bull())
  } else if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    speak(t().double(remaining / 2))
  }
}

export function announceLegDart() {
  speak(t().andTheLeg())
}

export function announceSetDart() {
  speak(t().andTheSet())
}

export function announceMatchDart() {
  speak(t().gameShotMatch())
}

// ===== Cricket Ansagen =====

export function announceCrazyTarget(target: string) {
  const name = target === 'BULL' ? 'Bull' : target
  speak(t().crazyTarget(name))
}

export function announceCrazyPlayerTarget(playerName: string, targets: string[]) {
  const targetNames = targets.map(x => x === 'BULL' ? 'Bull' : x)
  speak(t().crazyPlayerTargets(playerName, targetNames))
}

export function announceCricketLeg(winnerName: string) {
  speak(t().cricketLeg(winnerName))
}

export function announceCricketMatch(winnerName: string) {
  speak(t().cricketMatch(winnerName))
}

export function announceClosed(target: string) {
  const name = target === 'BULL' ? 'Bull' : target
  speakQueued(t().closed(name))
}

export function announceCricketMarks(count: number) {
  if (count <= 0) return
  speakQueued(t().cricketMarks(count))
}

export function announcePlayerNeeds(playerName: string, needs: { target: string; count: number }[]) {
  speak(t().playerNeeds(playerName, needs))
}

// ===== Around the Block Ansagen =====

export function announceATBHit(mult: 1 | 2 | 3) {
  if (mult === 3) {
    speak(t().triple())
  } else if (mult === 2) {
    speak(t().doubleHit())
  }
}

export function announceATBWinner(playerName: string, darts: number, timeStr: string) {
  speak(t().atbWinner(playerName, darts, timeStr))
}

export function announceATBPlayerTurn(playerName: string, target: number | 'BULL') {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  speak(t().atbPlayerTurn(playerName, targetName))
}

export function announceATBNextTarget(target: number | 'BULL') {
  const name = target === 'BULL' ? 'Bull' : String(target)
  speak(name)
}

export function announceATBBullRequired() {
  speak(t().bullRequired())
}

export function announceATBEliminated(playerName: string) {
  speak(t().eliminated(playerName))
}

export function announceATBMissBack(target: number | 'BULL' | 'start') {
  if (target === 'start') {
    speak(t().threeMissesStart())
  } else {
    const name = target === 'BULL' ? 'Bull' : String(target)
    speak(t().threeMissesBack(name))
  }
}

// ===== Capture the Field (CTF) Ansagen =====

export function announceCTFPlayerTurn(playerName: string) {
  speak(t().ctfPlayerTurn(playerName))
}

export function announceCTFNewRound(playerName: string, target: number | 'BULL', roundNumber?: number) {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  if (roundNumber) {
    speak(t().ctfNewRound(roundNumber, playerName, targetName))
  } else {
    speak(t().ctfNewRoundNoNum(playerName, targetName))
  }
}

export function announceCTFPlayerScore(playerName: string, score: number) {
  if (score === 0) {
    speak(t().ctfNoScore())
  } else {
    speak(t().ctfPoints(score))
  }
}

export function announceCTFRoundResult(winnerName: string | null, target: number | 'BULL') {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  if (winnerName) {
    speak(t().ctfRoundWin(winnerName, targetName))
  } else {
    speak(t().ctfRoundTied(targetName))
  }
}

export function announceCTFLastRounds(roundNumber: number, totalRounds: number) {
  const roundsRemaining = totalRounds - roundNumber

  if (roundsRemaining === 3) {
    speak(t().ctfThirdToLast())
  } else if (roundsRemaining === 2) {
    speak(t().ctfSecondToLast())
  } else if (roundsRemaining === 1) {
    speak(t().ctfFinalRound())
  }
}

export function announceCTFWinner(playerName: string, fieldsWon: number) {
  speak(t().ctfWinner(playerName, fieldsWon))
}

export function announceCTFMatchEndRankings(rankings: Array<{ name: string; fields: number }>) {
  if (rankings.length === 0) return

  rankings.forEach((r, idx) => {
    if (idx >= 4) return
    setTimeout(() => {
      speak(t().ctfPlace(idx, r.name, r.fields))
    }, idx * 2500)
  })
}

// ===== Bob's 27 Ansagen =====

export function announceBobs27PlayerTurn(playerName: string, score: number, targetLabel: string) {
  speak(t().bobs27Turn(playerName, score, targetLabel))
}

export function announceBobs27MustScore() {
  speak(t().bobs27MustScore())
}

// ===== Shanghai SFX =====

let shanghaiAudioCtx: AudioContext | null = null

function getShanghaiAudioCtx(): AudioContext {
  if (!shanghaiAudioCtx) {
    shanghaiAudioCtx = new AudioContext()
  }
  return shanghaiAudioCtx
}

let shanghaiDrumRollAudio: HTMLAudioElement | null = null

export function playShanghaiDrumRoll() {
  if (!enabled) return
  try {
    stopShanghaiDrumRoll()
    shanghaiDrumRollAudio = new Audio('/sounds/drum-roll.mp3')
    shanghaiDrumRollAudio.volume = 0.6
    shanghaiDrumRollAudio.play().catch(() => {})
  } catch { /* ignore */ }
}

export function stopShanghaiDrumRoll() {
  if (shanghaiDrumRollAudio) {
    shanghaiDrumRollAudio.pause()
    shanghaiDrumRollAudio.currentTime = 0
    shanghaiDrumRollAudio = null
  }
}

// ===== Sträußchen Ansagen =====

export function announceStrPlayerTurn(playerName: string, targetNumber: number, ringMode: 'triple' | 'double' = 'triple') {
  speak(t().strPlayerTurn(playerName, targetNumber, ringMode))
}

export function announceStrPlayerDone(playerName: string, totalDarts: number, turns: number) {
  speak(t().strPlayerDone(playerName, totalDarts, turns))
}

export function announceStrLegWinner(playerName: string, darts: number) {
  speak(t().strLegWinner(playerName, darts))
}

export function announceStrMatchWinner(playerName: string) {
  speak(t().strMatchWinner(playerName))
}

// ===== Shanghai Ansagen =====

export function announceShanghaiRoundAndPlayer(targetNumber: number, playerName: string) {
  speak(t().shanghaiRoundPlayer(targetNumber, playerName))
}

export function announceShanghaiPlayerTurn(playerName: string) {
  speak(t().nextPlayer(playerName))
}

export function announceShanghaiHits(hits: number) {
  speak(t().shanghaiHits(hits))
}

export function announceShanghaiScore(playerName: string, score: number) {
  speak(t().shanghaiScore(playerName, score))
}

export function announceShanghai() {
  speak(t().shanghai())
}

// ===== Killer Announcements =====

export function announceKillerPlayerTurn(playerName: string) {
  speak(t().killerPlayerTurn(playerName))
}

export function announceKillerQualifyingTurn(playerName: string, targetNumber: number, ring: string) {
  speak(t().killerQualifying(playerName, ring, targetNumber))
}

export function announceKillerQualified(playerName: string) {
  speak(t().killerQualified(playerName))
}

export function announceKillerHit(attackerName: string, victimName: string, livesLeft: number) {
  speak(t().killerHit(attackerName, victimName, livesLeft))
}

export function announceKillerEliminated(playerName: string) {
  speak(t().killerEliminated(playerName))
}

export function announceKillerWinner(playerName: string) {
  speak(t().killerWinner(playerName))
}

export function announceKillerSelfHeal(playerName: string) {
  speak(t().killerSelfHeal(playerName))
}

export function announceKillerLegWin(playerName: string) {
  speak(t().killerLegWin(playerName))
}

export function announceKillerSetWin(playerName: string) {
  speak(t().killerSetWin(playerName))
}

export function announceKillerTurnSummary(playerName: string, hits: number) {
  speak(t().killerTurnSummary(playerName, hits))
}

// ===== Killer SFX (Web Audio API - synthetisch) =====

let killerAudioCtx: AudioContext | null = null

function getKillerAudioCtx(): AudioContext {
  if (!killerAudioCtx) {
    killerAudioCtx = new AudioContext()
  }
  return killerAudioCtx
}

export function playKillerHitSound() {
  if (!enabled) return
  try {
    const ctx = getKillerAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch { /* ignore */ }
}

export function playKillerEliminatedSound() {
  if (!enabled) return
  try {
    const ctx = getKillerAudioCtx()
    const time = ctx.currentTime

    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.4)
    oscGain.gain.setValueAtTime(0.3, time)
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.45)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + 0.5)

    const bufferSize = ctx.sampleRate * 0.1
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.2, time)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1)
    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(time)
    noise.stop(time + 0.12)
  } catch { /* ignore */ }
}

// ===== Operation Streak SFX (Web Audio API - synthetisch) =====

let opAudioCtx: AudioContext | null = null

function getOpAudioCtx(): AudioContext {
  if (!opAudioCtx) {
    opAudioCtx = new AudioContext()
  }
  return opAudioCtx
}

export function playOperationStreakSound(streak: number) {
  if (!enabled) return
  if (streak < 5) return

  try {
    const ctx = getOpAudioCtx()
    const time = ctx.currentTime

    if (streak >= 30) {
      const notes = [523, 659, 784, 1047, 1319]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, time + i * 0.12)
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(0.25, time + i * 0.12)
        gain.gain.linearRampToValueAtTime(0.15, time + i * 0.12 + 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(time + i * 0.12)
        osc.stop(time + 2.2)
      })

      const bufLen = ctx.sampleRate * 1.5
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < bufLen; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.08 * Math.pow(1 - i / bufLen, 2)
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.setValueAtTime(4000, time)
      const nGain = ctx.createGain()
      nGain.gain.setValueAtTime(0.3, time + 0.3)
      nGain.gain.exponentialRampToValueAtTime(0.001, time + 2.0)
      noise.connect(filter)
      filter.connect(nGain)
      nGain.connect(ctx.destination)
      noise.start(time + 0.3)
      noise.stop(time + 2.2)
      return
    }

    const intensity = (streak - 5) / 24
    const baseFreq = 330 + intensity * 550
    const vol = 0.1 + intensity * 0.25
    const dur = 0.12 + intensity * 0.13

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = intensity > 0.6 ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(baseFreq, time)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, time + dur * 0.6)
    gain.gain.setValueAtTime(vol, time)
    gain.gain.linearRampToValueAtTime(vol * 0.8, time + dur * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + dur + 0.05)

    if (streak >= 15) {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(baseFreq * 2, time)
      osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.3, time + dur * 0.6)
      gain2.gain.setValueAtTime(vol * 0.3, time)
      gain2.gain.exponentialRampToValueAtTime(0.001, time + dur)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(time)
      osc2.stop(time + dur + 0.05)
    }

    if (streak >= 22) {
      const osc3 = ctx.createOscillator()
      const gain3 = ctx.createGain()
      osc3.type = 'sine'
      osc3.frequency.setValueAtTime(baseFreq * 1.5, time)
      gain3.gain.setValueAtTime(vol * 0.2, time)
      gain3.gain.exponentialRampToValueAtTime(0.001, time + dur)
      osc3.connect(gain3)
      gain3.connect(ctx.destination)
      osc3.start(time)
      osc3.stop(time + dur + 0.05)
    }
  } catch { /* ignore */ }
}

// ===== Operation Ansagen =====

export function announceOperationGameStart(playerName: string) {
  speak(t().opGameStart(playerName))
}

export function announceOperationNextPlayer(playerName: string) {
  speak(t().nextPlayer(playerName))
}

export function announceOperationLastRound() {
  speak(t().opLastRound())
}

export function announceOperationHits(hits: number) {
  speak(t().opHits(hits))
}

// ===== Sound-Effekte =====

const soundCache = new Map<string, HTMLAudioElement>()

export function playSoundEffect(filename: string) {
  const path = `/sounds/${filename}`
  let audio = soundCache.get(path)
  if (audio) {
    audio.currentTime = 0
  } else {
    audio = new Audio(path)
    soundCache.set(path, audio)
  }
  audio.play().catch(() => { /* autoplay policy */ })
}

export function playTriple20Sound() {
  playSoundEffect('Triple.wav')
}
