import type { TileId } from "../model/types.js";

/**
 * TileId -> EffectId
 * ここでタイル効果を宣言的に差し替え可能にする。
 * 後で data 側に effectId を持たせる方式に移行してもOK。
 */
export const TILE_EFFECT_MAP: Partial<Record<TileId, string>> = {
  TAX: "TAX_1_COPPER",
  MINT: "MINT_GAIN_SILVER_1",
  EVT: "EVENT_GAIN_RANDOM_SMALL",

  // 例：南アフリカを後で足すならこう
  // GOLD: "GAIN_GOLD_BULLION_1",
  // DIAM: "GAIN_SILVER_2",
};
