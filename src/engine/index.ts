import type {
  Action,
  DomainEvent,
  GameData,
  TileId,
  Coord,
  Edge,
} from "./model/types.js";
import type { GameState, PlayerState, PendingMove } from "./model/state.js";
import { SeededRNG, type RNG } from "./rng/rng.js";

export interface EngineResult {
  state: GameState;
  events: DomainEvent[];
}

export interface GameSetup {
  seed: number;
  playerNames: string[];
  startAreaId: string;
  startRow: number;
  startCol: number;
}

export function createGame(data: GameData, setup: GameSetup): GameState {
  const area = data.areas[setup.startAreaId];
  if (!area) throw new Error(`Unknown startAreaId: ${setup.startAreaId}`);

  const tileId = area.grid[setup.startRow]?.[setup.startCol];
  if (!tileId) throw new Error(`Invalid start position for area: ${setup.startAreaId}`);

  const players: PlayerState[] = setup.playerNames.map((name, idx) => ({
    player_id: `P${idx + 1}`,

    // 可換資産（枚数管理）
    currency: { copper_coin: 0, silver_coin: 0 },

    // 可換資産（枚数管理）
    raw: {
      gold_bullion: 0,
      wool: 0,
      cotton: 0,
      silk: 0,
      tea_leaf: 0,
      coal: 0,
      metal_ore: 0,
    },

    // 可換資産（枚数管理）
    product: {
      wool_textile: 0,
      cotton_textile: 0,
      silk_goods: 0,
      tea: 0,
      arms: 0,
      machinery: 0,
    },

    // 称号（ランクのみ）
    title_rank: 0,

    // 金貨（個体管理、ただし可換資産として支払い・取引に使える設計）
    gold_coins: [],

    // 盤面位置
    location: {
      areaId: setup.startAreaId,
      row: setup.startRow,
      col: setup.startCol,
      tileId,
    },
  }));

  return {
    // あなたの確定版（経済・最終評価で使用）
    current_era: "Victorian",
    cycle_index: 1,
    inflation_stage: 0,

    // エンジン運用
    seed: setup.seed,
    turn: 1,
    activePlayerIndex: 0,
    players,
  };
}

export function listLegalActions(data: GameData, state: GameState): Action[] {
  const active = state.players[state.activePlayerIndex];
  if (!active) throw new Error("No active player.");

  // 分岐待ちなら CHOOSE_EDGE のみ
  if (state.pendingMove?.awaitingChoice && state.pendingMove.player_id === active.player_id) {
    const outs = getOutgoingEdges(
      data,
      active.location.areaId,
      [active.location.row, active.location.col]
    );
    return outs.map((e) => ({ type: "CHOOSE_EDGE", to: e.to }));
  }

  // 通常：移動開始 or ターン終了
  return [{ type: "ROLL_MOVE" }, { type: "END_TURN" }];
}

