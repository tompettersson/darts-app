// src/checkoutTable.ts
// Standard-Checkout-Tabelle für Double-Out
// Format: Rest -> { route: Checkout-Weg, darts: Anzahl benötigter Darts }

type CheckoutEntry = { route: string; darts: 1 | 2 | 3 }

export const CHECKOUT_TABLE: Record<number, CheckoutEntry> = {
  // 1-Dart Finishes (Doppel direkt)
  2: { route: 'D1', darts: 1 },
  4: { route: 'D2', darts: 1 },
  6: { route: 'D3', darts: 1 },
  8: { route: 'D4', darts: 1 },
  10: { route: 'D5', darts: 1 },
  12: { route: 'D6', darts: 1 },
  14: { route: 'D7', darts: 1 },
  16: { route: 'D8', darts: 1 },
  18: { route: 'D9', darts: 1 },
  20: { route: 'D10', darts: 1 },
  22: { route: 'D11', darts: 1 },
  24: { route: 'D12', darts: 1 },
  26: { route: 'D13', darts: 1 },
  28: { route: 'D14', darts: 1 },
  30: { route: 'D15', darts: 1 },
  32: { route: 'D16', darts: 1 },
  34: { route: 'D17', darts: 1 },
  36: { route: 'D18', darts: 1 },
  38: { route: 'D19', darts: 1 },
  40: { route: 'D20', darts: 1 },
  50: { route: 'BULL', darts: 1 },

  // 2-Dart Finishes
  3: { route: 'S1 D1', darts: 2 },
  5: { route: 'S1 D2', darts: 2 },
  7: { route: 'S3 D2', darts: 2 },
  9: { route: 'S1 D4', darts: 2 },
  11: { route: 'S3 D4', darts: 2 },
  13: { route: 'S5 D4', darts: 2 },
  15: { route: 'S7 D4', darts: 2 },
  17: { route: 'S9 D4', darts: 2 },
  19: { route: 'S3 D8', darts: 2 },
  21: { route: 'S5 D8', darts: 2 },
  23: { route: 'S7 D8', darts: 2 },
  25: { route: 'S9 D8', darts: 2 },
  27: { route: 'S11 D8', darts: 2 },
  29: { route: 'S13 D8', darts: 2 },
  31: { route: 'S15 D8', darts: 2 },
  33: { route: 'S17 D8', darts: 2 },
  35: { route: 'S3 D16', darts: 2 },
  37: { route: 'S5 D16', darts: 2 },
  39: { route: 'S7 D16', darts: 2 },
  41: { route: 'S9 D16', darts: 2 },
  42: { route: 'S10 D16', darts: 2 },
  43: { route: 'S11 D16', darts: 2 },
  44: { route: 'S12 D16', darts: 2 },
  45: { route: 'S13 D16', darts: 2 },
  46: { route: 'S14 D16', darts: 2 },
  47: { route: 'S15 D16', darts: 2 },
  48: { route: 'S16 D16', darts: 2 },
  49: { route: 'S17 D16', darts: 2 },
  51: { route: 'S11 D20', darts: 2 },
  52: { route: 'S12 D20', darts: 2 },
  53: { route: 'S13 D20', darts: 2 },
  54: { route: 'S14 D20', darts: 2 },
  55: { route: 'S15 D20', darts: 2 },
  56: { route: 'S16 D20', darts: 2 },
  57: { route: 'S17 D20', darts: 2 },
  58: { route: 'S18 D20', darts: 2 },
  59: { route: 'S19 D20', darts: 2 },
  60: { route: 'S20 D20', darts: 2 },
  61: { route: 'T15 D8', darts: 2 },
  62: { route: 'T10 D16', darts: 2 },
  63: { route: 'T13 D12', darts: 2 },
  64: { route: 'T16 D8', darts: 2 },
  65: { route: 'T19 D4', darts: 2 },
  66: { route: 'T10 D18', darts: 2 },
  67: { route: 'T17 D8', darts: 2 },
  68: { route: 'T20 D4', darts: 2 },
  69: { route: 'T19 D6', darts: 2 },
  70: { route: 'T18 D8', darts: 2 },
  71: { route: 'T13 D16', darts: 2 },
  72: { route: 'T16 D12', darts: 2 },
  73: { route: 'T19 D8', darts: 2 },
  74: { route: 'T14 D16', darts: 2 },
  75: { route: 'T17 D12', darts: 2 },
  76: { route: 'T20 D8', darts: 2 },
  77: { route: 'T19 D10', darts: 2 },
  78: { route: 'T18 D12', darts: 2 },
  79: { route: 'T19 D11', darts: 2 },
  80: { route: 'T20 D10', darts: 2 },
  81: { route: 'T19 D12', darts: 2 },
  82: { route: 'T14 D20', darts: 2 },
  83: { route: 'T17 D16', darts: 2 },
  84: { route: 'T20 D12', darts: 2 },
  85: { route: 'T15 D20', darts: 2 },
  86: { route: 'T18 D16', darts: 2 },
  87: { route: 'T17 D18', darts: 2 },
  88: { route: 'T20 D14', darts: 2 },
  89: { route: 'T19 D16', darts: 2 },
  90: { route: 'T18 D18', darts: 2 },
  91: { route: 'T17 D20', darts: 2 },
  92: { route: 'T20 D16', darts: 2 },
  93: { route: 'T19 D18', darts: 2 },
  94: { route: 'T18 D20', darts: 2 },
  95: { route: 'T19 D19', darts: 2 },
  96: { route: 'T20 D18', darts: 2 },
  97: { route: 'T19 D20', darts: 2 },
  98: { route: 'T20 D19', darts: 2 },
  100: { route: 'T20 D20', darts: 2 },
  104: { route: 'T18 BULL', darts: 2 },
  107: { route: 'T19 BULL', darts: 2 },
  110: { route: 'T20 BULL', darts: 2 },

  // 3-Dart Checkouts
  99: { route: 'T19 S10 D16', darts: 3 },
  101: { route: 'T17 S10 D20', darts: 3 },
  102: { route: 'T20 S10 D16', darts: 3 },
  103: { route: 'T19 S10 D18', darts: 3 },
  105: { route: 'T20 S13 D16', darts: 3 },
  106: { route: 'T20 S10 D18', darts: 3 },
  108: { route: 'T20 S16 D16', darts: 3 },
  109: { route: 'T20 S17 D16', darts: 3 },
  111: { route: 'T19 S14 D20', darts: 3 },
  112: { route: 'T20 S20 D16', darts: 3 },
  113: { route: 'T19 S16 D20', darts: 3 },
  114: { route: 'T20 S14 D20', darts: 3 },
  115: { route: 'T19 S18 D20', darts: 3 },
  116: { route: 'T20 S16 D20', darts: 3 },
  117: { route: 'T20 S17 D20', darts: 3 },
  118: { route: 'T20 S18 D20', darts: 3 },
  119: { route: 'T19 T10 D16', darts: 3 },
  120: { route: 'T20 S20 D20', darts: 3 },
  121: { route: 'T20 T11 D14', darts: 3 },
  122: { route: 'T18 T18 D7', darts: 3 },
  123: { route: 'T19 T16 D9', darts: 3 },
  124: { route: 'T20 T14 D11', darts: 3 },
  125: { route: 'T20 T19 D4', darts: 3 },
  126: { route: 'T19 T19 D6', darts: 3 },
  127: { route: 'T20 T17 D8', darts: 3 },
  128: { route: 'T18 T14 D16', darts: 3 },
  129: { route: 'T19 T16 D12', darts: 3 },
  130: { route: 'T20 T18 D8', darts: 3 },
  131: { route: 'T20 T13 D16', darts: 3 },
  132: { route: 'T20 T16 D12', darts: 3 },
  133: { route: 'T20 T19 D8', darts: 3 },
  134: { route: 'T20 T14 D16', darts: 3 },
  135: { route: 'T20 T17 D12', darts: 3 },
  136: { route: 'T20 T20 D8', darts: 3 },
  137: { route: 'T20 T19 D10', darts: 3 },
  138: { route: 'T20 T18 D12', darts: 3 },
  139: { route: 'T19 T14 D20', darts: 3 },
  140: { route: 'T20 T20 D10', darts: 3 },
  141: { route: 'T20 T19 D12', darts: 3 },
  142: { route: 'T20 T14 D20', darts: 3 },
  143: { route: 'T20 T17 D16', darts: 3 },
  144: { route: 'T20 T20 D12', darts: 3 },
  145: { route: 'T20 T15 D20', darts: 3 },
  146: { route: 'T20 T18 D16', darts: 3 },
  147: { route: 'T20 T17 D18', darts: 3 },
  148: { route: 'T20 T20 D14', darts: 3 },
  149: { route: 'T20 T19 D16', darts: 3 },
  150: { route: 'T20 T18 D18', darts: 3 },
  151: { route: 'T20 T17 D20', darts: 3 },
  152: { route: 'T20 T20 D16', darts: 3 },
  153: { route: 'T20 T19 D18', darts: 3 },
  154: { route: 'T20 T18 D20', darts: 3 },
  155: { route: 'T20 T19 D19', darts: 3 },
  156: { route: 'T20 T20 D18', darts: 3 },
  157: { route: 'T20 T19 D20', darts: 3 },
  158: { route: 'T20 T20 D19', darts: 3 },
  160: { route: 'T20 T20 D20', darts: 3 },
  161: { route: 'T20 T17 BULL', darts: 3 },
  164: { route: 'T20 T18 BULL', darts: 3 },
  167: { route: 'T20 T19 BULL', darts: 3 },
  170: { route: 'T20 T20 BULL', darts: 3 },
}

