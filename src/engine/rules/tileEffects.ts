import type { GameDataRef } from "./typesRuntime.js";

/**
 * TileEffect は「止まった/通過した等のタイミングで状態を変える」処理単位。
 * 今は "LAND"（停止）だけで十分。将来 "PASS" など増やせる。
 */
export type TileTrigger = "LAND";

export interface TileEffect {
  id: string;
  trigger: TileTrigger;
  apply(ref: GameRef): void;
}

export interface GameRef {
  data: GameRefData;
  state: GameRefState;
  activePlayerIndex: number;
  rng: GameRefRng;
  emit: (type: string, payload?: Record<string, unknown>) => void;
}

// 依存の型は循環しやすいので runtime types を別に集約（次ファイル）
export type GameRefData = unknown;
export type GameRefState = unknown;
export type GameRefRng = { nextInt(minInclusive: number, maxExclusive: number): number };
