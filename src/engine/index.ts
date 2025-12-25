import type {
  Action,
  DomainEvent,
  GameData,
  TileId,
  Coord,
  Edge,
  RecipeId,
} from "./model/types.js";
import type { GameState, PlayerState } from "./model/state.js";
import { SeededRNG, type RNG } from "./rng/rng.js";
import { applyTileEffectOnLand } from "./rules/effectRegistry.js";

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

    currency: { copper_coin: 0, silver_coin: 0 },

    raw: {
      gold_bullion: 0,
      wool: 0,
      cotton: 0,
      silk: 0,
      tea_leaf: 0,
      coal: 0,
      metal_ore: 0,
    },

    product: {
      wool_textile: 0,
      cotton_textile: 0,
      silk_goods: 0,
      tea: 0,
      arms: 0,
      machinery: 0,
    },

    title_rank: 0,
    gold_coins: [],

    location: {
      areaId: setup.startAreaId,
      row: setup.startRow,
      col: setup.startCol,
      tileId,
    },
  }));

  return {
    // 評価用（確定版）
    current_era: "Victorian",
    cycle_index: 1,
    inflation_stage: 0,

    // 運用
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

  // 通常：移動 or 工場処理 or ターン終了
  // ※「どの工場で作れるか」は後回しのため、材料が揃えばどこでもPROCESS可
  const recipes = listCraftableRecipes(active);

  return [
    { type: "ROLL_MOVE" },
    ...recipes.map((r) => ({ type: "PROCESS_FACTORY", recipe: r } as const)),
    { type: "END_TURN" },
  ];
}

export function step(data: GameData, state: GameState, action: Action, rng?: RNG): EngineResult {
  // 再現性：rng未指定なら seed + turn + active を元に生成
  const _rng = rng ?? new SeededRNG(state.seed + state.turn * 100 + state.activePlayerIndex);

  const events: DomainEvent[] = [];
  const next = structuredClone(state) as GameState;

  const active = next.players[next.activePlayerIndex];
  if (!active) throw new Error("No active player.");

  // pendingMove が別プレイヤーのものなら不正（設計の整合性維持）
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

      const outs = getOutgoingEdges(
        data,
        active.location.areaId,
        [active.location.row, active.location.col]
      );
      const ok = outs.some((e) => coordEq(e.to, action.to));
      if (!ok) throw new Error("Illegal edge choice.");

      // 1歩進める
      moveTo(data, active, action.to, events, next.turn);
      pm.remaining -= 1;
      pm.awaitingChoice = false;

      // 続きを自動で進める
      autoAdvance(data, next, active, events, _rng);
      break;
    }

    case "PROCESS_FACTORY": {
      if (next.pendingMove) throw new Error("Cannot process while a move is pending.");

      // 材料チェック＆処理（あなたの確定レシピ）
      applyFactoryRecipe(active, action.recipe);

      events.push({
        type: "FACTORY_PROCESSED",
        atTurn: next.turn,
        payload: { playerId: active.player_id, recipe: action.recipe },
      });

      break;
    }

    case "END_TURN": {
      if (next.pendingMove) throw new Error("Cannot end turn while a move is pending.");

      const prevIdx = next.activePlayerIndex;

      next.activePlayerIndex = (next.activePlayerIndex + 1) % next.players.length;

      // 1周したらターン+1
      if (next.activePlayerIndex === 0) {
        next.turn += 1;

        // era/cycle/inflation の進行は後で確定したルールでここに追加
        // （現段階では不必要に決め打ちしない）
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

/** 材料が揃っているレシピを列挙（工場の場所制約は後回し） */
function listCraftableRecipes(p: PlayerState): RecipeId[] {
  const out: RecipeId[] = [];

  if (p.raw.wool >= 1) out.push("WOOL_TEXTILE");
  if (p.raw.cotton >= 1) out.push("COTTON_TEXTILE");
  if (p.raw.silk >= 1) out.push("SILK_GOODS");
  if (p.raw.tea_leaf >= 1) out.push("TEA");

  if (p.raw.metal_ore >= 1 && p.raw.coal >= 1) {
    out.push("ARMS");
    out.push("MACHINERY");
  }

  return out;
}

/** あなたの確定レシピ（原材料は必ず減り、該当製品カード+1） */
function applyFactoryRecipe(p: PlayerState, recipe: RecipeId): void {
  switch (recipe) {
    case "WOOL_TEXTILE":
      if (p.raw.wool < 1) throw new Error("Insufficient wool");
      p.raw.wool -= 1;
      p.product.wool_textile += 1;
      return;

    case "COTTON_TEXTILE":
      if (p.raw.cotton < 1) throw new Error("Insufficient cotton");
      p.raw.cotton -= 1;
      p.product.cotton_textile += 1;
      return;

    case "SILK_GOODS":
      if (p.raw.silk < 1) throw new Error("Insufficient silk");
      p.raw.silk -= 1;
      p.product.silk_goods += 1;
      return;

    case "TEA":
      if (p.raw.tea_leaf < 1) throw new Error("Insufficient tea_leaf");
      p.raw.tea_leaf -= 1;
      p.product.tea += 1;
      return;

    case "ARMS":
      if (p.raw.metal_ore < 1 || p.raw.coal < 1) throw new Error("Insufficient metal_ore/coal");
      p.raw.metal_ore -= 1;
      p.raw.coal -= 1;
      p.product.arms += 1;
      return;

    case "MACHINERY":
      if (p.raw.metal_ore < 1 || p.raw.coal < 1) throw new Error("Insufficient metal_ore/coal");
      p.raw.metal_ore -= 1;
      p.raw.coal -= 1;
      p.product.machinery += 1;
      return;

    default: {
      const _exhaustive: never = recipe;
      throw new Error(`Unknown recipe: ${_exhaustive}`);
    }
  }
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
      events.push({
        type: "MOVE_BLOCKED",
        atTurn: state.turn,
        payload: { playerId: player.player_id },
      });
      state.pendingMove = undefined;
      resolveTileOnLand(data, state, events, rng);
      return;
    }

    if (outs.length >= 2) {
      pm.awaitingChoice = true;
      return;
    }

    moveTo(data, player, outs[0]!.to, events, state.turn);
    pm.remaining -= 1;
  }

  state.pendingMove = undefined;
  resolveTileOnLand(data, state, events, rng);
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
 * 停止時タイル効果の適用
 * - tileId -> effectId は rules 側で宣言
 * - index.ts 側は “呼ぶだけ”
 */
function resolveTileOnLand(data: GameData, state: GameState, events: DomainEvent[], rng: RNG): void {
  const active = state.players[state.activePlayerIndex];
  if (!active) throw new Error("No active player.");

  const area = data.areas[active.location.areaId];
  if (!area) throw new Error(`Unknown area: ${active.location.areaId}`);

  const tileId: TileId | undefined = area.grid[active.location.row]?.[active.location.col];
  if (!tileId) throw new Error("Active player is on invalid tile.");

  active.location.tileId = tileId;

  const emit = (type: string, payload?: Record<string, unknown>) => {
    events.push({ type, atTurn: state.turn, payload });
  };

  applyTileEffectOnLand(tileId, {
    data,
    state,
    activePlayerIndex: state.activePlayerIndex,
    rng,
    emit,
  });
}
