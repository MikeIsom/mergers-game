import { activeChains, chainSize, connectedLoose, placementEffect } from "./board.js";
import { computeBonuses } from "./bonuses.js";
import { CHAIN_IDS, SAFE_SIZE, SHARES_PER_CHAIN, STARTING_CASH, type ChainId } from "./config.js";
import { legalMoves } from "./legal.js";
import { merger } from "./merger.js";
import { currentSeat } from "./moves.js";
import { majorityBonus, minorityBonus, sharePrice } from "./prices.js";
import { parseTile, type Tile } from "./tiles.js";
import type { GameState, Move, Shares } from "./types.js";
import { HIDDEN } from "./view.js";

/*
 * A heuristic bot for BGS bot seats. It decides from the acting player's own view (viewFor), so it
 * never uses opponents' hands, the draw order or holdings the player could not see. Each option is
 * scored by a one-step model of every seat's worth: cash, shares at prices that include growth the
 * bot's own tiles make likely, and the bonuses current holdings would pay, weighted by how settled
 * each majority is. The bot plays to lead its opponents, using the game's own scoring groups.
 */

interface Model {
	size: Record<ChainId, number>;
	shares: Shares[];
	cash: number[];
}

interface Context {
	view: GameState;
	/** The seats the bot's player controls. */
	mine: number[];
	/** Every scoring group: one seat each, both seats of a fourHands player, or a team. */
	groups: number[][];
	combine: "sum" | "max";
	/** 0 at the start of the game, 1 once it could end. */
	progress: number;
	/** Likely extra size of each chain from the bot's own tiles. */
	growth: Record<ChainId, number>;
}

const noShares = (): Shares => Object.fromEntries(CHAIN_IDS.map((chain) => [chain, 0])) as Shares;
const perChain = (value: (chain: ChainId) => number) =>
	Object.fromEntries(CHAIN_IDS.map((chain) => [chain, value(chain)])) as Record<ChainId, number>;

function price(chain: ChainId, size: number): number {
	return size < 2 ? 0 : sharePrice(chain, Math.min(size, 41));
}

/**
 * Opponents' holdings as the player may know them: shown values first, then the public log folded
 * from the start. With a limited log the unaccounted shares (from the bank's public counts) are
 * spread evenly, and unknown cash is taken to match the bot's own.
 */
export function estimateHoldings(view: GameState, mine: number[]): { cash: number[]; shares: Shares[] } {
	const folded = view.log.some((entry) => entry.type === "hidden") ? undefined : foldLog(view);
	const ownCash = view.seats[mine[0]!]?.cash ?? STARTING_CASH;
	const cash = view.seats.map((seat, i) => (seat.cash !== HIDDEN ? seat.cash : (folded?.cash[i] ?? ownCash)));
	const shares = view.seats.map((seat) => ({ ...seat.shares }));
	for (const chain of CHAIN_IDS) {
		const unknown = view.seats.flatMap((seat, i) => (seat.shares[chain] === HIDDEN ? [i] : []));
		if (unknown.length === 0) {
			continue;
		}
		const known = view.seats.reduce((sum, seat) => sum + Math.max(0, seat.shares[chain]), 0);
		const total = Math.max(0, SHARES_PER_CHAIN - view.bank[chain] - known);
		const guess = unknown.map((i) => Math.max(0, folded?.shares[i]![chain] ?? 0));
		if (folded && guess.reduce((a, b) => a + b, 0) === total) {
			unknown.forEach((seat, k) => (shares[seat]![chain] = guess[k]!));
		} else {
			unknown.forEach((seat, k) => {
				shares[seat]![chain] = Math.floor(total / unknown.length) + (k < total % unknown.length ? 1 : 0);
			});
		}
	}
	return { cash, shares };
}

function foldLog(view: GameState): { cash: number[]; shares: Shares[] } {
	const cash = view.seats.map(() => STARTING_CASH);
	const shares = view.seats.map(noShares);
	let survivor: ChainId | undefined;
	for (const entry of view.log) {
		switch (entry.type) {
			case "founded":
				if (entry.bonus) {
					shares[entry.seat]![entry.chain] += 1;
				}
				break;
			case "mergerPlan":
				survivor = entry.survivor;
				break;
			case "bonuses":
				for (const { seat, amount } of entry.payouts) {
					cash[seat]! += amount;
				}
				break;
			case "disposed":
				shares[entry.seat]![entry.chain] -= entry.sold + entry.traded;
				cash[entry.seat]! += entry.proceeds;
				if (survivor) {
					shares[entry.seat]![survivor] += entry.traded / 2;
				}
				break;
			case "swapped":
				shares[entry.seat]![entry.from] -= entry.count;
				shares[entry.seat]![entry.to] += entry.count;
				cash[entry.seat]! -= entry.cost;
				break;
			case "bought":
				for (const chain of CHAIN_IDS) {
					shares[entry.seat]![chain] += entry.shares[chain] ?? 0;
				}
				cash[entry.seat]! -= entry.cost;
				break;
		}
	}
	return { cash, shares };
}