/**
 * Gibt den Standard-Checkout-Weg für einen Rest zurück,
 * wenn er mit den verfügbaren Darts machbar ist.
 * @param remaining Der aktuelle Restpunktestand
 * @param dartsRemaining Wie viele Darts noch übrig sind (1, 2 oder 3)
 * @returns Der Checkout-Weg als String oder null wenn kein Checkout möglich
 */
export function getCheckoutRoute(remaining: number, dartsRemaining: number = 3): string | null {
  const entry = CHECKOUT_TABLE[remaining]
  if (!entry) return null
  // Nur anzeigen wenn genug Darts übrig sind
  if (entry.darts > dartsRemaining) return null
  return entry.route
}

/**
 * Prüft ob ein Rest ein möglicher Checkout ist (2-170, keine Bogey-Zahlen)
 */
export function isCheckout(remaining: number): boolean {
  return remaining >= 2 && remaining <= 170 && CHECKOUT_TABLE[remaining] !== undefined
}

// ============================================================================
// SETUP-SHOTS: Empfohlene Würfe für Reste über 170 (kein Checkout möglich)
// ============================================================================

/**
 * Setup-Shots für hohe Reste, um auf ein gutes Finish zu kommen.
 * Zeigt den optimalen Weg, um sich auf einen Checkout-Bereich zu stellen.
 */
