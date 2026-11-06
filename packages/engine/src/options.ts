import { END_SIZE, HAND_SIZE, MAX_BUY, TWO_TILE_HAND_SIZE } from "./config.js";

/** rules.md §15, after normalisation against the player count. */
export interface GameOptions {
	/** Full public holdings (rules.md §13), also the highest holdingsVisibility level. */
	publicHoldings: boolean;
	/**
	 * Only the intermediate levels are stored: private and public remain publicHoldings
	 * false/true, preserving the init log of games created before this option.
	 */
	holdingsVisibility?: "cash" | "cashAndShareCount";
	teamPlay: boolean;
	twoPlayerMode: "bank" | "fourHands";
	autoEnd: boolean;
	endSize: number;
	/** Omitted when off, preserving the init log of games created before this variant. */
	stockSwap?: 3 | 5 | 7 | "unlimited";
	/** Omitted at the standard limit of 3, preserving historical init logs. */
	sharesPerTurn?: 4 | 5;
	/** Omitted when off, like stockSwap. */
	twoTiles?: true;
	/** Omitted at the legacy size (6, or 8 with twoTiles), so games created before it replay. */
	handSize?: 6 | 8 | 10 | 12;
	/**
	 * Set with twoTiles in games created under the relaxed founding/merger limits (rules.md
	 * §4.1). Two-tile games logged before them lack it and keep the original limits.
	 */
	twoTilesRelaxed?: true;
	/** Omitted when off, like stockSwap. */
	limitedLog?: true;
	/**
	 * rules.md §5.3: set in games created since drawn dead tiles are replaced at once. Games
	 * logged before lack it and keep replacing dead tiles only once per turn, also when replayed.
	 */
	deadDrawsReplaced?: true;
}

export interface IgnoredOption {
	option: string;
	value: unknown;
	reason: string;
}

export const DEFAULT_OPTIONS: GameOptions = {
	publicHoldings: false,
	teamPlay: false,
	twoPlayerMode: "bank",
	autoEnd: false,
	endSize: END_SIZE,
	deadDrawsReplaced: true,
};

const END_SIZES = [41, 31];
const HAND_SIZES = [6, 8, 10, 12, "6", "8", "10", "12"];

/** The optionIgnored reason when the legacy checkbox already makes holdings public. */
export const PUBLIC_HOLDINGS_OVERRIDE = "publicHoldings makes all holdings public";

/** rules.md §13: how much of other players' holdings everyone sees, from least to most. */
export const HOLDINGS_VISIBILITY = ["private", "cash", "cashAndShareCount", "public"] as const;
export type HoldingsVisibility = (typeof HOLDINGS_VISIBILITY)[number];

/** The holdings level during play; everything becomes public when the game ends. */
export function holdingsVisibility(options: GameOptions): HoldingsVisibility {
	return options.publicHoldings ? "public" : (options.holdingsVisibility ?? "private");
}

/** Whether exact cash is public, so decisions that depend only on cash may reveal it. */
export function cashIsPublic(options: GameOptions): boolean {
	return holdingsVisibility(options) !== "private";
}

/**
 * Reads the creator's options defensively. BGS omits unticked checkboxes and always sends
 * selects (as strings), so a missing checkbox means false. Options are never rejected
 * (rules.md §3.5/§15): anything that does not apply, or has an unknown value, is ignored
 * and reported so the log can say so. Replay passes the options `recorded` in the game's
 * init log, so games created under an earlier rule revision rebuild with that revision.
 */
