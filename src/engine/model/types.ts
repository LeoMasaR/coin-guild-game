// src/engine/model/types.ts

export type Era = "Victorian" | "Modern";
export type Grade = "A" | "B" | "FAKE";
export type MintID = string;

export type AreaId = string;
export type TileId =
  // UK etc...
  | "TEX" | "COAL" | "WOOL" | "ARM" | "NEU" | "ORE"
  | "MKT" | "COP" | "BR" | "EX" | "ST"
  | "TAX" | "TTL" | "EVT" | "PAR" | "HQ" | "MINT"
  | "DNG" | "PORT-A" | "PORT-M"

  // South Africa
  | "GOLD" | "DIAM" | "MINT-SA" | "PORT-SA" | "TAR";


export type Coord = readonly [number, number];

export interface Edge {
  from: Coord;
  to: Coord;
}

export interface AreaData {
  id: AreaId;
  name: string;
  grid: TileId[][];
  edges: Edge[];
}

export interface GameData {
  areas: Record<AreaId, AreaData>;
}

/** 通貨は銅・銀（枚数管理） */
export interface CurrencyStock {
  copper_coin: number;
  silver_coin: number;
}

/** 地金＋原材料（枚数管理） */
export interface RawStock {
  gold_bullion: number;
  wool: number;
  cotton: number;
  silk: number;
  tea_leaf: number;
  coal: number;
  metal_ore: number;
}

/** 製品（枚数管理） */
export interface ProductStock {
  wool_textile: number;
  cotton_textile: number;
  silk_goods: number;
  tea: number;
  arms: number;
  machinery: number;
}

/** 金貨：非可換資産（個体管理、gradeは所有者のみ閲覧） */
export interface GoldCoin {
  coin_id: string;
  mint: MintID;
  grade: Grade; // OWNER_ONLY: 表示層でマスク可能な設計にする
}

/** 価格体系（銅貨単位） */
export interface AssetValueCopperUnit {
  copper_coin: 1;
  silver_coin: number;         // e.g. 3
  gold_coin_nominal: number;   // e.g. 30（必要なら）
  gold_bullion: number;        // e.g. 36
}

/** アクション：いまは移動・分岐・ターン */
export type Action =
  | { type: "END_TURN" }
  | { type: "ROLL_MOVE" }                 // 2D6 を振って移動開始
  | { type: "CHOOSE_EDGE"; to: Coord }    // 分岐選択
  | { type: "NOOP" };

export interface DomainEvent {
  type: string;
  atTurn: number;
  payload?: Record<string, unknown>;
}
