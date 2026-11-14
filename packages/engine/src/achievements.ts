import type { AchievementManifest, SeatAchievements } from "@boardgamers/protocol/engine";
import { playerRankings } from "./scoring.js";
import type { GameState } from "./types.js";

/** Stable game-local IDs. Never repurpose an ID; definition changes require a revision bump. */
export function achievementDefinitions(): AchievementManifest {
	const definitions: [string, string, string, string][] = [
		["win", "Hotel magnate", "Win a completed game, including a shared victory.", "WIN"],
		...[2, 3, 4, 5, 6].map((n): [string, string, string, string] => [
			`win-${n}-players`,
			`${n}-player victor`,
			`Win a completed ${n}-player game, including a shared victory.`,
			"WIN",
		]),
		["team-win", "Partners in profit", "Win a completed team game, including a shared victory.", "DEAL"],
		["four-hands-win", "Two portfolios", "Win a completed four-hands game, including a shared victory.", "WIN"],
		[
			"found-three-chains",
			"Hotel developer",
			"Found three distinct hotel chains with one seat in a completed game.",
			"HOTL",
		],
		[
			"make-merger",
			"Deal maker",
			"Place a tile that triggers a merger in a completed game (bank tiles excluded).",
			"DEAL",
		],
		[
			"three-chain-merger",
			"Big deal",
			"Place a tile merging at least three chains in a completed game (bank tiles excluded).",
			"DEAL",
		],
		[
			"trade-six-shares",
			"Trade up",
			"Trade at least six defunct shares for survivor stock in one merger disposal in a completed game.",
			"SWAP",
		],
		[
			"ten-share-investor",
			"Major investor",
			"Sell at least ten shares of one chain from one seat at final scoring.",
			"10",
		],
		[
			"three-chain-portfolio",
			"Diversified portfolio",
			"Sell shares of at least three distinct chains from one seat at final scoring.",
			"3",
		],
		[
			"luxury-investor",
			"Luxury investor",
			"Sell at least ten Imperial or ten Continental shares from one seat at final scoring.",
			"HOTL",
		],
		[
			"thirty-thousand",
			"Growing fortune",
			"Finish a completed game with at least $30,000 cash in one seat after final scoring.",
			"CASH",
		],
		[
			"fifty-thousand",
			"Hotel fortune",
			"Finish a completed game with at least $50,000 cash in one seat after final scoring.",
			"CASH",
		],
	];
	return {
		revision: 1,
		achievements: definitions.map(([id, name, description, text]) => ({
			id: id!,
			name: name!,
			description: description!,
			icon: { type: "text", text: text! },
		})),
	};
}

/** Pure projection of the complete serialized engine state, never a stripped/private view.
 * BGS owns account/bot eligibility and platform-only cancellation/analysis/practice metadata.
 * No new state or counters: committed events are already persisted even with limitedLog.
 */
export function achievements(data: GameState): SeatAchievements[] {
	if (!data.ended || data.phase !== "ended" || data.tentative || data.seed.startsWith("acquire-tutorial-")) {
		return [];
	}
	// These are not native Acquire fields; fail closed if a host supplies explicit markers.
	const markers = data as GameState & Record<string, unknown>;
	if (["cancelled", "canceled", "analysis", "practice", "tutorial"].some((key) => markers[key] === true)) {
		return [];
	}
	if (data.log.at(-1)?.type !== "result" || !data.log.some((entry) => entry.type === "gameEnd")) {
		return [];
	}
	const ranks = playerRankings(data); // Includes team/four-hands rules and dropped-player demotion.
	const order = achievementDefinitions().achievements.map(({ id }) => id);
	return Array.from({ length: data.players }, (_, player) => {
		const seats = data.seats.flatMap((seat, index) =>
			data.seatOwner[index] === player && !seat.dropped ? [index] : []
		);
		const earned = new Set<string>();
		const win = seats.length > 0 && ranks[player] === 1;
		if (win) {
			earned.add("win");
			earned.add(`win-${data.players}-players`);
			if (data.options.teamPlay) {
				earned.add("team-win");
			}
			if (data.players === 2 && data.options.twoPlayerMode === "fourHands") {
				earned.add("four-hands-win");
			}
		}
		for (const seat of seats) {
			const founded = new Set<string>();
			const sold = new Set<string>();
			for (const entry of data.log) {
				if (!("seat" in entry) || entry.seat !== seat) {
					continue;
				}
				if (entry.type === "founded") {
					founded.add(entry.chain);
				}
				if (entry.type === "merger" && !entry.byBank) {
					earned.add("make-merger");
					if (Object.keys(entry.sizes).length >= 3) {
						earned.add("three-chain-merger");
					}
				}
				if (entry.type === "disposed" && entry.traded >= 6) {
					earned.add("trade-six-shares");
				}
				if (entry.type === "finalSale" && entry.shares > 0) {
					sold.add(entry.chain);
					if (entry.shares >= 10) {
						earned.add("ten-share-investor");
						if (entry.chain === "imperial" || entry.chain === "continental") {
							earned.add("luxury-investor");
						}
					}
				}
			}
			if (founded.size >= 3) {
				earned.add("found-three-chains");
			}
			if (sold.size >= 3) {
				earned.add("three-chain-portfolio");
			}
			if (data.seats[seat]!.cash >= 30000) {
				earned.add("thirty-thousand");
			}
			if (data.seats[seat]!.cash >= 50000) {
				earned.add("fifty-thousand");
			}
		}
		return { seat: player, earned: order.filter((id) => earned.has(id)), outcome: win ? "win" : "loss" };
	});
}
