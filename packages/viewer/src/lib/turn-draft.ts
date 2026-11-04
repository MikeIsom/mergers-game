import { applyMove, currentSeat, draftCanContinue, type GameState, type Move, type TurnRequest } from "acquire-engine";

/** What sending a move would do to the acting player's private turn draft. */
export interface MoveOutcome {
	/** Undo stops here: hidden information, another player's decision or the turn's end follows. */
	commits: boolean;
	/** The acting seat's own turn passes on (tiles are drawn) or the game ends. */
	endsTurn: boolean;
	/** Known to end the game; a dropped player's automatic turn afterwards is not foreseen. */
	endsGame: boolean;
}

/**
 * Predicts the commit boundary of `move` with the engine's own draftCanContinue, on a throwaway
 * copy of the player's view. Everything that decides the boundary is visible to the acting
 * player (merger plans and disposer lists, their own hand and cash, waiting bank tiles, end
 * conditions); numbers derived from hidden values on the copy are discarded unseen.
 */
export function moveOutcome(view: GameState, move: Move, player: number | undefined): MoveOutcome {
	const seat = currentSeat(view);
	try {
		if (seat === undefined || player === undefined) {
			throw new Error("Not acting");
		}
		const copy = structuredClone(view);
		// Dropped players' automatic moves would use their hidden hands and cash; stopping before
		// them still shows the boundary, since a move by another seat always commits.
		copy.seats.forEach((other) => (other.dropped = false));
		const after = applyMove(copy, structuredClone(move), seat);
		return {
			commits: !draftCanContinue(view, after, player),
			endsTurn: seat === view.activeSeat && (after.ended || after.turn !== view.turn),
			endsGame: after.ended,
		};
	} catch {
		// Buying always ends the turn; anything else unexpected is treated as final.
		return { commits: true, endsTurn: move.type === "buy", endsGame: false };
	}
}

/** Log entries of the turn in progress: everything after its "turn" heading. */
export function currentTurnEntries(state: GameState): GameState["log"] {
	const start = state.log.map((entry) => entry.type).lastIndexOf("turn");
	return state.log.slice(start + 1);
}

/**
 * Which confirmation a move needs before it is sent: a turn summary when it ends the turn
 * (except a lone placement, which has its own confirmation), or a final-step warning when a
 * placement would make earlier undoable moves permanent. Merger decisions confirm in place.
 */
export function reviewFor(
	view: GameState,
	move: Move,
	outcome: MoveOutcome,
	undoable: number
): "end" | "commit" | undefined {
	if (outcome.endsTurn) {
		const seat = currentSeat(view);
		const earlier = currentTurnEntries(view).some(
			(entry) => entry.type === "move" && entry.seat === seat && !entry.auto
		);
		return earlier || (move.type !== "place" && move.type !== "pass") ? "end" : undefined;
	}
	return outcome.commits && undoable > 0 && move.type === "place" ? "commit" : undefined;
}

/** Only server-validated private views are cached; hidden holdings are never simulated here. */
export class TurnDraft {
	base?: GameState;
	private moves: Move[] = [];
	private previews: GameState[] = [];
	pending?: TurnRequest;

	get count(): number {
		return this.moves.length;
	}

	reset(): void {
		this.base = undefined;
		this.moves = [];
		this.previews = [];
		this.pending = undefined;
	}

	committed(state: GameState): boolean {
		// BGS can refresh the saved state while a private choice is being previewed.
		if ((this.count > 0 || this.pending) && JSON.stringify(state) === JSON.stringify(this.base)) {
			return false;
		}
		this.reset();
		this.base = structuredClone(state);
		return true;
	}

	begin(move: Move): TurnRequest {
		if (!this.base || this.pending) {
			throw new Error("No available turn draft");
		}
		this.pending = { type: "turn", from: this.base.log.length, moves: [...this.moves, move] };
		return structuredClone(this.pending);
	}

	accept(state: GameState, player: number | undefined): boolean {
		if (
			!this.pending ||
			!this.base ||
			state.tentative?.player !== player ||
			state.tentative?.from !== this.pending.from
		) {
			return false;
		}
		const moves = state.log
			.slice(this.pending.from)
			.flatMap((entry) => (entry.type === "move" && !entry.auto ? [entry.move] : []));
		if (JSON.stringify(moves) !== JSON.stringify(this.pending.moves)) {
			return false;
		}
		this.moves = this.pending.moves;
		this.previews.push(structuredClone(state));
		this.pending = undefined;
		return true;
	}

	reject(move: unknown): boolean {
		if (JSON.stringify(move) !== JSON.stringify(this.pending)) {
			return false;
		}
		this.pending = undefined;
		return true;
	}

	undo(): GameState | undefined {
		if (this.pending || !this.count) {
			return undefined;
		}
		this.moves.pop();
		this.previews.pop();
		return structuredClone(this.previews.at(-1) ?? this.base!);
	}
}
