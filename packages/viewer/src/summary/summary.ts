// Endgame summary MOCKUP (dev harness only; not part of the BGS bundle). Folds a finished game's
// log into per-seat money, stock, merger and chain statistics. Every figure comes from committed
// log events, so it works for any saved game; a real release would move this into the engine.
import {
	CHAIN_IDS,
	STARTING_CASH,
	majorityBonus,
	minorityBonus,
	sharePrice,
	tileLabel,
	type ChainId,
	type GameState,
} from "acquire-engine";

type PerChain = Record<ChainId, number>;
const perChain = (): PerChain => Object.fromEntries(CHAIN_IDS.map((c) => [c, 0])) as PerChain;

export type Place = "first" | "firstTied" | "second" | "secondTied" | "none" | "absent";

export interface StockActivity {
	founded: number;
	bought: number;
	tradedIn: number;
	tradedOut: number;
	sold: number;
	swappedIn: number;
	swappedOut: number;
	heldThrough: number;
	final: number;
	peak: number;
}

export interface SeatSummary {
	start: number;
	final: number;
	bonusFirst: PerChain;
	bonusSecond: PerChain;
	mergerSales: number;
	finalSales: PerChain;
	swapNet: number;
	buys: number;
	/** Value of founders' free shares when received (already counted in sales). */
	founderShareValue: number;
	stock: Record<ChainId, StockActivity>;
	places: Record<Place, number>;
	tieLoss: number;
	triggered: number;
	triggeredOnlyRivals: number;
	bonusByRound: number[];
}

export interface Settlement {
	chain: ChainId;
	turn: number;
	size: number;
	end: boolean;
	holdings: number[];
	bank?: number;
	payouts: { seat: number; amount: number; place: Place }[];
	bankAmount?: number;
	disposals: { seat: number; sold: number; traded: number; held: number }[];
}

export interface MergerSummary {
	turn: number;
	seat: number;
	byBank: boolean;
	tile: string;
	sizes: Partial<PerChain>;
	survivor: ChainId;
	settlements: Settlement[];
}

export interface ChainSummary {
	chain: ChainId;
	foundings: { seat: number; turn: number; founderAtEnd: number | undefined }[];
	peak: number;
	absorbed: number;
	midBonus: number;
	endBonus: number;
	finalSize: number | undefined;
}

export interface GameSummary {
	seats: SeatSummary[];
	mergers: MergerSummary[];
	endSettlements: Settlement[];
	chains: ChainSummary[];
	timeline: { turn: number; worth: number[] }[];
	mergerTurns: number[];
	turns: number;
	balanced: boolean;
}

function placesFor(holdings: number[]): Place[] {
	const top = Math.max(...holdings);
	if (top === 0) {
		return holdings.map(() => "absent");
	}
	const firsts = holdings.filter((h) => h === top).length;
	const rest = holdings.filter((h) => h < top && h > 0);
	const second = rest.length > 0 && firsts === 1 ? Math.max(...rest) : undefined;
	const seconds = second === undefined ? 0 : holdings.filter((h) => h === second).length;
	return holdings.map((h) => {
		if (h === 0) {
			return "absent";
		}
		if (h === top) {
			return firsts > 1 ? "firstTied" : "first";
		}
		if (h === second) {
			return seconds > 1 ? "secondTied" : "second";
		}
		return "none";
	});
}

