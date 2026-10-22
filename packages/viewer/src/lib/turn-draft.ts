import type { GameState, Move, TurnRequest } from "acquire-engine";

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
