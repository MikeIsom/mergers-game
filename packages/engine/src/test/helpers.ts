import assert from "node:assert/strict";
import { activeChains } from "../board.js";
import { CHAIN_IDS, SHARES_PER_CHAIN, TILE_COUNT, type ChainId } from "../config.js";
import { initGame } from "../setup.js";
import { allTiles, neighbours, parseTile, type Tile } from "../tiles.js";
import { startTurn } from "../turn.js";
import type { Cell, GameState, Shares } from "../types.js";

export function t(label: string): Tile {
	const tile = parseTile(label);
	assert.notEqual(tile, undefined, `bad tile label ${label}`);
	return tile!;
}

export interface Scenario {
	seats?: number;
	/** Board contents by tile label; unlisted squares are empty. */
	board?: Record<string, Exclude<Cell, null>>;
	/** Hands by seat, as tile labels. */
	hands?: string[][];
	/** The next tiles to be drawn, in draw order. All other free tiles sit beneath them. */
	poolTop?: string[];
	/** Tiles removed from the game. */
	removed?: string[];
	/** When set, the pool holds only poolTop (all other free tiles are removed from the game). */
	poolOnly?: boolean;
	cash?: number[];
	shares?: Partial<Shares>[];
	activeSeat?: number;
	options?: Record<string, unknown>;
}

/**
 * Builds a game in an exact position and starts the active seat's turn. Every tile stays in
 * exactly one place, so the rules.md §14 invariants hold for the constructed state.
 */
export function scenario(spec: Scenario): GameState {
	const fourHands = spec.options?.twoPlayerMode === "fourHands";
	const state = initGame(fourHands ? 2 : (spec.seats ?? 3), spec.options ?? {}, "scenario");
	state.log = [];
	state.turn = 0;
	state.board = allTiles().map(() => null);
	for (const [label, cell] of Object.entries(spec.board ?? {})) {
		state.board[t(label)] = cell;
	}
	state.seats.forEach((seat, i) => {
		seat.hand = (spec.hands?.[i] ?? []).map(t);
		seat.cash = spec.cash?.[i] ?? seat.cash;
		for (const chain of CHAIN_IDS) {
			seat.shares[chain] = spec.shares?.[i]?.[chain] ?? 0;
		}
	});
	for (const chain of CHAIN_IDS) {
		state.bank[chain] = SHARES_PER_CHAIN - state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
	}
	state.bankTiles = [];
	state.removed = (spec.removed ?? []).map(t);
	const top = (spec.poolTop ?? []).map(t);
	const used = new Set<Tile>([
		...top,
		...state.removed,
		...state.bankTiles,
		...state.seats.flatMap((seat) => seat.hand),
		...allTiles().filter((tile) => state.board[tile] !== null),
	]);
	const rest = allTiles().filter((tile) => !used.has(tile));
	if (spec.poolOnly) {
		state.removed.push(...rest);
		state.pool = [...top].reverse();
	} else {
		state.pool = [...rest, ...[...top].reverse()];
	}
	state.activeSeat = spec.activeSeat ?? 0;
	state.pendingTile = null;
	state.endAnnounced = null;
	state.turnsWithoutPlacement = 0;
	startTurn(state);
	return state;
}

/** Tiles of one chain, as a board spec fragment. */
export function chainAt(chain: ChainId, labels: string[]): Record<string, ChainId> {
	return Object.fromEntries(labels.map((label) => [label, chain]));
}

/** A straight run of tiles in one row, e.g. row("A", 1, 4) = 1A..4A. */
export function row(letter: string, from: number, to: number): string[] {
	return Array.from({ length: to - from + 1 }, (_, i) => `${from + i}${letter}`);
}

/** rules.md §14 invariants 1-6. */
export function checkInvariants(state: GameState): void {
	for (const chain of CHAIN_IDS) {
		const held = state.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
		assert.equal(state.bank[chain] + held, SHARES_PER_CHAIN, `§14.1 shares of ${chain}`);
		assert.ok(state.bank[chain] >= 0, `§14.1 bank shares of ${chain} non-negative`);
	}
	for (const seat of state.seats) {
		assert.ok(Number.isInteger(seat.cash) && seat.cash >= 0 && seat.cash % 100 === 0, `§14.2 cash ${seat.cash}`);
	}
	const places = [
		...state.pool,
		...state.removed,
		...state.bankTiles,
		...state.seats.flatMap((seat) => seat.hand),
		...allTiles().filter((tile) => state.board[tile] !== null),
	];
	assert.equal(places.length, TILE_COUNT, "§14.3 every tile is somewhere");
	assert.equal(new Set(places).size, TILE_COUNT, "§14.3 no tile is in two places");

	const chains = activeChains(state.board);
	assert.ok(chains.length <= CHAIN_IDS.length, "§14.5 at most 7 chains");
	for (const chain of chains) {
		const tiles = allTiles().filter((tile) => state.board[tile] === chain);
		assert.ok(tiles.length >= 2, `§14.4 ${chain} has at least 2 tiles`);
		const reached = new Set<Tile>([tiles[0]!]);
		const frontier = [tiles[0]!];
		while (frontier.length > 0) {
			for (const next of neighbours(frontier.pop()!)) {
				if (state.board[next] === chain && !reached.has(next)) {
					reached.add(next);
					frontier.push(next);
				}
			}
		}
		assert.equal(reached.size, tiles.length, `§14.4 ${chain} is connected`);
		for (const tile of tiles) {
			for (const next of neighbours(tile)) {
				const cell = state.board[next];
				if (cell !== null && cell !== "loose") {
					assert.equal(cell, chain, `§14.4 ${chain} touches ${cell}`);
				}
			}
		}
	}
	assert.deepEqual(JSON.parse(JSON.stringify(state)), state, "§14.6 state is JSON-serializable");
}