function context(view: GameState, player: number): Context {
	const mine = view.seatOwner.flatMap((owner, seat) => (owner === player ? [seat] : []));
	const teams = view.options.teamPlay && view.seats.length === 4;
	const groups = teams
		? [
				[0, 2],
				[1, 3],
			]
		: Array.from({ length: view.players }, (_, owner) =>
				view.seatOwner.flatMap((o, seat) => (o === owner ? [seat] : []))
			);
	const largest = Math.max(0, ...activeChains(view.board).map((chain) => chainSize(view.board, chain)));
	const filled = view.board.filter((cell) => cell !== null).length;
	const progress = Math.min(1, Math.max(largest / view.options.endSize, filled / 70));
	const hand = mine.flatMap((seat) => view.seats[seat]!.hand.filter((tile) => tile !== HIDDEN));
	const growth = perChain(() => 0);
	for (const tile of hand) {
		const effect = placementEffect(view.board, tile);
		if (effect.kind === "grow") {
			growth[effect.chain] = Math.min(3, growth[effect.chain] + 1);
		}
	}
	return { view, mine, groups, combine: teams ? "sum" : "max", progress, growth };
}

function baseModel(ctx: Context): Model {
	const { view } = ctx;
	const { cash, shares } = estimateHoldings(view, ctx.mine);
	const size = perChain((chain) => chainSize(view.board, chain));
	const m = view.merger;
	if (m?.survivor) {
		// Mid-merger: chains already settled are gone, the survivor will absorb every defunct chain.
		for (const chain of CHAIN_IDS) {
			if (m.sizes[chain] !== undefined && chain !== m.survivor) {
				size[chain] = m.defunct.includes(chain) ? m.sizes[chain]! : 0;
			}
		}
		size[m.survivor] = Object.values(m.sizes).reduce((a, b) => a + (b ?? 0), 0) + 1;
	}
	return { size, shares, cash };
}

function copy(model: Model): Model {
	return { size: { ...model.size }, shares: model.shares.map((s) => ({ ...s })), cash: [...model.cash] };
}

/** Each seat's worth: cash, shares and weighted bonuses (`realize` fixes the bonus weight). */
function worth(ctx: Context, model: Model, realize?: number): number[] {
	const values = [...model.cash];
	for (const chain of CHAIN_IDS) {
		const size = model.size[chain];
		if (size < 2) {
			continue;
		}
		const valued = realize === undefined ? size + ctx.growth[chain] : size;
		const each = price(chain, valued);
		const holdings = model.shares.map((s) => s[chain]);
		const bonus = computeBonuses(holdings, majorityBonus(chain, valued), minorityBonus(chain, valued));
		const weight = realize ?? (size >= SAFE_SIZE ? 0.8 + 0.2 * ctx.progress : 0.45 + 0.45 * ctx.progress);
		holdings.forEach((count, seat) => (values[seat]! += count * each + weight * bonus[seat]!));
	}
	return values;
}

function groupValue(ctx: Context, values: number[], seats: number[]): number {
	const own = seats.map((seat) => values[seat]!);
	return ctx.combine === "sum" ? own.reduce((a, b) => a + b, 0) : Math.max(...own);
}

/** How good `model` is for the bot: its lead over the field, plus a little for cash in hand. */
function score(ctx: Context, model: Model, realize?: number): number {
	const values = worth(ctx, model, realize);
	const mine = groupValue(ctx, values, ctx.mine);
	const others = ctx.groups
		.filter((group) => !group.some((seat) => ctx.mine.includes(seat)))
		.map((group) => groupValue(ctx, values, group));
	const best = others.length ? Math.max(...others) : 0;
	const mean = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
	const liquidity =
		realize === undefined ? ctx.mine.reduce((sum, seat) => sum + 0.1 * Math.min(model.cash[seat]!, 3000), 0) : 0;
	return mine - 0.5 * best - 0.5 * mean + liquidity;
}

/** Pays a chain's bonuses and sells every holder's shares at its size, as a merger does. */
function settle(model: Model, chain: ChainId, size: number): void {
	const holdings = model.shares.map((s) => s[chain]);
	const bonus = computeBonuses(holdings, majorityBonus(chain, size), minorityBonus(chain, size));
	holdings.forEach((count, seat) => {
		model.cash[seat]! += bonus[seat]! + count * price(chain, size);
		model.shares[seat]![chain] = 0;
	});
	model.size[chain] = 0;
}

function afterMerger(model: Model, chains: ChainId[], survivor: ChainId, added: number): Model {
	const next = copy(model);
	const total = chains.reduce((sum, chain) => sum + model.size[chain], 0);
	for (const chain of chains) {
		if (chain !== survivor) {
			settle(next, chain, model.size[chain]);
		}
	}
	next.size[survivor] = total + added;
	return next;
}

