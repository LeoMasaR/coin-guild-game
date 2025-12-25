import type { TileEffect } from "./tileEffects.js";
import { TILE_EFFECT_MAP } from "./tileEffectMap.js";
import type { GameRef } from "./typesRuntime.js";
import type { TileId } from "../model/types.js";

const EFFECTS: Record<string, TileEffect> = {
  TAX_1_COPPER: {
    id: "TAX_1_COPPER",
    trigger: "LAND",
    apply: ({ state, activePlayerIndex, emit }) => {
      const p = state.players[activePlayerIndex]!;
      p.currency.copper_coin = Math.max(0, p.currency.copper_coin - 1);
      emit("TILE_TAX", { playerId: p.player_id, deltaCopper: -1 });
    },
  },

  MINT_GAIN_SILVER_1: {
    id: "MINT_GAIN_SILVER_1",
    trigger: "LAND",
    apply: ({ state, activePlayerIndex, emit }) => {
      const p = state.players[activePlayerIndex]!;
      p.currency.silver_coin += 1;
      emit("TILE_MINT", { playerId: p.player_id, deltaSilver: +1 });
    },
  },

  EVENT_GAIN_RANDOM_SMALL: {
    id: "EVENT_GAIN_RANDOM_SMALL",
    trigger: "LAND",
    apply: ({ state, activePlayerIndex, rng, emit }) => {
      const p = state.players[activePlayerIndex]!;
      const roll = rng.nextInt(0, 2);
      if (roll === 0) {
        p.currency.copper_coin += 2;
        emit("TILE_EVENT_GAIN", { playerId: p.player_id, gain: { copper_coin: 2 } });
      } else {
        p.currency.silver_coin += 1;
        emit("TILE_EVENT_GAIN", { playerId: p.player_id, gain: { silver_coin: 1 } });
      }
    },
  },
};

export function applyTileEffectOnLand(tileId: TileId, ref: GameRef): void {
  const effectId = TILE_EFFECT_MAP[tileId];
  if (!effectId) return;
  const effect = EFFECTS[effectId];
  if (!effect) throw new Error(`Effect not registered: ${effectId}`);
  if (effect.trigger !== "LAND") return;
  effect.apply(ref);
}
