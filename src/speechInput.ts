// src/speechInput.ts
// Spracheingabe für Dart-Würfe - Web Speech API

export type DartResult = {
  bed: number | 'BULL' | 'DBULL' | 'MISS'
  mult: 1 | 2 | 3
}

// Browser-Kompatibilität
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

/**
 * Prüft ob Spracheingabe unterstützt wird
 */
export function isSpeechInputSupported(): boolean {
  return !!SpeechRecognition
}

/**
 * Deutsche Zahlwörter auf Ziffern mappen (inkl. häufige Varianten/Fehler)
 */
const germanNumbers: Record<string, number> = {
  // 1
  'eins': 1, 'ein': 1, 'eine': 1, '1': 1, 'einz': 1,
  // 2
  'zwei': 2, 'zwo': 2, '2': 2,
  // 3
  'drei': 3, '3': 3, 'dry': 3,
  // 4
  'vier': 4, '4': 4, 'fier': 4,
  // 5
  'fünf': 5, 'fuenf': 5, '5': 5, 'fümf': 5, 'fumf': 5,
  // 6
  'sechs': 6, '6': 6, 'sex': 6, 'seks': 6,
  // 7
  'sieben': 7, '7': 7, 'sibn': 7,
  // 8
  'acht': 8, '8': 8,
  // 9
  'neun': 9, '9': 9, 'nein': 9,
  // 10
  'zehn': 10, '10': 10, 'zehen': 10,
  // 11
  'elf': 11, '11': 11,
  // 12
  'zwölf': 12, 'zwoelf': 12, '12': 12, 'zwolf': 12,
  // 13
  'dreizehn': 13, '13': 13,
  // 14
  'vierzehn': 14, '14': 14,
  // 15
  'fünfzehn': 15, 'fuenfzehn': 15, '15': 15, 'fümfzehn': 15,
  // 16
  'sechzehn': 16, '16': 16,
  // 17
  'siebzehn': 17, '17': 17,
  // 18
  'achtzehn': 18, '18': 18,
  // 19
  'neunzehn': 19, '19': 19,
  // 20
  'zwanzig': 20, '20': 20,
  // 25 (Bull)
  'fünfundzwanzig': 25, 'fuenfundzwanzig': 25, '25': 25,
  // 50 (Double Bull)
  'fünfzig': 50, 'fuenfzig': 50, '50': 50,
}

/**
 * Normalisiert Text für bessere Erkennung
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Umlaute normalisieren
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ß/g, 'ss')
    // Häufige Erkennungsfehler korrigieren
    .replace(/\btripple\b/g, 'triple')
    .replace(/\btrippel\b/g, 'triple')
    .replace(/\bdupple\b/g, 'double')
    .replace(/\bduppel\b/g, 'double')
    .replace(/\bdoble\b/g, 'double')
}

/**
 * Konvertiert Text zu Zahl (Ziffer oder deutsches Wort)
 */
function textToNumber(text: string): number | null {
  const clean = normalizeText(text)

  // Direkte Zahl
  const num = parseInt(clean)
  if (!isNaN(num)) return num

  // Deutsches Zahlwort
  if (germanNumbers[clean] !== undefined) {
    return germanNumbers[clean]
  }

  // Auch ohne Normalisierung probieren
  const orig = text.toLowerCase().trim()
  if (germanNumbers[orig] !== undefined) {
    return germanNumbers[orig]
  }

  return null
}

/**
 * Parst gesprochenen Text in ein DartResult
 */
