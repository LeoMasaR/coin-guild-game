// src/engine/model/state.ts

import type {
  AreaId,
  TileId,
  CurrencyStock,
  RawStock,
  ProductStock,
  GoldCoin,
  Era
} from "./types.js";

export interface PlayerLocation {
  areaId: AreaId;
  row: number;
  col: number;
  tileId: TileId;
}

/** プレイヤー状態：あなたの確定版をフル反映 */
export interface PlayerState {
  player_id: string;

  currency: CurrencyStock;
  raw: RawStock;
  product: ProductStock;

  title_rank: number;

  gold_coins: GoldCoin[];

  // ゲーム盤上の位置（エンジン運用上 必須）
  location: PlayerLocation;
}

/** 2D6移動の途中状態（分岐選択のため） */
export interface PendingMove {
  player_id: string;
  remaining: number;        // 残り歩数
  awaitingChoice: boolean;  // 分岐待ち
}

/**
 * ゲーム全体状態：
 * - あなたの確定版（era/cycle/inflation）を中核に
 * - 実行に必要な turn/active/pendingMove を併載
 */
export interface GameState {
  // あなたの確定版
  current_era: Era;         // Victorian | Modern
  cycle_index: number;      // 1..3
  inflation_stage: number;  // Modern中のみ進行

  // エンジン運用
  seed: number;
  turn: number;
  activePlayerIndex: number;
  players: PlayerState[];

  pendingMove?: PendingMove;
}

