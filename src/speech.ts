// src/speech.ts
// Sprachausgabe-Modul für X01-Darts - ElevenLabs + Web Speech API Fallback

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
const VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
const MODEL_ID = 'eleven_multilingual_v2'

let enabled = true
let currentAudio: HTMLAudioElement | null = null

// Audio-Cache für häufige Phrasen (spart API-Calls)
const audioCache = new Map<string, string>()

// ===== Stimmen-Konfiguration =====
export type VoiceLang = 'en' | 'de'

const VOICE_LANG_KEY = 'darts-voice-lang'

let voiceLang: VoiceLang = (localStorage.getItem(VOICE_LANG_KEY) as VoiceLang) || 'en'

export function getVoiceLang(): VoiceLang {
  return voiceLang
}

export function setVoiceLang(lang: VoiceLang) {
  voiceLang = lang
  localStorage.setItem(VOICE_LANG_KEY, lang)
  // Voice neu laden
  webSpeechInitialized = false
  webSpeechVoice = null
  initWebSpeechFallback()
}

// Fallback: Web Speech API
let webSpeechVoice: SpeechSynthesisVoice | null = null
let webSpeechInitialized = false

function initWebSpeechFallback() {
  if (webSpeechInitialized || typeof speechSynthesis === 'undefined') return

  const loadVoices = () => {
    const voices = speechSynthesis.getVoices()

    // Debug: alle verfügbaren Stimmen loggen
    console.log('Verfügbare Stimmen:', voices.map(v => `${v.name} (${v.lang})`).join(', '))

    if (voiceLang === 'de') {
      // Deutsche Männerstimme bevorzugen
      const deVoices = voices.filter(v => v.lang.startsWith('de'))
      console.log('Deutsche Stimmen:', deVoices.map(v => v.name).join(', '))

      // Bekannte männliche deutsche Stimmen (bevorzugt)
      const preferredDe = [
        'microsoft stefan',
        'microsoft conrad',
        'stefan',
        'conrad',
        'markus',
        'hans',
        'google deutsch',
      ]

      // Bekannte weibliche deutsche Stimmen (ausschließen)
      const femaleNames = ['hedda', 'katja', 'petra', 'vicki', 'anna', 'marlene', 'female']

      let bestVoice: SpeechSynthesisVoice | null = null
      for (const pref of preferredDe) {
        const found = deVoices.find(v => v.name.toLowerCase().includes(pref))
        if (found) { bestVoice = found; break }
      }

      if (!bestVoice) {
        // Fallback: erste deutsche Stimme die nicht weiblich ist
        bestVoice = deVoices.find(v =>
          !femaleNames.some(f => v.name.toLowerCase().includes(f))
        ) || deVoices[0] || null
      }

      webSpeechVoice = bestVoice || voices[0] || null
    } else {
      // Englische Männerstimme bevorzugen (Darts-Caller Style)
      const enVoices = voices.filter(v => v.lang.startsWith('en'))

      const preferredEn = [
        'google uk english male',
        'daniel',
        'james',
        'google us english',
        'microsoft mark',
        'microsoft david',
        'microsoft george',
        'male',
      ]

      let bestVoice: SpeechSynthesisVoice | null = null
      for (const pref of preferredEn) {
        const found = enVoices.find(v => v.name.toLowerCase().includes(pref))
        if (found) { bestVoice = found; break }
      }

      if (!bestVoice) {
        bestVoice = enVoices.find(v =>
          !v.name.toLowerCase().includes('female') &&
          !v.name.toLowerCase().includes('zira') &&
          !v.name.toLowerCase().includes('hazel')
        ) || enVoices[0] || null
      }

      webSpeechVoice = bestVoice || voices[0] || null
    }

    webSpeechInitialized = true

    if (webSpeechVoice) {
      console.log(`Darts-Caller Stimme: ${webSpeechVoice.name} (${webSpeechVoice.lang})`)
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

// Hilfsfunktion: Die beste männliche Stimme finden (wird bei jedem Aufruf geprüft)
function ensureVoiceSelected(): SpeechSynthesisVoice | null {
  if (webSpeechVoice) return webSpeechVoice

  // Stimmen noch nicht geladen - versuchen zu laden
  if (typeof speechSynthesis === 'undefined') return null

  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null

  if (voiceLang === 'de') {
    const deVoices = voices.filter(v => v.lang.startsWith('de'))
    const preferredDe = ['microsoft stefan', 'microsoft conrad', 'stefan', 'conrad', 'markus', 'hans']
    const femaleNames = ['hedda', 'katja', 'petra', 'vicki', 'anna', 'marlene', 'female']

    for (const pref of preferredDe) {
      const found = deVoices.find(v => v.name.toLowerCase().includes(pref))
      if (found) { webSpeechVoice = found; break }
    }

    if (!webSpeechVoice) {
      webSpeechVoice = deVoices.find(v =>
        !femaleNames.some(f => v.name.toLowerCase().includes(f))
      ) || deVoices[0] || voices[0] || null
    }
  } else {
    const enVoices = voices.filter(v => v.lang.startsWith('en'))
    const preferredEn = ['google uk english male', 'daniel', 'james', 'microsoft mark', 'microsoft david', 'microsoft george']

    for (const pref of preferredEn) {
      const found = enVoices.find(v => v.name.toLowerCase().includes(pref))
      if (found) { webSpeechVoice = found; break }
    }

    if (!webSpeechVoice) {
      webSpeechVoice = enVoices.find(v =>
        !v.name.toLowerCase().includes('female') &&
        !v.name.toLowerCase().includes('zira') &&
        !v.name.toLowerCase().includes('hazel')
      ) || enVoices[0] || voices[0] || null
    }
  }

  if (webSpeechVoice) {
    console.log(`Stimme ausgewählt: ${webSpeechVoice.name} (${webSpeechVoice.lang})`)
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

  // Stimme bei jedem Aufruf sicherstellen
  const voice = ensureVoiceSelected()

  const utterance = new SpeechSynthesisUtterance(item.text)
  utterance.lang = voiceLang === 'de' ? 'de-DE' : 'en-GB'
  utterance.rate = item.options?.rate ?? 0.95
  utterance.pitch = item.options?.pitch ?? 0.9
  utterance.volume = 1.0

  // Stimme IMMER explizit setzen (nicht nur wenn vorhanden)
  if (voice) {
    utterance.voice = voice
  }

  // Wenn diese Ansage fertig ist, die nächste starten
  utterance.onend = () => {
    // Kleine Pause zwischen Ansagen für natürlicheren Klang
    setTimeout(processNextInQueue, 150)
  }

  // Bei Fehler trotzdem weitermachen
  utterance.onerror = () => {
    setTimeout(processNextInQueue, 50)
  }

  speechSynthesis.speak(utterance)
}

function speakWebSpeechFallback(text: string, options?: { pitch?: number; rate?: number }) {
  if (typeof speechSynthesis === 'undefined') return

  // Zur Queue hinzufügen
  speechQueue.push({ text, options })

  // Queue starten falls nicht bereits am Sprechen
  if (!isSpeaking) {
    processNextInQueue()
  }
}

/**
 * Initialisiert die Sprachausgabe
 */
export function initSpeech() {
  initWebSpeechFallback()

  if (API_KEY) {
    console.log('ElevenLabs Sprachausgabe aktiviert')
  } else {
    console.log('Kein ElevenLabs API-Key gefunden, verwende Web Speech API')
  }
}

/**
 * Spricht Text mit ElevenLabs (oder Web Speech Fallback)
 */
export async function speak(text: string, options?: { pitch?: number; rate?: number; volume?: number }) {
  if (!enabled) return

  // Kein API-Key -> Web Speech Fallback
  if (!API_KEY) {
    speakWebSpeechFallback(text, options)
    return
  }

  // Vorheriges Audio stoppen
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  // Cache prüfen
  const cacheKey = text.toLowerCase().trim()
  if (audioCache.has(cacheKey)) {
    const audio = new Audio(audioCache.get(cacheKey)!)
    audio.volume = options?.volume ?? 1.0
    currentAudio = audio
    await audio.play().catch(err => {
      console.warn('Audio playback failed:', err)
      speakWebSpeechFallback(text, options)
    })
    return
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      console.warn('ElevenLabs API error:', response.status, await response.text())
      speakWebSpeechFallback(text, options)
      return
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)

    // Cache für kurze, häufige Phrasen
    if (text.length < 30) {
      audioCache.set(cacheKey, audioUrl)
    }

    const audio = new Audio(audioUrl)
    audio.volume = options?.volume ?? 1.0
    currentAudio = audio
    await audio.play()
  } catch (err) {
    console.warn('ElevenLabs fetch error:', err)
    speakWebSpeechFallback(text, options)
  }
}

/**
 * Aktiviert oder deaktiviert die Sprachausgabe
 */
export function setSpeechEnabled(value: boolean) {
  enabled = value
  if (!value) {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
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

// ===== Spezifische Ansagen =====

/**
 * "Game on!" - Spielstart (veraltet, besser announceGameStart verwenden)
 */
export function announceGameOn() {
  speak('Game on!')
}

/**
 * "[Name], throw first! Game on!" - Spielstart mit erstem Werfer
 * Sollte in ALLEN Spielmodi verwendet werden
 * Mit Debounce um doppelte Ansagen zu verhindern
 */
let lastGameStartAnnounced: { name: string; time: number } | null = null

export function announceGameStart(firstPlayerName: string) {
  const now = Date.now()
  // Debounce: Gleichen Namen nicht innerhalb von 2s erneut ansagen
  if (lastGameStartAnnounced &&
      lastGameStartAnnounced.name === firstPlayerName &&
      now - lastGameStartAnnounced.time < 2000) {
    return
  }
  lastGameStartAnnounced = { name: firstPlayerName, time: now }
  speak(`${firstPlayerName}, throw first! Game on!`)
}

/**
 * Sagt den Namen des nächsten Werfers an
 * Wird nach jeder Aufnahme aufgerufen
 * Mit Debounce um doppelte Ansagen zu verhindern
 */
let lastPlayerAnnounced: { name: string; time: number } | null = null

export function announceNextPlayer(playerName: string) {
  const now = Date.now()
  // Debounce: Gleichen Namen nicht innerhalb von 1s erneut ansagen
  if (lastPlayerAnnounced &&
      lastPlayerAnnounced.name === playerName &&
      now - lastPlayerAnnounced.time < 1000) {
    return
  }
  lastPlayerAnnounced = { name: playerName, time: now }
  speak(playerName)
}

/**
 * Sagt den Score einer Aufnahme an - mit Enthusiasmus bei guten Scores
 * Mit Debounce um doppelte Ansagen zu verhindern
 */
let lastScoreAnnounced: { score: number; bust: boolean; time: number } | null = null

export function announceScore(score: number, bust: boolean) {
  // Debounce: Gleichen Score nicht innerhalb von 500ms erneut ansagen
  const now = Date.now()
  if (lastScoreAnnounced &&
      lastScoreAnnounced.score === score &&
      lastScoreAnnounced.bust === bust &&
      now - lastScoreAnnounced.time < 500) {
    return // Doppelte Ansage verhindern
  }
  lastScoreAnnounced = { score, bust, time: now }

  if (bust) {
    speak('No score!')
    return
  }

  if (score === 180) {
    speak('One hundred and eighty!')
  } else if (score >= 140) {
    speak(String(score) + '!')
  } else if (score >= 100) {
    speak(String(score))
  } else if (score >= 60) {
    speak(String(score))
  } else {
    speak(String(score))
  }
}

/**
 * Sagt das finale Double für den Checkout an
 * z.B. "Double 16" oder "Bull"
 * Mit Debounce um doppelte Ansagen zu verhindern
 */
let lastCheckoutDoubleAnnounced: { double: string; time: number } | null = null

export function announceCheckoutDouble(finishDouble: string) {
  const now = Date.now()
  // Debounce: Gleiches Double nicht innerhalb von 1s erneut ansagen
  if (lastCheckoutDoubleAnnounced &&
      lastCheckoutDoubleAnnounced.double === finishDouble &&
      now - lastCheckoutDoubleAnnounced.time < 1000) {
    return
  }
  lastCheckoutDoubleAnnounced = { double: finishDouble, time: now }

  // finishDouble ist z.B. "D16", "D20", "BULL"
  if (finishDouble === 'BULL' || finishDouble === 'Bull') {
    speak('Bull')
  } else if (finishDouble.startsWith('D')) {
    const num = finishDouble.slice(1)
    speak(`Double ${num}`)
  }
}

/**
 * @deprecated Verwende announceCheckoutDouble stattdessen
 */
export function announceCheckout(_playerName: string, _remaining: number) {
  // Nicht mehr verwendet - announceCheckoutDouble wird stattdessen aufgerufen
}

/**
 * Sagt den Spielernamen + Rest-Score an wenn er im Finish-Bereich ist
 * z.B. "David, 121" oder "Tim, 40"
 * Wird beim Spielerwechsel aufgerufen wenn der nächste Spieler ≤170 Rest hat
 * Mit Debounce um doppelte Ansagen zu verhindern
 */
let lastFinishAreaAnnounced: { name: string; remaining: number; time: number } | null = null

export function announcePlayerFinishArea(playerName: string, remaining: number) {
  const now = Date.now()
  // Debounce: Gleiche Kombination nicht innerhalb von 1s erneut ansagen
  if (lastFinishAreaAnnounced &&
      lastFinishAreaAnnounced.name === playerName &&
      lastFinishAreaAnnounced.remaining === remaining &&
      now - lastFinishAreaAnnounced.time < 1000) {
    return
  }
  lastFinishAreaAnnounced = { name: playerName, remaining, time: now }
  speak(`${playerName}, ${remaining}`)
}

/**
 * Sagt das Finish-Double an (z.B. "Double 20" bei 40 Rest)
 * Wird nach jedem Dart aufgerufen wenn Spieler auf 1-Dart-Finish steht
 */
export function announceDouble(remaining: number) {
  // Bull bei 50 Rest
  if (remaining === 50) {
    speak('Bull')
  }
  // Double bei 2, 4, 6, ..., 40 Rest (gerade Zahlen)
  else if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    speak(`Double ${remaining / 2}`)
  }
}

/**
 * Sagt "Leg!" an
 */
export function announceLegDart() {
  speak('And the Leg!')
}

/**
 * Sagt "Set!" an
 */
export function announceSetDart() {
  speak('And the Set!')
}

/**
 * Sagt "Game Shot and the Match!" an
 */
export function announceMatchDart() {
  speak('Game shot, and the match!')
}

/**
 * Sagt die Crazy Cricket Zielzahl an: "The new target is ..."
 */
export function announceCrazyTarget(target: string) {
  const name = target === 'BULL' ? 'Bull' : target
  speak(`The new target is ${name}`)
}

/**
 * Sagt den Spielernamen und die Crazy Cricket Zielzahl(en) an
 * Bei Pro-Modus (3 Ziele): "Tim, 20, 18, Bull"
 * Bei Normal (1 Ziel): "Tim, 20"
 */
export function announceCrazyPlayerTarget(playerName: string, targets: string[]) {
  const targetNames = targets.map(t => t === 'BULL' ? 'Bull' : t)
  speak(`${playerName}, ${targetNames.join(', ')}`)
}

/**
 * Sagt "And the Leg!" für Cricket an
 */
export function announceCricketLeg(winnerName: string) {
  speak(`${winnerName}, and the Leg!`)
}

/**
 * Sagt "Game shot, and the match!" für Cricket an
 */
export function announceCricketMatch(winnerName: string) {
  speak(`Game shot, and the match! ${winnerName}!`)
}

/**
 * Sagt "[Zahl] is closed" an (wenn alle Spieler eine Zahl geschlossen haben)
 */
export function announceClosed(target: string) {
  const name = target === 'BULL' ? 'Bull' : target
  speak(`${name} is closed`)
}

/**
 * Sagt die Anzahl der Treffer nach einem Cricket-Turn an
 * Beispiel: "drei Treffer" oder "zwei Treffer"
 * Nur Treffer, die tatsächlich zählen (nicht auf bereits geschlossene Segmente)
 */
export function announceCricketMarks(count: number) {
  if (count <= 0) return // Keine Ansage wenn keine Treffer

  const countWord = count === 1 ? 'ein' : count === 2 ? 'zwei' : count === 3 ? 'drei' : `${count}`
  const hitWord = count === 1 ? 'Treffer' : 'Treffer'
  speak(`${countWord} ${hitWord}`)
}

/**
 * Sagt an, was ein Spieler noch braucht (Cricket Status)
 * Beispiel: "Tim, du brauchst noch zwei 20er, eine 16 und zweimal das Bullen."
 */
export function announcePlayerNeeds(playerName: string, needs: { target: string; count: number }[]) {
  if (needs.length === 0) {
    speak(`${playerName}, alles geschlossen, mach Punkte!`)
    return
  }

  const countWord = (n: number) => n === 1 ? 'eine' : n === 2 ? 'zwei' : 'drei'
  const bullWord = (n: number) => n === 1 ? 'einmal das Bullen' : n === 2 ? 'zweimal das Bullen' : 'dreimal das Bullen'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return bullWord(count)
    return `${countWord(count)} ${target}er`
  })

  let list: string
  if (parts.length === 1) {
    list = parts[0]
  } else {
    list = parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1]
  }

  speak(`${playerName}, du brauchst noch ${list}.`)
}

// ===== Around the Block Ansagen =====

/**
 * Sagt das aktuelle Ziel an
 */
export function announceATBTarget(target: number | 'BULL') {
  const name = target === 'BULL' ? 'Bull' : String(target)
  speak(name)
}

/**
 * Sagt "Hit!" oder "Double!" / "Triple!" bei Treffern an
 */
export function announceATBHit(mult: 1 | 2 | 3) {
  if (mult === 3) {
    speak('Triple!')
  } else if (mult === 2) {
    speak('Double!')
  }
  // Single: kein Sound, um nicht zu nerven
}

/**
 * Sagt den Gewinner von Around the Block an
 */
export function announceATBWinner(playerName: string, darts: number, timeStr: string) {
  speak(`${playerName} wins! ${darts} darts in ${timeStr}`)
}

/**
 * Sagt "Game on!" für Around the Block an
 */
export function announceATBGameOn() {
  speak('Around the Block, Game on!')
}

/**
 * Sagt das neue Ziel nach einem Treffer an
 */
export function announceATBNextTarget(target: number | 'BULL') {
  const name = target === 'BULL' ? 'Bull' : String(target)
  speak(name)
}

/**
 * Sagt den Spielernamen und sein Ziel an wenn er dran ist
 * Beispiel: "David, 15" oder "Tim, Bull"
 */
export function announceATBPlayerTurn(playerName: string, target: number | 'BULL') {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  speak(`${playerName}, ${targetName}`)
}

/**
 * Sagt "Bull required!" für Bull Heavy Modus
 */
export function announceATBBullRequired() {
  speak('Bull required!')
}

/**
 * Sagt "[Name] is eliminated!" für Sudden Death
 */
export function announceATBEliminated(playerName: string) {
  speak(`${playerName} is eliminated!`)
}

/**
 * Sagt "3 misses! Back to [Zahl]!" für Miss 3 Back Regel
 */
export function announceATBMissBack(target: number | 'BULL' | 'start') {
  if (target === 'start') {
    speak('Three misses! Back to start!')
  } else {
    const name = target === 'BULL' ? 'Bull' : String(target)
    speak(`Three misses! Back to ${name}!`)
  }
}

/**
 * Sagt den aktuellen Fortschritt im Einzelspieler an
 * z.B. "5 of 21" oder "Finished!"
 */
export function announceATBProgress(current: number, total: number) {
  if (current >= total) {
    speak('Finished!')
  } else {
    speak(`${current} of ${total}`)
  }
}

// ===== ATB Piratenmodus Ansagen =====

/**
 * Sagt den Spieler an, der im Piratenmodus dran ist
 * z.B. "David, your turn"
 */
export function announceATBPiratePlayerTurn(playerName: string) {
  speak(`${playerName}, your turn`)
}

/**
 * Sagt das aktuelle Ziel im Piratenmodus an
 * z.B. "Target: 15" oder "Target: Bull"
 */
export function announceATBPirateTarget(target: number | 'BULL') {
  const name = target === 'BULL' ? 'Bull' : String(target)
  speak(`Target: ${name}`)
}

/**
 * Sagt Spieler + Ziel zusammen an (wenn sich das Ziel geändert hat)
 * z.B. "David, target 15" oder "Round 5, Tim, 18"
 */
export function announceATBPirateNewRound(playerName: string, target: number | 'BULL', roundNumber?: number) {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  if (roundNumber) {
    speak(`Round ${roundNumber}, ${playerName}, ${targetName}`)
  } else {
    speak(`${playerName}, ${targetName}`)
  }
}

/**
 * Sagt den Score eines Spielers nach seinem Wurf im Piratenmodus an
 * z.B. "5 points" (ohne Namen, da dieser gerade schon gesagt wurde)
 */
export function announceATBPiratePlayerScore(playerName: string, score: number) {
  if (score === 0) {
    speak('no score')
  } else if (score === 1) {
    speak('1 point')
  } else {
    speak(`${score} points`)
  }
}

/**
 * Sagt das Ergebnis einer Piratenmodus-Runde an
 * z.B. "David wins 15!" oder "15 is tied!"
 */
export function announceATBPirateRoundResult(winnerName: string | null, target: number | 'BULL') {
  const targetName = target === 'BULL' ? 'Bull' : String(target)
  if (winnerName) {
    speak(`${winnerName} wins ${targetName}!`)
  } else {
    speak(`${targetName} is tied!`)
  }
}

/**
 * Sagt die aktuelle Rundennummer im Piratenmodus an
 * z.B. "Round 5 of 21"
 * @deprecated Verwende announceATBPirateLastRounds stattdessen
 */
export function announceATBPirateRoundNumber(roundNumber: number, totalRounds: number = 21) {
  speak(`Round ${roundNumber} of ${totalRounds}`)
}

/**
 * Sagt die letzten 3 Runden im Piratenmodus an
 * Nur bei Drittletzte, Zweitletzte, Letzte Runde
 */
export function announceATBPirateLastRounds(roundNumber: number, totalRounds: number) {
  const roundsRemaining = totalRounds - roundNumber

  if (roundsRemaining === 2) {
    speak('Third to last round!')
  } else if (roundsRemaining === 1) {
    speak('Second to last round!')
  } else if (roundsRemaining === 0) {
    speak('Final round!')
  }
  // Bei mehr als 3 verbleibenden Runden: keine Ansage
}

/**
 * Sagt den Spielstand im Piratenmodus an
 * z.B. "Score: David 5, Tim 3"
 */
export function announceATBPirateScore(scores: { name: string; fields: number }[]) {
  const parts = scores.map(s => `${s.name} ${s.fields}`)
  speak(`Score: ${parts.join(', ')}`)
}

/**
 * Sagt den Gewinner des Piratenmodus-Matches an
 * z.B. "David wins with 12 fields!"
 */
export function announceATBPirateWinner(playerName: string, fieldsWon: number) {
  speak(`${playerName} wins the match with ${fieldsWon} fields!`)
}

/**
 * Sagt die Endplatzierungen im Piratenmodus an
 * 1. Platz, 2. Platz, 3. Platz mit jeweiligen Feldanzahlen
 * Wird am Ende des Matches aufgerufen
 */
export function announceATBPirateMatchEndRankings(rankings: Array<{ name: string; fields: number }>) {
  if (rankings.length === 0) return

  // 1. Platz sofort ansagen
  const first = rankings[0]
  speak(`${first.name} wins with ${first.fields} fields!`)

  // 2. Platz nach 2.5 Sekunden
  if (rankings.length >= 2) {
    const second = rankings[1]
    setTimeout(() => {
      speak(`Second place: ${second.name} with ${second.fields} fields!`)
    }, 2500)
  }

  // 3. Platz nach 5 Sekunden
  if (rankings.length >= 3) {
    const third = rankings[2]
    setTimeout(() => {
      speak(`Third place: ${third.name} with ${third.fields} fields!`)
    }, 5000)
  }
}

// ===== Sträußchen Ansagen =====

/**
 * Sagt den Spielernamen und sein Ziel an wenn er dran ist
 * z.B. "David, Triple 20" oder "David, Double 18" oder "David, Bull"
 */
export function announceStrPlayerTurn(playerName: string, targetNumber: number, ringMode: 'triple' | 'double' = 'triple') {
  if (targetNumber === 25) {
    speak(`${playerName}, Bull`)
  } else if (ringMode === 'double') {
    speak(`${playerName}, Double ${targetNumber}`)
  } else {
    speak(`${playerName}, Triple ${targetNumber}`)
  }
}

/**
 * Sagt die Zusammenfassung wenn ein Spieler alle Triples geschafft hat
 * z.B. "David fertig! 12 Darts in 4 Aufnahmen."
 */
export function announceStrPlayerDone(playerName: string, totalDarts: number, turns: number) {
  if (voiceLang === 'de') {
    speak(`${playerName} fertig! ${totalDarts} Darts in ${turns} Aufnahmen.`)
  } else {
    speak(`${playerName} done! ${totalDarts} darts in ${turns} rounds.`)
  }
}

/**
 * Sagt den Leg-Gewinner an
 */
export function announceStrLegWinner(playerName: string, darts: number) {
  speak(`${playerName} wins the leg! ${darts} darts.`)
}

/**
 * Sagt den Match-Gewinner an
 */
export function announceStrMatchWinner(playerName: string) {
  speak(`Game shot, and the match! ${playerName}!`)
}

/**
 * Sagt "Game on!" für Sträußchen
 */
export function announceStrGameOn() {
  speak('Sträußchen, Game on!')
}

// ===== Sound-Effekte =====

const soundCache = new Map<string, HTMLAudioElement>()

/**
 * Spielt eine Sound-Datei ab (aus public/sounds/).
 * Nutzt Cache für schnelles Replay.
 */
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

/**
 * T20-Sound abspielen (Triple 20)
 */
export function playTriple20Sound() {
  playSoundEffect('Triple.wav')
}
