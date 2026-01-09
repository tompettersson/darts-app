// src/types/cricket.ts

export type CricketRange = 'short' | 'long';
export type CricketStyle = 'standard' | 'cutthroat';
export type CricketTarget =
  10|11|12|13|14|15|16|17|18|19|20|'BULL';

export type CricketSetup = {
  gameType: 'cricket';
  range: CricketRange;            // 'short' (15–20) | 'long' (10–20)
  style: CricketStyle;            // 'standard' | 'cutthroat'
  targets: CricketTarget[];
};
