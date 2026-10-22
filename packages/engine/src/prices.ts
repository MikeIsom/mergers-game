import { chainTier, type ChainId, type Tier } from "./config.js";

const TIER_OFFSET: Record<Tier, number> = { minor: 0, medium: 100, major: 200 };

// rules.md §8: price of a minor-tier chain by size; medium adds $100, major adds $200.
function minorPrice(size: number): number {
	if (size <= 5) {
		return size * 100;
	}
	if (size <= 10) {
		return 600;
	}
	if (size <= 40) {
		return 700 + Math.floor((size - 11) / 10) * 100;
	}
	return 1000;
}

export function sharePrice(chain: ChainId, size: number): number {
	if (!Number.isInteger(size) || size < 2) {
		throw new Error(`A chain has at least 2 tiles, got ${size}`);
	}
	return minorPrice(size) + TIER_OFFSET[chainTier(chain)];
}

export function majorityBonus(chain: ChainId, size: number): number {
	return sharePrice(chain, size) * 10;
}

export function minorityBonus(chain: ChainId, size: number): number {
	return sharePrice(chain, size) * 5;
}
