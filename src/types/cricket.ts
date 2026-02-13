// src/types/cricket.ts

export type CricketRange = 'short' | 'long';
export type CricketStyle = 'standard' | 'cutthroat' | 'simple' | 'crazy';
export type CutthroatEndgame = 'standard' | 'suddenDeath';
export type CrazyMode = 'normal' | 'pro';
export type CricketTarget =
  10|11|12|13|14|15|16|17|18|19|20|'BULL';

export type CrazyScoringMode = 'standard' | 'cutthroat' | 'simple';

export type CricketSetup = {
  gameType: 'cricket';
  range: CricketRange;            // 'short' (15–20) | 'long' (10–20)
  style: CricketStyle;            // 'standard' | 'cutthroat' | 'simple' | 'crazy'
  targets: CricketTarget[];
  cutthroatEndgame?: CutthroatEndgame;  // nur bei style='cutthroat' oder crazyScoringMode='cutthroat'
  crazyMode?: CrazyMode;          // nur bei style='crazy': 'normal' | 'pro'
  crazyWithPoints?: boolean;      // nur bei style='crazy': Punkte sammeln wie Standard (legacy, bevorzugt crazyScoringMode)
  crazySameForAll?: boolean;      // nur bei style='crazy': Alle Spieler haben dieselbe Zielzahl pro Runde
  crazyScoringMode?: CrazyScoringMode;  // nur bei style='crazy': Punkteverteilung ('standard' | 'cutthroat' | 'simple')
};