export function step(data: GameData, state: GameState, action: Action, rng?: RNG): EngineResult {
  // 再現性のため：rng未指定なら seed + turn + active を元に生成
  const _rng = rng ?? new SeededRNG(state.seed + state.turn * 100 + state.activePlayerIndex);
  const events: DomainEvent[] = [];
  const next = structuredClone(state) as GameState;

  const active = next.players[next.activePlayerIndex];
  if (!active) throw new Error("No active player.");

  // pendingMove が別プレイヤーのものなら不正
  if (next.pendingMove && next.pendingMove.player_id !== active.player_id) {
    throw new Error("pendingMove belongs to a non-active player.");
  }

  switch (action.type) {
    case "ROLL_MOVE": {
      if (next.pendingMove) throw new Error("Cannot roll while a move is pending.");

      const d1 = _rng.nextInt(1, 7);
      const d2 = _rng.nextInt(1, 7);
      const steps = d1 + d2;

      events.push({
        type: "DICE_ROLLED",
        atTurn: next.turn,
        payload: { playerId: active.player_id, d1, d2, steps },
      });

      next.pendingMove = {
        player_id: active.player_id,
        remaining: steps,
        awaitingChoice: false,
      };

      // 可能な限り自動で進める（分岐で停止）
      autoAdvance(data, next, active, events, _rng);
      break;
    }

    case "CHOOSE_EDGE": {
      const pm = next.pendingMove;
      if (!pm || !pm.awaitingChoice) throw new Error("No choice is awaited.");
      if (pm.player_id !== active.player_id) throw new Error("Choice action by non-owner.");

      // 選択が妥当か確認
      const outs = getOutgoingEdges(
        data,
        active.location.areaId,
        [active.location.row, active.location.col]
      );
      const ok = outs.some((e) => coordEq(e.to, action.to));
      if (!ok) throw new Error("Illegal edge choice.");

      // 1歩進める（選択で確定するのは次のマス）
      moveTo(data, active, action.to, events, next.turn);
      pm.remaining -= 1;
      pm.awaitingChoice = false;

      // 続きを自動で進める
      autoAdvance(data, next, active, events, _rng);
      break;
    }

    case "END_TURN": {
      if (next.pendingMove) throw new Error("Cannot end turn while a move is pending.");

      const prevIdx = next.activePlayerIndex;

      next.activePlayerIndex = (next.activePlayerIndex + 1) % next.players.length;
      if (next.activePlayerIndex === 0) {
        next.turn += 1;

        // ここで era / cycle / inflation を進める拡張ポイント
        // 例：Modern中のみ inflation_stage++ など
        // 今は「データ未確定」なので固定。後で reducers に切り出すのが推奨。
      }

      events.push({
        type: "TURN_ENDED",
        atTurn: state.turn,
        payload: { playerId: state.players[prevIdx]?.player_id },
      });

      break;
    }

    case "NOOP": {
      events.push({ type: "NOOP", atTurn: next.turn, payload: { playerId: active.player_id } });
      break;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return { state: next, events };
}

/** 分岐が出るまで・歩数が尽きるまで自動で進める */
function autoAdvance(
  data: GameData,
  state: GameState,
  player: PlayerState,
  events: DomainEvent[],
  rng: RNG
): void {
  const pm = state.pendingMove;
  if (!pm) return;

  while (pm.remaining > 0) {
    const outs = getOutgoingEdges(
      data,
      player.location.areaId,
      [player.location.row, player.location.col]
    );

    if (outs.length === 0) {
      // 行き止まり：移動終了（設計上は無い想定だが安全策）
      events.push({
        type: "MOVE_BLOCKED",
        atTurn: state.turn,
        payload: { playerId: player.player_id },
      });
      state.pendingMove = undefined;
      resolveTileEffect(data, state, player, events, rng);
      return;
    }

    if (outs.length >= 2) {
      // 分岐：選択待ち
      pm.awaitingChoice = true;
      return;
    }

    // 一本道：自動で1歩
    moveTo(data, player, outs[0]!.to, events, state.turn);
    pm.remaining -= 1;
  }

  // 歩数を使い切った：移動終了
  state.pendingMove = undefined;
  resolveTileEffect(data, state, player, events, rng);
}

function moveTo(
  data: GameData,
  player: PlayerState,
  to: Coord,
  events: DomainEvent[],
  turn: number
): void {
  const [r, c] = to;
  const area = data.areas[player.location.areaId];
  if (!area) throw new Error("Unknown area.");

  const tileId = area.grid[r]?.[c];
  if (!tileId) throw new Error(`Invalid move destination: [${r},${c}]`);

  player.location.row = r;
  player.location.col = c;
  player.location.tileId = tileId;

  events.push({
    type: "MOVED",
    atTurn: turn,
    payload: { playerId: player.player_id, to: [r, c], tileId },
  });
}

function getOutgoingEdges(data: GameData, areaId: string, from: Coord): Edge[] {
  const area = data.areas[areaId];
  if (!area) throw new Error(`Unknown area: ${areaId}`);
  return area.edges.filter((e) => coordEq(e.from, from));
}

function coordEq(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * タイル効果：いまは最小デモ
 * - 後で src/engine/rules/effects/ に切り出す前提
 * - ここで「金貨を可換資産として増減」も実装可能（coin_id個体の付与/移転）
 */
function resolveTileEffect(
  data: GameData,
  state: GameState,
  player: PlayerState,
  events: DomainEvent[],
  rng: RNG
): void {
  const area = data.areas[player.location.areaId];
  if (!area) throw new Error(`Unknown area: ${player.location.areaId}`);

  const tileId: TileId | undefined = area.grid[player.location.row]?.[player.location.col];
  if (!tileId) throw new Error("Player is on invalid tile.");

  // タイル同期
  player.location.tileId = tileId;

  // デモ効果（あなたの本仕様に合わせて後で置換）
  switch (tileId) {
    case "TAX": {
      player.currency.copper_coin = Math.max(0, player.currency.copper_coin - 1);
      events.push({
        type: "TILE_TAX",
        atTurn: state.turn,
        payload: { playerId: player.player_id, deltaCopper: -1 },
      });
      return;
    }

    case "MINT": {
      // デモ：ミントに止まると銀貨+1
      player.currency.silver_coin += 1;
      events.push({
        type: "TILE_MINT",
        atTurn: state.turn,
        payload: { playerId: player.player_id, deltaSilver: +1 },
      });
      return;
    }

    case "EVT": {
      // デモ：ランダムで銅/銀を得る（本来はEventCardへ）
      const roll = rng.nextInt(0, 2);
      if (roll === 0) {
        player.currency.copper_coin += 2;
        events.push({
          type: "TILE_EVENT_GAIN",
          atTurn: state.turn,
          payload: { playerId: player.player_id, gain: { copper_coin: 2 } },
        });
      } else {
        player.currency.silver_coin += 1;
        events.push({
          type: "TILE_EVENT_GAIN",
          atTurn: state.turn,
          payload: { playerId: player.player_id, gain: { silver_coin: 1 } },
        });
      }
      return;
    }

    default:
      // 何もしない
      return;
  }
}

