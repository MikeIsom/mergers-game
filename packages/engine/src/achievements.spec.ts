import assert from "node:assert/strict";
import { test } from "node:test";
import { achievementManifestSchema, achievementResultsSchema } from "@boardgamers/protocol/achievements";
import type { Engine } from "@boardgamers/protocol/engine";
import * as wrapper from "../wrapper.js";
import { legalMoves } from "./legal.js";
import { endGame } from "./scoring.js";
import { chainAt, checkInvariants, row, scenario as createScenario, type Scenario } from "./test/helpers.js";
import type { GameState } from "./types.js";

const contract: Pick<Engine<GameState>, "achievementDefinitions" | "achievements"> = wrapper;
const manifest = wrapper.achievementDefinitions();
const earned = (state: GameState, seat = 0) => wrapper.achievements(state).find((r) => r.seat === seat)!.earned;
function scenario(spec: Scenario): GameState {
	return createScenario({ hands: [["12I"], ["12G"], ["10I"], ["10G"], ["8I"], ["8G"]], ...spec });
}
function finish(state: GameState): GameState {
	assert.equal(state.ended, false);
	endGame(state, "stall");
	checkInvariants(state);
	return state;
}

test("official protocol 0.11 manifest/results, fresh definitions and stable IDs", () => {
	assert.ok(contract.achievements);
	achievementManifestSchema.parse(manifest);
	assert.equal(manifest.revision, 2);
	assert.equal(manifest.achievements.length, 17);
	assert.equal(new Set(manifest.achievements.map((d) => d.id)).size, 17);
	for (const { id } of manifest.achievements) {
		assert.match(id, /^[a-z][a-z0-9-]{0,63}$/);
	}
	const changed = wrapper.achievementDefinitions();
	changed.achievements.pop();
	assert.deepEqual(wrapper.achievementDefinitions(), manifest);
	const state = finish(scenario({ cash: [7000, 6000, 6000] }));
	achievementResultsSchema(manifest, state.players).parse(wrapper.achievements(state));
});

test("player counts, ties, team winners and four-hands original player mapping", () => {
	for (const players of [2, 3, 4, 5, 6]) {
		const state = finish(scenario({ seats: players }));
		for (const result of wrapper.achievements(state)) {
			assert.equal(result.outcome, "win"); // Rules §11.2.4: shared victory, not draw.
			assert.deepEqual(result.earned, ["win", `win-${players}-players`]);
		}
	}
	const team = finish(scenario({ seats: 4, options: { teamPlay: true }, cash: [6000, 10000, 6000, 1000] }));
	assert.deepEqual(
		wrapper.achievements(team).map((r) => r.outcome),
		["win", "loss", "win", "loss"]
	);
	assert.ok(earned(team, 2).includes("team-win"));
	const four = finish(scenario({ options: { twoPlayerMode: "fourHands" }, cash: [6000, 10000, 11000, 10000] }));
	assert.deepEqual(
		wrapper.achievements(four).map((r) => [r.seat, r.outcome]),
		[
			[0, "win"],
			[1, "loss"],
		]
	);
	assert.ok(earned(four).includes("four-hands-win"));
});

test("cash thresholds are per internal seat and independent of victory", () => {
	for (const cash of [29900, 30000, 49900, 50000]) {
		const state = finish(scenario({ cash: [cash, 60000, 6000] }));
		assert.equal(earned(state).includes("thirty-thousand"), cash >= 30000);
		assert.equal(earned(state).includes("fifty-thousand"), cash >= 50000);
		assert.equal(earned(state).includes("win"), false);
	}
	const four = finish(scenario({ options: { twoPlayerMode: "fourHands" }, cash: [15000, 6000, 15000, 6000] }));
	assert.equal(earned(four).includes("thirty-thousand"), false);
});

test("final liquidation thresholds use real settlement events, not remaining defunct stock", () => {
	for (const shares of [9, 10]) {
		const state = finish(
			scenario({
				board: {
					...chainAt("imperial", ["1A", "2A"]),
					...chainAt("tower", ["1C", "2C"]),
					...chainAt("luxor", ["1E", "2E"]),
				},
				shares: [{ imperial: shares, tower: 1, luxor: 1, continental: 10 }],
			})
		);
		assert.equal(state.seats[0]!.shares.imperial, 0);
		assert.equal(earned(state).includes("ten-share-investor"), shares === 10);
		assert.equal(earned(state).includes("luxury-investor"), shares === 10);
		assert.ok(earned(state).includes("three-chain-portfolio"));
	}
	const two = finish(
		scenario({
			board: { ...chainAt("tower", ["1A", "2A"]), ...chainAt("luxor", ["1C", "2C"]) },
			shares: [{ tower: 10, luxor: 1, imperial: 10 }],
		})
	);
	assert.equal(earned(two).includes("three-chain-portfolio"), false);
	assert.equal(earned(two).includes("luxury-investor"), false);
});

