function roundUpToHundred(amount: number): number {
	return Math.ceil(amount / 100) * 100;
}

/**
 * rules.md §10: majority and minority bonuses for one chain. `holdings[i]` is holder i's share
 * count; the result gives each holder's payout. Holders with no shares never receive anything.
 * Split amounts are rounded up to the next $100.
 */
export function computeBonuses(holdings: number[], majority: number, minority: number): number[] {
	const payouts = holdings.map(() => 0);
	const counts = [...new Set(holdings.filter((n) => n > 0))].sort((a, b) => b - a);
	const top = counts[0];
	if (top === undefined) {
		return payouts;
	}
	const firsts = holdings.flatMap((n, i) => (n === top ? [i] : []));
	const second = counts[1];
	if (firsts.length > 1 || second === undefined) {
		const share = roundUpToHundred((majority + minority) / firsts.length);
		for (const i of firsts) {
			payouts[i] = share;
		}
		return payouts;
	}
	payouts[firsts[0]!] = majority;
	const seconds = holdings.flatMap((n, i) => (n === second ? [i] : []));
	const share = roundUpToHundred(minority / seconds.length);
	for (const i of seconds) {
		payouts[i] = share;
	}
	return payouts;
}