export const SETUP_SHOTS: Record<number, string> = {
  // 171-180: Hohe Reste - auf gutes Finish stellen
  180: 'T20 T20',      // → 60 (S20 D20)
  179: 'T20 T19',      // → 62 (T10 D16)
  178: 'T20 T20',      // → 58 (S18 D20)
  177: 'T20 T19',      // → 60 (S20 D20)
  176: 'T20 T20',      // → 56 (S16 D20)
  175: 'T20 T19',      // → 58 (S18 D20)
  174: 'T20 T20',      // → 54 (S14 D20)
  173: 'T20 T19',      // → 56 (S16 D20)
  172: 'T20 T20',      // → 52 (S12 D20)
  171: 'T20 T19',      // → 54 (S14 D20)

  // 181-200: Sehr hohe Reste
  200: 'T20 T20 T20',  // → 20 (D10)
  199: 'T20 T20 T19',  // → 22 (D11)
  198: 'T20 T20 T20',  // → 18 (D9)
  197: 'T20 T20 T19',  // → 20 (D10)
  196: 'T20 T20 T20',  // → 16 (D8)
  195: 'T20 T20 T19',  // → 18 (D9)
  194: 'T20 T20 T20',  // → 14 (D7)
  193: 'T20 T20 T19',  // → 16 (D8)
  192: 'T20 T20 T20',  // → 12 (D6)
  191: 'T20 T20 T19',  // → 14 (D7)
  190: 'T20 T20 T20',  // → 10 (D5)
  189: 'T20 T20 T19',  // → 12 (D6)
  188: 'T20 T20 T20',  // → 8 (D4)
  187: 'T20 T20 T19',  // → 10 (D5)
  186: 'T20 T20 T20',  // → 6 (D3)
  185: 'T20 T20 T19',  // → 8 (D4)
  184: 'T20 T20 T20',  // → 4 (D2)
  183: 'T20 T20 T19',  // → 6 (D3)
  182: 'T20 T20 T20',  // → 2 (D1)
  181: 'T20 T20 T19',  // → 4 (D2)

  // 201-260: Mittlere Reste (3 Darts Setup)
  260: 'T20 T20 T20',  // → 80 (T20 D10)
  250: 'T20 T20 T20',  // → 70 (T18 D8)
  240: 'T20 T20 T20',  // → 60 (S20 D20)
  230: 'T20 T20 T20',  // → 50 (BULL)
  220: 'T20 T20 T20',  // → 40 (D20)
  210: 'T20 T20 T20',  // → 30 (D15)

  // 261-300: Hohe Reste
  300: 'T20 T20 T20',  // → 120 (T20 S20 D20)
  280: 'T20 T20 T20',  // → 100 (T20 D20)
  270: 'T20 T20 T20',  // → 90 (T18 D18)

  // Bogey-Zahlen (159, 162, 163, 165, 166, 168, 169) - kein 3-Dart Checkout
  169: 'T20 T19',      // → 52 (S12 D20)
  168: 'T20 T20',      // → 48 (S16 D16)
  166: 'T20 T20',      // → 46 (S14 D16)
  165: 'T20 T19',      // → 48 (S16 D16)
  163: 'T20 T19',      // → 46 (S14 D16)
  162: 'T20 T20',      // → 42 (S10 D16)
  159: 'T20 T19',      // → 42 (S10 D16)
}

/**
 * Gibt einen Setup-Wurf zurück, um sich auf ein Double zu stellen.
 * Wird NUR angezeigt wenn:
 * - Genau 1 Dart übrig ist
 * - Im Checkout-Bereich (≤170 mit gültigem Checkout)
 * - Aber der Checkout mehr als 1 Dart braucht
 *
 * @param remaining Der aktuelle Restpunktestand
 * @param dartsRemaining Wie viele Darts noch übrig sind (default: 3)
 * @returns Setup-Wurf als String oder null
 */
export function getSetupShot(remaining: number, dartsRemaining: number = 3): string | null {
  // Nur beim letzten Dart anzeigen
  if (dartsRemaining !== 1) return null

  // Nur im Checkout-Bereich relevant
  const entry = CHECKOUT_TABLE[remaining]
  if (!entry) return null

  // Wenn 1-Dart Checkout möglich → kein Setup nötig (zeige Checkout stattdessen)
  if (entry.darts === 1) return null

  // Checkout braucht mehr als 1 Dart: Zeige den ersten Dart als Setup
  const parts = entry.route.split(' ')
  return parts[0] ?? null
}