export function parseDartFromSpeech(text: string): DartResult | null {
  const lower = text.toLowerCase().trim()
  const normalized = normalizeText(text)

  // Miss-Varianten (großzügig matchen)
  const missWords = ['miss', 'vorbei', 'daneben', 'nichts', 'nix', 'fehl', 'fehler', 'kein', 'keiner', 'verfehlt', 'weg', 'vorbey']
  if (missWords.some(w => lower.includes(w) || normalized.includes(w))) {
    return { bed: 'MISS', mult: 1 }
  }

  // Double Bull (50) - vor Bull prüfen!
  const doubleBullPatterns = [
    'double bull', 'doppel bull', 'bulls eye', 'bullseye', 'bull\'s eye',
    'doppelbull', 'doublebull', 'bulleye', 'volles bull', 'rotes bull'
  ]
  if (
    doubleBullPatterns.some(p => lower.includes(p) || normalized.includes(p)) ||
    lower === '50' ||
    normalized === '50' ||
    lower === 'fünfzig' ||
    normalized === 'fuenfzig'
  ) {
    return { bed: 'DBULL', mult: 1 }
  }

  // Single Bull (25)
  const singleBullPatterns = ['bull', 'single bull', 'einfach bull', 'grünes bull', 'gruenes bull']
  if (
    singleBullPatterns.some(p => lower.includes(p) || normalized.includes(p)) ||
    lower === '25' ||
    lower === 'fünfundzwanzig' ||
    normalized === 'fuenfundzwanzig'
  ) {
    return { bed: 'BULL', mult: 1 }
  }

  // Triple + Zahl (verschiedene Schreibweisen)
  const triplePatterns = [
    /^(triple|tripel|dreifach|dreimal|t)\s*(.+)$/,
    /^(.+)\s*(triple|tripel|dreifach)$/,  // "20 triple"
  ]
  for (const pattern of triplePatterns) {
    const match = lower.match(pattern) || normalized.match(pattern)
    if (match) {
      const numPart = match[1].match(/triple|tripel|dreifach|dreimal|t/i) ? match[2] : match[1]
      const num = textToNumber(numPart)
      if (num !== null && num >= 1 && num <= 20) {
        return { bed: num, mult: 3 }
      }
    }
  }

  // Double + Zahl (verschiedene Schreibweisen)
  const doublePatterns = [
    /^(double|doppel|doppelt|zweifach|d)\s*(.+)$/,
    /^(.+)\s*(double|doppel|doppelt)$/,  // "20 double"
  ]
  for (const pattern of doublePatterns) {
    const match = lower.match(pattern) || normalized.match(pattern)
    if (match) {
      const numPart = match[1].match(/double|doppel|doppelt|zweifach|d/i) ? match[2] : match[1]
      const num = textToNumber(numPart)
      if (num !== null && num >= 1 && num <= 20) {
        return { bed: num, mult: 2 }
      }
    }
  }

  // Single + Zahl (explizit)
  const singleMatch = lower.match(/^(single|einfach|s)\s*(.+)$/) || normalized.match(/^(single|einfach|s)\s*(.+)$/)
  if (singleMatch) {
    const num = textToNumber(singleMatch[2])
    if (num !== null && num >= 1 && num <= 20) {
      return { bed: num, mult: 1 }
    }
  }

  // Nur Zahl (Single implizit)
  const num = textToNumber(lower) ?? textToNumber(normalized)
  if (num !== null && num >= 1 && num <= 20) {
    return { bed: num, mult: 1 }
  }

  return null
}

/**
 * Startet die Spracheingabe
 * @param onResult Callback mit erkannten Darts
 * @param expectedCount Anzahl erwarteter Darts (1 oder 3)
 * @param onStateChange Optional: Callback für Status-Updates
 * @returns Stop-Funktion
 */
