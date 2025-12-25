import type { GameRef } from "./typesRuntime.js";
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