export function summarize(state: GameState): GameSummary {
	const n = state.seats.length;
	const seats: SeatSummary[] = state.seats.map(() => ({
		start: STARTING_CASH,
		final: 0,
		bonusFirst: perChain(),
		bonusSecond: perChain(),
		mergerSales: 0,
		finalSales: perChain(),
		swapNet: 0,
		buys: 0,
		founderShareValue: 0,
		stock: Object.fromEntries(
			CHAIN_IDS.map((c) => [
				c,
				{
					founded: 0,
					bought: 0,
					tradedIn: 0,
					tradedOut: 0,
					sold: 0,
					swappedIn: 0,
					swappedOut: 0,
					heldThrough: 0,
					final: 0,
					peak: 0,
				},
			])
		) as Record<ChainId, StockActivity>,
		places: {
			first: 0,
			firstTied: 0,
			second: 0,
			secondTied: 0,
			none: 0,
			absent: 0,
		},
		tieLoss: 0,
		triggered: 0,
		triggeredOnlyRivals: 0,
		bonusByRound: [],
	}));
	const cash = seats.map(() => STARTING_CASH);
	const shares = seats.map(() => perChain());
	const size = perChain();
	const chains: ChainSummary[] = CHAIN_IDS.map((chain) => ({
		chain,
		foundings: [],
		peak: 0,
		absorbed: 0,
		midBonus: 0,
		endBonus: 0,
		finalSize: undefined,
	}));
	const chainOf = (c: ChainId) => chains.find((x) => x.chain === c)!;
	const mergers: MergerSummary[] = [];
	const endSettlements: Settlement[] = [];
	const timeline: GameSummary["timeline"] = [];
	let turn = 0;
	let ended = false;
	let current: MergerSummary | undefined;
	let settlement: Settlement | undefined;

	const worth = () =>
		cash.map(
			(c, seat) =>
				c + CHAIN_IDS.reduce((sum, ch) => sum + (size[ch] >= 2 ? shares[seat]![ch] * sharePrice(ch, size[ch]) : 0), 0)
		);
	const setShares = (seat: number, chain: ChainId, value: number) => {
		shares[seat]![chain] = value;
		const s = seats[seat]!.stock[chain];
		s.peak = Math.max(s.peak, value);
	};
	const grow = (chain: ChainId, value: number) => {
		size[chain] = value;
		chainOf(chain).peak = Math.max(chainOf(chain).peak, value);
	};
	const closeFounding = (chain: ChainId) => {
		const founding = chainOf(chain).foundings.at(-1);
		if (founding && founding.founderAtEnd === undefined) {
			founding.founderAtEnd = shares[founding.seat]![chain];
		}
	};

	for (const entry of state.log) {
		switch (entry.type) {
			case "turn":
				timeline.push({ turn, worth: worth() });
				turn += 1;
				break;
			case "founded":
				grow(entry.chain, entry.size);
				chainOf(entry.chain).foundings.push({
					seat: entry.seat,
					turn,
					founderAtEnd: undefined,
				});
				if (entry.bonus) {
					setShares(entry.seat, entry.chain, shares[entry.seat]![entry.chain] + 1);
					seats[entry.seat]!.stock[entry.chain].founded += 1;
					seats[entry.seat]!.founderShareValue += sharePrice(entry.chain, entry.size);
				}
				break;
			case "grew":
				grow(entry.chain, entry.size);
				break;
			case "merger":
				current = {
					turn,
					seat: entry.seat,
					byBank: entry.byBank === true,
					tile: tileLabel(entry.tile),
					sizes: entry.sizes,
					survivor: CHAIN_IDS[0]!,
					settlements: [],
				};
				mergers.push(current);
				break;
			case "mergerPlan":
				if (current) {
					current.survivor = entry.survivor;
				}
				break;
			case "bonuses": {
				const holdings = shares.map((s) => s[entry.chain]);
				const all = entry.bank ? [...holdings, entry.bank.shares] : holdings;
				const places = placesFor(all);
				const major = majorityBonus(entry.chain, entry.size);
				const minor = minorityBonus(entry.chain, entry.size);
				settlement = {
					chain: entry.chain,
					turn,
					size: entry.size,
					end: ended,
					holdings,
					...(entry.bank ? { bank: entry.bank.shares, bankAmount: entry.bank.amount } : {}),
					payouts: entry.payouts.map((p) => ({ ...p, place: places[p.seat]! })),
					disposals: [],
				};
				(ended ? endSettlements : (current?.settlements ?? [])).push(settlement);
				const tiedFirst = places.filter((p) => p === "firstTied").length;
				const tiedSecond = places.filter((p) => p === "secondTied").length;
				holdings.forEach((_, seat) => {
					const s = seats[seat]!;
					const place = places[seat]!;
					s.places[place] += 1;
					const amount = entry.payouts.find((p) => p.seat === seat)?.amount ?? 0;
					if (place === "first" || place === "firstTied") {
						s.bonusFirst[entry.chain] += amount;
					} else {
						s.bonusSecond[entry.chain] += amount;
					}
					if (place === "firstTied" && tiedFirst > 1) {
						s.tieLoss += Math.max(0, major - amount);
					}
					if (place === "secondTied" && tiedSecond > 1) {
						s.tieLoss += Math.max(0, minor - amount);
					}
					const round = Math.floor(Math.max(0, turn - 1) / n);
					s.bonusByRound[round] = (s.bonusByRound[round] ?? 0) + amount;
					cash[seat]! += amount;
				});
				const paid = entry.payouts.reduce((sum, p) => sum + p.amount, 0);
				if (ended) {
					chainOf(entry.chain).endBonus += paid;
				} else {
					chainOf(entry.chain).midBonus += paid;
				}
				break;
			}
			case "disposed": {
				const s = seats[entry.seat]!.stock[entry.chain];
				s.sold += entry.sold;
				s.tradedOut += entry.traded;
				s.heldThrough += entry.held;
				seats[entry.seat]!.mergerSales += entry.proceeds;
				cash[entry.seat]! += entry.proceeds;
				setShares(entry.seat, entry.chain, entry.held);
				if (current) {
					const survivor = current.survivor;
					seats[entry.seat]!.stock[survivor].tradedIn += entry.traded / 2;
					setShares(entry.seat, survivor, shares[entry.seat]![survivor] + entry.traded / 2);
				}
				settlement?.disposals.push({
					seat: entry.seat,
					sold: entry.sold,
					traded: entry.traded,
					held: entry.held,
				});
				break;
			}
			case "merged":
				if (current) {
					for (const { chain } of current.settlements) {
						closeFounding(chain);
						chainOf(chain).absorbed += 1;
						size[chain] = 0;
					}
					if (!current.byBank) {
						const trigger = seats[current.seat]!;
						trigger.triggered += 1;
						const paid = new Set(current.settlements.flatMap((x) => x.payouts.map((p) => p.seat)));
						if (paid.size > 0 && !paid.has(current.seat)) {
							trigger.triggeredOnlyRivals += 1;
						}
					}
				}
				grow(entry.survivor, entry.size);
				current = undefined;
				settlement = undefined;
				break;
			case "swapped": {
				const s = seats[entry.seat]!;
				s.swapNet -= entry.cost;
				cash[entry.seat]! -= entry.cost;
				s.stock[entry.from].swappedOut += entry.count;
				s.stock[entry.to].swappedIn += entry.count;
				setShares(entry.seat, entry.from, shares[entry.seat]![entry.from] - entry.count);
				setShares(entry.seat, entry.to, shares[entry.seat]![entry.to] + entry.count);
				break;
			}
			case "bought":
				seats[entry.seat]!.buys += entry.cost;
				cash[entry.seat]! -= entry.cost;
				for (const chain of CHAIN_IDS) {
					const count = entry.shares[chain] ?? 0;
					if (count > 0) {
						seats[entry.seat]!.stock[chain].bought += count;
						setShares(entry.seat, chain, shares[entry.seat]![chain] + count);
					}
				}
				break;
			case "gameEnd":
				ended = true;
				for (const chain of CHAIN_IDS) {
					if (size[chain] >= 2) {
						chainOf(chain).finalSize = size[chain];
						closeFounding(chain);
					}
				}
				timeline.push({ turn, worth: worth() });
				break;
			case "finalSale":
				seats[entry.seat]!.finalSales[entry.chain] += entry.proceeds;
				seats[entry.seat]!.stock[entry.chain].final += entry.shares;
				cash[entry.seat]! += entry.proceeds;
				shares[entry.seat]![entry.chain] = 0;
				break;
			default:
				break;
		}
	}
	timeline.push({ turn, worth: cash.slice() });

	seats.forEach((s, seat) => {
		s.final = state.seats[seat]!.cash;
	});
	return {
		seats,
		mergers,
		endSettlements,
		chains: chains.filter((c) => c.foundings.length > 0),
		timeline,
		mergerTurns: mergers.map((m) => m.turn),
		turns: turn,
		balanced: cash.every((c, seat) => c === state.seats[seat]!.cash),
	};
}
