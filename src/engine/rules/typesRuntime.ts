import type { GameData } from "../model/types.js";
import type { GameState } from "../model/state.js";
import type { RNG } from "../rng/rng.js";

export interface GameRefTyped {
  data: GameData;
  state: GameState;
  activePlayerIndex: number;
  rng: RNG;
  emit: (type: string, payload?: Record<string, unknown>) => void;
}

export type GameRef = GameRefTyped;
export type { GameData, GameState, RNG };