export function normalizeOptions(
	players: number,
	raw: Record<string, unknown>,
	recorded?: Partial<GameOptions>
): { options: GameOptions; ignored: IgnoredOption[] } {
	const options: GameOptions = { ...DEFAULT_OPTIONS };
	const ignored: IgnoredOption[] = [];
	if (recorded !== undefined && recorded.deadDrawsReplaced !== true) {
		delete options.deadDrawsReplaced;
	}

	// The legacy publicHoldings checkbox always means full public holdings and wins over the
	// holdingsVisibility select. Only an intermediate level it overrides is reported: the
	// select's default "private" is always sent.
	let visibility: HoldingsVisibility = "private";
	if (HOLDINGS_VISIBILITY.includes(raw.holdingsVisibility as HoldingsVisibility)) {
		visibility = raw.holdingsVisibility as HoldingsVisibility;
	} else if (raw.holdingsVisibility !== undefined) {
		ignored.push({ option: "holdingsVisibility", value: raw.holdingsVisibility, reason: "unknown value" });
	}
	if (raw.publicHoldings === true) {
		if (visibility === "cash" || visibility === "cashAndShareCount") {
			ignored.push({ option: "holdingsVisibility", value: visibility, reason: PUBLIC_HOLDINGS_OVERRIDE });
		}
		visibility = "public";
	}
	options.publicHoldings = visibility === "public";
	if (visibility === "cash" || visibility === "cashAndShareCount") {
		options.holdingsVisibility = visibility;
	}
	options.autoEnd = raw.autoEnd === true;

	if (raw.teamPlay === true) {
		if (players === 4) {
			options.teamPlay = true;
		} else {
			ignored.push({ option: "teamPlay", value: true, reason: "only applies with exactly 4 players" });
		}
	}

	if (raw.twoPlayerMode === "fourHands") {
		if (players === 2) {
			options.twoPlayerMode = "fourHands";
		} else {
			ignored.push({ option: "twoPlayerMode", value: "fourHands", reason: "only applies with exactly 2 players" });
		}
	} else if (raw.twoPlayerMode !== undefined && raw.twoPlayerMode !== "bank") {
		ignored.push({ option: "twoPlayerMode", value: raw.twoPlayerMode, reason: "unknown value" });
	}

	if (raw.endSize !== undefined) {
		const size = Number(raw.endSize);
		if (END_SIZES.includes(size)) {
			options.endSize = size;
		} else {
			ignored.push({ option: "endSize", value: raw.endSize, reason: "unknown value" });
		}
	}

	if (raw.stockSwap === "unlimited") {
		options.stockSwap = "unlimited";
	} else if (raw.stockSwap !== undefined && raw.stockSwap !== "off") {
		if ([3, 5, 7, "3", "5", "7"].includes(raw.stockSwap as number | string)) {
			options.stockSwap = Number(raw.stockSwap) as 3 | 5 | 7;
		} else {
			ignored.push({ option: "stockSwap", value: raw.stockSwap, reason: "unknown value" });
		}
	}

	if (raw.sharesPerTurn !== undefined) {
		if ([4, 5, "4", "5"].includes(raw.sharesPerTurn as number | string)) {
			options.sharesPerTurn = Number(raw.sharesPerTurn) as 4 | 5;
		} else if (raw.sharesPerTurn !== 3 && raw.sharesPerTurn !== "3") {
			ignored.push({ option: "sharesPerTurn", value: raw.sharesPerTurn, reason: "unknown value" });
		}
	}

	if (raw.twoTiles === true) {
		options.twoTiles = true;
		if (recorded === undefined || recorded.twoTilesRelaxed === true) {
			options.twoTilesRelaxed = true;
		}
	}
	if (raw.handSize !== undefined) {
		if (HAND_SIZES.includes(raw.handSize as number | string)) {
			const size = Number(raw.handSize) as 6 | 8 | 10 | 12;
			if (size !== legacyHandSize(options)) {
				options.handSize = size;
			}
		} else {
			ignored.push({ option: "handSize", value: raw.handSize, reason: "unknown value" });
		}
	}
	if (raw.limitedLog === true) {
		options.limitedLog = true;
	}

	return { options, ignored };
}

/** Total purchases across all chains, independent of stock swaps and tile placements. */
export function sharePurchaseLimit(options: GameOptions): number {
	return options.sharesPerTurn ?? MAX_BUY;
}

/** Games created before the handSize option hold 6 tiles, or 8 with twoTiles. */
function legacyHandSize(options: GameOptions): number {
	return options.twoTiles ? TWO_TILE_HAND_SIZE : HAND_SIZE;
}

/** rules.md §15 handSize: the number of tiles each seat draws up to. */
export function handSize(options: GameOptions): number {
	return options.handSize ?? legacyHandSize(options);
}

/** Internal seats per real player: fourHands gives each of the 2 players two seats. */
export function seatOwners(players: number, options: GameOptions): number[] {
	if (players === 2 && options.twoPlayerMode === "fourHands") {
		// rules.md §15: player A has seats 1 and 3, player B seats 2 and 4.
		return [0, 1, 0, 1];
	}
	return Array.from({ length: players }, (_, seat) => seat);
}