test("legal mergers and disposal boundaries; bank-triggered mergers do not count", () => {
	for (const trade of [4, 6]) {
		for (const chains of [2, 3]) {
			const state = scenario({
				board: {
					...chainAt("tower", row("E", 1, 4)),
					...chainAt("luxor", row("E", 6, 8)),
					...(chains === 3 ? chainAt("festival", ["5F", "5G"]) : {}),
				},
				hands: [["5E"], ["12I"], ["12G"]],
				shares: [{ luxor: 6 }],
			});
			wrapper.move(state, { type: "place", tile: "5E" }, 0);
			wrapper.move(state, { type: "dispose", sell: 0, trade }, 0);
			finish(state);
			assert.ok(earned(state).includes("make-merger"));
			assert.equal(earned(state).includes("three-chain-merger"), chains === 3);
			assert.equal(earned(state).includes("trade-six-shares"), trade === 6);
			assert.equal(earned(state, 1).includes("make-merger"), false);
			// Same documented event shape produced by the bank-tile path.
			for (const event of state.log) {
				if (event.type === "merger") {
					event.byBank = true;
				}
			}
			assert.equal(earned(state).includes("make-merger"), false);
			assert.equal(earned(state).includes("three-chain-merger"), false);
		}
	}
});

test("finished serialized legal games preserve purity, replay, and distinct founding evidence", () => {
	const witnessed = new Set<string>();
	for (let seed = 0; seed < 12; seed++) {
		const state = wrapper.init(3, [], { autoEnd: true, limitedLog: true }, `achievements-${seed}`);
		let rng = seed + 1;
		for (let steps = 0; !state.ended; steps++) {
			assert.ok(steps < 5000);
			rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
			const moves = legalMoves(state);
			wrapper.move(state, moves[rng % moves.length]!, wrapper.currentPlayer(state)!);
		}
		checkInvariants(state);
		const before = JSON.stringify(state);
		const result = wrapper.achievements(JSON.parse(before) as GameState);
		achievementResultsSchema(manifest, 3).parse(result);
		assert.deepEqual(wrapper.achievements(state), result);
		assert.equal(JSON.stringify(state), before);
		assert.deepEqual(wrapper.achievements(wrapper.replay(state)), result);
		for (const record of result) {
			const distinct = new Set(
				state.log.flatMap((e) => (e.type === "founded" && e.seat === record.seat ? [e.chain] : []))
			);
			assert.equal(record.earned.includes("found-three-chains"), distinct.size >= 3);
			record.earned.forEach((id) => witnessed.add(id));
		}
	}
	assert.ok(witnessed.has("found-three-chains"));
});

test("unfinished, preview, tutorial, explicit host exclusions and unsettled states earn nothing", () => {
	const state = scenario({});
	assert.deepEqual(wrapper.achievements(state), []);
	finish(state);
	for (const patch of [
		{ tentative: { player: 0, from: 0 } },
		{ seed: "acquire-tutorial-scoring-1" },
		{ cancelled: true },
		{ canceled: true },
		{ analysis: true },
		{ practice: true },
		{ tutorial: true },
		{ phase: "buy" },
		{ log: [] },
		{ log: state.log.filter((entry) => entry.type !== "gameEnd") },
		{ log: state.log.filter((entry) => entry.type !== "result") },
	]) {
		assert.deepEqual(wrapper.achievements({ ...state, ...patch } as GameState), []);
	}
});

test("four-hands feat attribution is original-seat based without pooling portfolios", () => {
	const state = finish(
		scenario({
			options: { twoPlayerMode: "fourHands" },
			board: {
				...chainAt("imperial", ["1A", "2A"]),
				...chainAt("tower", ["1C", "2C"]),
				...chainAt("luxor", ["1E", "2E"]),
			},
			shares: [{ tower: 1, luxor: 1 }, {}, { imperial: 10 }, {}],
		})
	);
	assert.ok(earned(state, 0).includes("luxury-investor"));
	assert.equal(earned(state, 1).includes("luxury-investor"), false);
	assert.equal(earned(state, 0).includes("three-chain-portfolio"), false);
});

test("real drop path ends four hands and excludes both dropped internal seats", () => {
	const state = scenario({ options: { twoPlayerMode: "fourHands" }, cash: [60000, 6000, 60000, 6000] });
	wrapper.dropPlayer(state, 0);
	checkInvariants(state);
	assert.equal(state.ended, true);
	assert.deepEqual(wrapper.achievements(state)[0], { seat: 0, earned: [], outcome: "loss" });
	assert.equal(wrapper.achievements(state).length, 2);
	assert.equal(wrapper.achievements(state)[1]!.outcome, "win");
});

test("dropped players cannot earn automatic-play feats or win, and outcomes are not bot-promoted", () => {
	const state = scenario({ cash: [60000, 6000, 7000] });
	state.seats[0]!.dropped = true;
	finish(state);
	assert.deepEqual(wrapper.achievements(state)[0], { seat: 0, earned: [], outcome: "loss" });
	assert.equal(wrapper.achievements(state)[1]!.outcome, "loss");
	assert.equal(wrapper.achievements(state)[2]!.outcome, "win");
});