export function startListening(
  onResult: (darts: DartResult[]) => void,
  expectedCount: 1 | 3,
  onStateChange?: (state: 'listening' | 'processing' | 'idle') => void,
  onPartialResult?: (darts: DartResult[]) => void  // Callback für Zwischenergebnisse
): () => void {
  if (!isSpeechInputSupported()) {
    console.warn('Speech recognition not supported')
    onStateChange?.('idle')
    return () => {}
  }

  const recognition = new SpeechRecognition()
  recognition.lang = 'de-DE'
  recognition.continuous = true  // Immer continuous für bessere Erkennung
  recognition.interimResults = false  // Nur finale Ergebnisse
  recognition.maxAlternatives = 5

  const collectedDarts: DartResult[] = []
  let stopped = false
  let timeoutId: number | null = null

  const cleanup = () => {
    stopped = true
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    try {
      recognition.stop()
    } catch (e) {
      // Ignorieren wenn bereits gestoppt
    }
  }

  const finish = (darts: DartResult[]) => {
    if (stopped) return  // Doppel-Aufruf verhindern
    cleanup()
    onStateChange?.('idle')
    onResult(darts)
  }

  // Timeout: Nach 8 Sekunden für 1 Dart, 20 Sekunden für 3 Darts
  const timeoutMs = expectedCount === 1 ? 8000 : 20000
  timeoutId = window.setTimeout(() => {
    if (!stopped) {
      console.debug('Speech recognition timeout, collected:', collectedDarts.length)
      finish(collectedDarts)
    }
  }, timeoutMs)

  recognition.onstart = () => {
    console.debug('Speech recognition started, expecting', expectedCount, 'dart(s)')
    onStateChange?.('listening')
  }

  recognition.onresult = (event: any) => {
    if (stopped) return

    // Alle neuen Results verarbeiten
    for (let idx = event.resultIndex; idx < event.results.length; idx++) {
      const result = event.results[idx]
      if (!result.isFinal) continue

      // Mehrere Alternativen durchprobieren
      for (let altIdx = 0; altIdx < result.length; altIdx++) {
        const transcript = result[altIdx].transcript.trim()
        console.debug(`Speech recognized (alt ${altIdx}):`, transcript)

        if (!transcript) continue

        // Versuche, mehrere Darts aus einem Satz zu parsen
        // z.B. "Triple 20 Triple 20 Triple 20" oder "20 20 20"
        const parts = transcript.split(/[,;.\s]+/).filter((p: string) => p.length > 0)

        // Kombinationen versuchen (für "Double 20" als zwei Wörter)
        const dartCandidates: string[] = []
        let partIdx = 0
        while (partIdx < parts.length) {
          // Versuche erst 2-Wort-Kombination
          if (partIdx + 1 < parts.length) {
            const twoWord = parts[partIdx] + ' ' + parts[partIdx + 1]
            const twoWordDart = parseDartFromSpeech(twoWord)
            if (twoWordDart) {
              dartCandidates.push(twoWord)
              partIdx += 2
              continue
            }
          }
          // Einzelnes Wort
          dartCandidates.push(parts[partIdx])
          partIdx++
        }

        // Kandidaten parsen
        let foundInThisAlt = false
        for (const candidate of dartCandidates) {
          const dart = parseDartFromSpeech(candidate)
          if (dart && collectedDarts.length < expectedCount) {
            collectedDarts.push(dart)
            foundInThisAlt = true
            console.debug(`Dart parsed:`, dart, `(${collectedDarts.length}/${expectedCount})`)

            // Partial Result Callback aufrufen
            onPartialResult?.([...collectedDarts])

            // Fertig wenn genug Darts
            if (collectedDarts.length >= expectedCount) {
              finish(collectedDarts)
              return
            }
          }
        }

        // Wenn wir in dieser Alternative mindestens einen Dart gefunden haben,
        // nicht weitere Alternativen prüfen
        if (foundInThisAlt) {
          break
        }
      }
    }

    // Bei Single-Dart-Modus: Wenn wir einen Dart haben, fertig
    if (expectedCount === 1 && collectedDarts.length >= 1) {
      finish(collectedDarts)
      return
    }

    onStateChange?.('listening')
  }

  recognition.onerror = (event: any) => {
    console.warn('Speech recognition error:', event.error)
    // Nicht bei jedem Fehler beenden - nur bei kritischen
    if (!stopped && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) {
      finish(collectedDarts)
    }
  }

  recognition.onend = () => {
    console.debug('Speech recognition ended, collected:', collectedDarts.length)
    if (!stopped) {
      // Wenn noch nicht genug Darts: Neustart
      if (collectedDarts.length < expectedCount) {
        try {
          recognition.start()
          onStateChange?.('listening')
        } catch (e) {
          console.debug('Could not restart recognition:', e)
          finish(collectedDarts)
        }
      } else {
        finish(collectedDarts)
      }
    }
  }

  try {
    recognition.start()
  } catch (e) {
    console.error('Failed to start speech recognition:', e)
    onStateChange?.('idle')
  }

  return cleanup
}
