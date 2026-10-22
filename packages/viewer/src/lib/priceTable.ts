// The information card's price table (rules.md §8), generated from the engine's price functions
// and chain config so the viewer never holds its own copy of the numbers.
import { CHAINS, TILE_COUNT, majorityBonus, minorityBonus, sharePrice, type ChainId, type Tier } from "acquire-engine";

export const TIERS: Tier[] = ["minor", "medium", "major"];

/** Chain sizes in one tier that share a price: `to` is null for an open-ended range ("41+"). */
export interface SizeRange {
	from: number;
	to: number | null;
}

export interface PriceRow {
	price: number;
	first: number;
	second: number;
	sizes: Record<Tier, SizeRange | null>;
}

export function chainsInTier(tier: Tier): ChainId[] {
	return CHAINS.filter((chain) => chain.tier === tier).map((chain) => chain.id);
}

/** Every price row, cheapest first, with each tier's size range for that price. */
export function priceTable(): PriceRow[] {
	const rows = new Map<number, PriceRow>();
	for (const tier of TIERS) {
		const chain = chainsInTier(tier)[0]!;
		for (let size = 2; size <= TILE_COUNT; size++) {
			const price = sharePrice(chain, size);
			let row = rows.get(price);
			if (!row) {
				row = {
					price,
					first: majorityBonus(chain, size),
					second: minorityBonus(chain, size),
					sizes: { minor: null, medium: null, major: null },
				};
				rows.set(price, row);
			}
			const range = row.sizes[tier];
			if (range) {
				range.to = size === TILE_COUNT ? null : size;
			} else {
				row.sizes[tier] = { from: size, to: size === TILE_COUNT ? null : size };
			}
		}
	}
	return [...rows.values()].sort((a, b) => a.price - b.price);
}

export function rangeLabel(range: SizeRange | null): string {
	if (!range) {
		return "—";
	}
	if (range.to === null) {
		return `${range.from}+`;
	}
	return range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`;
}

/** The row a chain of this tier and size falls in. */
export function rowIndexFor(table: PriceRow[], tier: Tier, size: number): number {
	return table.findIndex((row) => {
		const range = row.sizes[tier];
		return range !== null && size >= range.from && (range.to === null || size <= range.to);
	});
}
