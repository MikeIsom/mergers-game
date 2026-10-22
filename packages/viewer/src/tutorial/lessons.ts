import type { TutorialOptions, TutorialStep } from "@boardgamers/protocol/tutorial";
import {
	allTiles,
	applyMove,
	CHAIN_IDS,
	currentSeat,
	initGame,
	parseTile,
	type GameState,
	type Move,
	type Shares,
} from "acquire-engine";
import { langFor, type Lang } from "../lib/format.ts";
import type { Locale, MessageKey } from "../lib/i18n.ts";

export const CHAPTERS = ["founding", "mergers", "scoring"] as const;
export type Chapter = (typeof CHAPTERS)[number];
const tile = (label: string) => parseTile(label)!;

const EXPLANATIONS = {
	founding: ["tiles", "tiers", "prices", "firstGrowth", "buyGrowth"],
	mergers: ["merger", "bonuses", "ties", "equalMerger", "survivorChoice", "keepShares", "afterTie"],
	scoring: ["safe", "growth", "settlement"],
} as const;

export function explanation(chapter: Chapter, index: number, lang: Lang): string {
	return lang.t(`tutorial.mechanics.${EXPLANATIONS[chapter][index]!}`);
}

export function preparedPosition(chapter: Chapter): GameState {
	const game = initGame(3, {}, `acquire-tutorial-${chapter}-1`);
	game.board.fill(null);
	game.activeSeat = 0;
	game.phase = "place";
	game.turn = 1;
	game.log = [{ type: "turn", seat: 0 }];
	game.seats.forEach((seat, index) => {
		seat.name = ["Alex", "Bo", "Cy"][index]!;
		seat.hand = [tile(["2A", "12I", "10I"][index]!)];
		for (const chain of CHAIN_IDS) {
			seat.shares[chain] = 0;
		}
	});
	if (chapter === "founding") {
		game.board[tile("1A")] = "loose";
		game.seats[0]!.hand.push(tile("3A"));
	} else if (chapter === "mergers") {
		for (const label of ["1A", "2A", "3A"]) {
			game.board[tile(label)] = "tower";
		}
		for (const label of ["5A", "6A"]) {
			game.board[tile(label)] = "luxor";
		}
		for (const label of ["6F", "7F"]) {
			game.board[tile(label)] = "worldwide";
		}
		for (const label of ["9F", "10F"]) {
			game.board[tile(label)] = "festival";
		}
		game.seats[0]!.shares.festival = 1;
		game.seats[0]!.hand = [tile("4A"), tile("8F")];
		game.seats.forEach((seat, index) => {
			seat.shares.luxor = [3, 2, 1][index]!;
		});
	} else {
		for (let column = 1; column <= 11; column++) {
			game.board[tile(`${column}A`)] = "tower";
		}
		game.seats[0]!.hand = [tile("12A")];
		game.seats.forEach((seat, index) => {
			seat.shares.tower = [4, 2, 1][index]!;
		});
	}
	for (const chain of CHAIN_IDS) {
		game.bank[chain] = 25 - game.seats.reduce((sum, seat) => sum + seat.shares[chain], 0);
	}
	const held = new Set(game.seats.flatMap((seat) => seat.hand));
	game.pool = allTiles().filter((entry) => game.board[entry] === null && !held.has(entry));
	return game;
}

function step(
	lang: Lang,
	chapter: Chapter,
	index: number,
	accept: (move: Move) => boolean
): TutorialStep<GameState, Move> {
	const text = lang.t(`tutorial.${chapter}.${index}` as MessageKey);
	return {
		id: `${chapter}-${index}`,
		title: lang.t(`tutorial.${chapter}.title`),
		text,
		complete: () => true,
		validateMove: (_state, move) => (accept(move) ? undefined : text),
	};
}
const buy = (shares: Partial<Shares>, move: Move) =>
	move.type === "buy" && CHAIN_IDS.every((chain) => (move.shares[chain] ?? 0) === (shares[chain] ?? 0));

export function lesson(chapter: Chapter, locale: Locale): TutorialOptions<GameState, Move> {
	const lang = langFor(locale);
	const steps =
		chapter === "founding"
			? [
					step(lang, chapter, 0, (move) => move.type === "place" && move.tile === "2A"),
					step(lang, chapter, 1, (move) => move.type === "found" && move.chain === "tower"),
					step(lang, chapter, 2, (move) => buy({ tower: 2 }, move)),
					step(lang, chapter, 3, (move) => move.type === "place" && move.tile === "3A"),
					step(lang, chapter, 4, (move) => buy({ tower: 1 }, move)),
				]
			: chapter === "mergers"
				? [
						step(lang, chapter, 0, (move) => move.type === "place" && move.tile === "4A"),
						step(lang, chapter, 1, (move) => move.type === "dispose" && move.sell === 1 && move.trade === 2),
						step(lang, chapter, 2, (move) => buy({}, move)),
						step(lang, chapter, 3, (move) => move.type === "place" && move.tile === "8F"),
						step(lang, chapter, 4, (move) => move.type === "survivor" && move.chain === "worldwide"),
						step(lang, chapter, 5, (move) => move.type === "dispose" && move.sell === 0 && move.trade === 0),
						step(lang, chapter, 6, (move) => buy({}, move)),
					]
				: [
						step(lang, chapter, 0, (move) => move.type === "announce"),
						step(lang, chapter, 1, (move) => move.type === "place" && move.tile === "12A"),
						step(lang, chapter, 2, (move) => buy({}, move)),
					];
	return {
		game: "acquire",
		id: chapter,
		version: chapter === "scoring" ? 1 : 2,
		initialState: () => preparedPosition(chapter),
		move(state, move) {
			const nextRound = chapter !== "scoring" && state.turn === 1 && move.type === "buy";
			applyMove(state, move, 0);
			while (state.phase === "dispose" && currentSeat(state) !== 0) {
				applyMove(state, { type: "dispose", sell: 0, trade: 0 }, currentSeat(state)!);
			}
			if (nextRound) {
				// Two quiet opponent turns bring the learner back to the next prepared tile.
				for (const [seat, label] of [
					[1, "12I"],
					[2, "10I"],
				] as const) {
					applyMove(state, { type: "place", tile: label }, seat);
					applyMove(state, { type: "buy", shares: {} }, seat);
				}
			}
			return state;
		},
		steps,
		completion: { title: lang.t("tutorial.complete"), text: lang.t(`tutorial.${chapter}.done`) },
	};
}
