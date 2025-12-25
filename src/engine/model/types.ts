export type AreaId = string;

export type TileId =
  | "TEX" | "COAL" | "WOOL" | "ARM" | "NEU" | "ORE"
  | "MKT" | "COP" | "BR" | "EX" | "ST"
  | "TAX" | "TTL" | "EVT" | "PAR" | "HQ" | "MINT"
  | "DNG" | "PORT-A" | "PORT-M";

export type Coin = "GOLD" | "SILVER" | "COPPER" | "PAPER";

export type Coord = readonly [number, number];

export interface Edge {
  from: Coord;
  to: Coord;
}

export type Action =
  | { type: "END_TURN" }
  | { type: "ROLL_MOVE" }                        // 2D6 を振って移動開始
  | { type: "CHOOSE_EDGE"; to: Coord };          // 分岐選択（残り歩数を消化し続行）

export interface AreaData {
  id: AreaId;
  name: string;
  grid: TileId[][];
  edges: Edge[];
}

export interface GameData {
  areas: Record<AreaId, AreaData>;
}

export interface DomainEvent {
  type: string;
  atTurn: number;
  payload?: Record<string, unknown>;
}

