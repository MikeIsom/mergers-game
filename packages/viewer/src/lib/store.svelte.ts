import { getContext } from "svelte";
import type { PlayerAppearance } from "@boardgamers/protocol";
import { ChatController } from "@boardgamers/protocol/chat";
import { seatsOf, type GameState, type Move, type Tile } from "acquire-engine";
import { movesFor } from "./decisions";
import { langFor } from "./format";
import { isRightToLeft, type Locale } from "./i18n";
import { replayStart, replayView } from "./replay";

/** Context key: the store is given to every component at mount, for viewer-wide settings. */
export const STORE = Symbol("viewer-store");

export function useStore(): ViewerStore {
	return getContext<ViewerStore>(STORE);
}

export class ViewerStore {
	state = $state<GameState | undefined>();
	/** The viewer's BGS player index; undefined for a spectator. */
	player = $state<number | undefined>();
	/** The internal seats this player controls (two in fourHands, none for a spectator). */
	seats = $derived(this.state ? seatsOf(this.state, this.player) : []);
	/** BGS replay: the log position being shown, or undefined when showing the live game. */
	replayAt = $state<number | undefined>();
	/** What the viewer shows: the live state, or the replayed position. */
	view = $derived(
		this.state && this.replayAt !== undefined ? replayView(this.state, this.player, this.replayAt) : this.state
	);
	/** Completed tutorials keep reference controls usable but no longer accept game moves. */
	readOnly = $state(false);
	/** Legal moves for this viewer right now, straight from the engine. */
	moves = $derived(this.state && this.replayAt === undefined && !this.readOnly ? movesFor(this.state, this.seats) : []);
	/** A tile chosen in the hand but not yet placed. */
	selected = $state<Tile | undefined>();
	/** Player avatars from BGS, in player order. */
	avatars = $state<string[]>([]);
	/** BGS player appearance (colours, symbols, Supporter badges), in player order; cosmetic only. */
	appearance = $state<PlayerAppearance | undefined>();
	/** BGS interface language (preferences.locale), English until BGS sends one. */
	locale = $state<Locale>("en");
	/** Text helpers in the current language. */
	lang = $derived(langFor(this.locale));
	rightToLeft = $derived(isRightToLeft(this.locale));
	/** True in a BGS analysis sandbox, where live chat is hidden. */
	analysis = $state(false);
	/** The shared BGS chat, one controller per viewer launch. */
	readonly chat = new ChatController();
	/** BGS's shared colour-blind setting: adds a pattern to every chain tile and table marker. */
	colorBlind = $state(false);
	/** The BGS light/dark setting; undefined until BGS sends one (prefers-color-scheme applies). */
	theme = $state<"light" | "dark" | undefined>();
	/** True between sending a move and receiving the resulting state, so it cannot be sent twice. */
	sending = $state(false);

	constructor(private readonly sendMove: (move: Move) => boolean) {}

	setState(state: GameState): void {
		this.state = state;
		this.selected = undefined;
		this.sending = false;
	}

	/** The replay range BGS shows in its controls: setup done, up to the live position. */
	replayRange(): { start: number; end: number } {
		return { start: replayStart(this.state!), end: this.state!.log.length };
	}

	send(move: Move): void {
		if (this.sending || this.readOnly) {
			return;
		}
		this.sending = this.sendMove($state.snapshot(move));
	}
}
