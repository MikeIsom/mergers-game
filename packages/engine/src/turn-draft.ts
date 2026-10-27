import { applyMove, currentSeat } from "./moves.js";
import type { GameState, TurnRequest } from "./types.js";

// Bound untrusted request work while allowing many optional swaps in a private turn.
export const MAX_TURN_MOVES = 256;

/** A private draft ends before any new hidden information or another decision is exposed. */
export function draftCanContinue(before: GameState, after: GameState, player: number): boolean {
	const next = currentSeat(after);
	return (
		!after.ended &&
		after.turn === before.turn &&
		next !== undefined &&
		after.seatOwner[next] === player &&
		!after.log
			.slice(before.log.length)
			.some(
				(entry) =>
					entry.type === "bonuses" ||
					entry.type === "bankTile" ||
					entry.type === "drew" ||
					(entry.type === "move" && after.seatOwner[entry.seat] !== player)
			)
	);
}

export function applyTurnRequest(data: GameState, raw: TurnRequest, player: number): GameState {
	if (raw.from !== data.log.length || data.tentative) {
		throw new Error("The game changed. Start again from the current position.");
	}
	if (!Array.isArray(raw.moves) || raw.moves.length === 0 || raw.moves.length > MAX_TURN_MOVES) {
		throw new Error("Invalid turn draft");
	}
	// Validate the entire request on a copy, including its commit boundary.
	const result = structuredClone(data);
	let tentative = false;
	for (let i = 0; i < raw.moves.length; i++) {
		const seat = currentSeat(result);
		if (seat === undefined || result.seatOwner[seat] !== player) {
			throw new Error("It is not your turn");
		}
		const before = structuredClone(result);
		applyMove(result, raw.moves[i], seat);
		tentative = draftCanContinue(before, result, player);
		if (!tentative && i < raw.moves.length - 1) {
			throw new Error("The turn draft continues past a committed decision");
		}
	}
	if (tentative) {
		result.tentative = { player, from: raw.from };
	}
	return result;
}

/** One time increment per completed turn, plus opponents' merger disposal decisions. */
export function earnedTimeIncrements(state: GameState): number[] {
	const counts = Array<number>(state.players).fill(0);
	let owner: number | undefined;
	let acted = false;
	const finish = () => {
		if (acted && owner !== undefined) {
			counts[owner]!++;
		}
		acted = false;
	};
	for (const entry of state.log) {
		if (entry.type === "turn") {
			finish();
			owner = state.seatOwner[entry.seat];
		} else if (entry.type === "gameEnd") {
			finish();
		} else if (entry.type === "move" && !entry.auto) {
			const player = state.seatOwner[entry.seat]!;
			if (player === owner) {
				acted = true;
			} else if (entry.move.type === "dispose") {
				counts[player]!++;
			}
		}
	}
	return counts;
}

export function isTurnRequest(raw: unknown): raw is TurnRequest {
	return typeof raw === "object" && raw !== null && "type" in raw && raw.type === "turn";
}