/** The best result of founding each available chain with `size` tiles, for `seat`. */
function bestFounding(ctx: Context, model: Model, size: number, seat: number): { chain: ChainId; value: number } {
	const active = activeChains(ctx.view.board);
	let best = { chain: CHAIN_IDS.find((c) => !active.includes(c))!, value: -Infinity };
	for (const chain of CHAIN_IDS) {
		if (active.includes(chain) || model.size[chain] >= 2) {
			continue;
		}
		const next = copy(model);
		next.size[chain] = size;
		if (ctx.view.bank[chain] > 0) {
			next.shares[seat]![chain] += 1;
		}
		const value = score(ctx, next);
		if (value > best.value) {
			best = { chain, value };
		}
	}
	return best;
}

function placeValue(ctx: Context, model: Model, tile: Tile, seat: number): number {
	const board = ctx.view.board;
	const effect = placementEffect(board, tile);
	const added = connectedLoose(board, tile).length;
	switch (effect.kind) {
		case "loose":
			return score(ctx, model);
		case "grow": {
			const next = copy(model);
			next.size[effect.chain] += added;
			return score(ctx, next);
		}
		case "found":
			return bestFounding(ctx, model, added, seat).value;
		case "merge": {
			const largest = Math.max(...effect.chains.map((chain) => model.size[chain]));
			return Math.max(
				...effect.chains
					.filter((chain) => model.size[chain] === largest)
					.map((survivor) => score(ctx, afterMerger(model, effect.chains, survivor, added)))
			);
		}
	}
}

function best<T>(options: T[], value: (option: T) => number): T | undefined {
	let pick: T | undefined;
	let top = -Infinity;
	for (const option of options) {
		const v = value(option);
		if (v > top + 1e-9) {
			top = v;
			pick = option;
		}
	}
	return pick;
}

function shouldAnnounce(ctx: Context, model: Model): boolean {
	const values = worth(ctx, model, 1);
	const mine = groupValue(ctx, values, ctx.mine);
	return ctx.groups
		.filter((group) => !group.some((seat) => ctx.mine.includes(seat)))
		.every((group) => groupValue(ctx, values, group) < mine);
}

/** The bot's move for the seat to act, chosen from `view`, the player's own view of the game. */
export function botMove(view: GameState, player: number): Move {
	const seat = currentSeat(view)!;
	const moves = legalMoves(view);
	const ctx = context(view, player);
	const model = baseModel(ctx);
	if (moves.some((move) => move.type === "announce") && shouldAnnounce(ctx, model)) {
		return { type: "announce" };
	}
	const of = <K extends Move["type"]>(type: K) =>
		moves.filter((move): move is Extract<Move, { type: K }> => move.type === type);
	switch (view.phase) {
		case "place": {
			const places = of("place");
			if (places.length === 0) {
				return of("pass")[0] ?? moves[0]!;
			}
			return best(places, (move) => placeValue(ctx, model, parseTile(move.tile)!, seat))!;
		}
		case "found": {
			const size = connectedLoose(view.board, view.pendingTile!).length;
			const chain = bestFounding(ctx, model, size, seat).chain;
			return of("found").find((move) => move.chain === chain) ?? of("found")[0]!;
		}
		case "survivor": {
			const m = merger(view);
			const chains = CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined);
			const sized = copy(model);
			chains.forEach((chain) => (sized.size[chain] = m.sizes[chain]!));
			return best(of("survivor"), (move) => score(ctx, afterMerger(sized, chains, move.chain, 1)))!;
		}
		case "defunctOrder":
			return of("defunctOrder")[0]!;
		case "dispose": {
			const m = merger(view);
			const chain = m.current!;
			const survivor = m.survivor!;
			const salePrice = price(chain, m.sizes[chain]!);
			const keep = 0.25 * salePrice * (1 - ctx.progress);
			return best(of("dispose"), (move) => {
				const next = copy(model);
				const held = next.shares[seat]![chain];
				next.shares[seat]![chain] = 0;
				next.cash[seat]! += move.sell * salePrice;
				next.shares[seat]![survivor] += move.trade / 2;
				return score(ctx, next) + (held - move.sell - move.trade) * keep;
			})!;
		}
		case "buy": {
			const current = score(ctx, model);
			const swap = best(of("swap"), (move) => swapValue(ctx, model, move));
			if (swap && swapValue(ctx, model, swap) > current + 50) {
				return swap;
			}
			return best(of("buy"), (move) => {
				const next = copy(model);
				for (const chain of CHAIN_IDS) {
					const count = move.shares[chain] ?? 0;
					next.shares[seat]![chain] += count;
					next.cash[seat]! -= count * price(chain, chainSize(view.board, chain));
				}
				return score(ctx, next);
			})!;
		}
		default:
			return moves[0]!;
	}
}

function swapValue(ctx: Context, model: Model, move: Extract<Move, { type: "swap" }>): number {
	const next = copy(model);
	const seat = ctx.view.activeSeat;
	const board = ctx.view.board;
	next.shares[seat]![move.from] -= move.count;
	next.shares[seat]![move.to] += move.count;
	next.cash[seat]! -=
		move.count * (price(move.to, chainSize(board, move.to)) - price(move.from, chainSize(board, move.from)));
	return score(ctx, next);
}
