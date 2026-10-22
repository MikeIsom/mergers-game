import { activeChains, chainSize, endConditionHolds } from "./board.js";
import { payBonuses } from "./merger.js";
import { sharePrice } from "./prices.js";
import type { GameState } from "./types.js";

export type EndReason = "announced" | "condition" | "stall" | "dropped";

export function endConditionMet(state: GameState): boolean {
	return endConditionHolds(state.board, state.options.endSize);
}

/**
 * rules.md §11.1: the active player may announce once a condition holds, and only once. With
 * autoEnd (§15) the game ends by itself instead, so there is nothing to announce.
 */
export function canAnnounce(state: GameState): boolean {
	return !state.options.autoEnd && state.endAnnounced === null && endConditionMet(state);
}

/** rules.md §11.2. */
export function endGame(state: GameState, reason: EndReason): void {
	state.log.push({ type: "gameEnd", reason });
	const chains = activeChains(state.board);
	for (const chain of chains) {
		payBonuses(state, chain, chainSize(state.board, chain), "setAside");
	}
	state.seats.forEach((seat, index) => {
		for (const chain of chains) {
			const shares = seat.shares[chain];
			if (shares === 0) {
				continue;
			}
			const proceeds = shares * sharePrice(chain, chainSize(state.board, chain));
			seat.cash += proceeds;
			seat.shares[chain] = 0;
			state.bank[chain] += shares;
			state.log.push({ type: "finalSale", seat: index, chain, shares, proceeds });
		}
	});
	state.log.push({ type: "result", cash: state.seats.map((seat) => seat.cash), ranks: playerRankings(state) });
	state.phase = "ended";
	state.ended = true;
}

/**
 * What each real player is ranked by: their cash; with teamPlay at the end, their team's
 * combined cash (seats 1+3 and 2+4); in fourHands, the single richest seat they control.
 */
function playerValues(state: GameState): number[] {
	const cash = state.seats.map((seat) => seat.cash);
	if (state.options.teamPlay && state.ended) {
		return cash.map((_, seat) => cash[seat % 2]! + cash[(seat % 2) + 2]!);
	}
	return Array.from({ length: state.players }, (_, player) =>
		Math.max(...cash.filter((_, seat) => state.seatOwner[seat] === player))
	);
}

function hasDropped(state: GameState, player: number): boolean {
	return state.seatOwner.every((owner, seat) => owner !== player || state.seats[seat]!.dropped);
}

/**
 * rules.md §11.2.4: most money wins; equal values share the rank. Rank 1 is best.
 * rules.md §16: players who dropped rank below everyone who did not, sharing the next rank.
 */
export function playerRankings(state: GameState): number[] {
	const values = playerValues(state);
	const players = values.map((_, player) => player);
	const stayed = players.filter((player) => !hasDropped(state, player));
	// With teams, places are counted per team (players 1 and 2 stand for the two teams), so the
	// losing team comes second rather than third.
	const competitors =
		state.options.teamPlay && state.ended ? values.slice(0, 2) : stayed.map((player) => values[player]!);
	const ranks = players.map((player) => 1 + competitors.filter((other) => other > values[player]!).length);
	const lastStayed = Math.max(0, ...stayed.map((player) => ranks[player]!));
	return players.map((player) => (hasDropped(state, player) ? lastStayed + 1 : ranks[player]!));
}

/** rules.md §13: scores stay 0 during play while holdings are private. */
export function playerScores(state: GameState): number[] {
	if (!state.ended && !state.options.publicHoldings) {
		return Array.from({ length: state.players }, () => 0);
	}
	return playerValues(state);
}
