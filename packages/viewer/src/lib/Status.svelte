<script lang="ts">
	import { currentSeat, playerRankings, playerScores, type GameState } from "acquire-engine";
	import { pendingDecision } from "./format";
	import PlayerName from "./PlayerName.svelte";
	import { useStore } from "./store.svelte";

	let { state, seats }: { state: GameState; seats: number[] } = $props();

	const store = useStore();
	const t = $derived(store.lang.t);
	const replaying = $derived(store.replayAt !== undefined);
	const replayTurn = $derived(state.log.filter((entry) => entry.type === "turn").length);
	const yourMove = $derived(!replaying && seats.includes(currentSeat(state) ?? -1));
	const results = $derived(
		state.ended
			? playerScores(state)
					.map((score, player) => ({
						player,
						score,
						rank: playerRankings(state)[player]!,
						seat: state.seatOwner.indexOf(player),
					}))
					.sort((a, b) => a.rank - b.rank)
			: []
	);
</script>

<section class="status" class:yours={yourMove} aria-live="polite">
	{#if replaying}
		<p class="pending">{t("status.replay", { turn: replayTurn })}</p>
		<p class="note">{t("status.replayNote")}</p>
	{:else}
		<p class="pending">
			{pendingDecision(state, store.lang)}{#if yourMove}<span class="you">{t("status.yourDecision")}</span>{/if}
		</p>
	{/if}
	{#if !replaying && state.endAnnounced !== null && !state.ended}
		<p class="note">{t("status.announced")}</p>
	{/if}
	{#if !replaying && state.ended}
		<ol class="results">
			{#each results as result (result.player)}
				<li>
					<span class="rank">{result.rank}.</span>
					<PlayerName {state} seat={result.seat} playerOnly />
					<span class="score">{store.lang.money(result.score)}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.status {
		background: var(--panel);
		padding: 8px 10px;
		margin: 0 0 12px;
		box-shadow: inset 4px 0 0 var(--gap);
	}
	.status.yours {
		box-shadow: inset 6px 0 0 var(--accent);
	}
	.pending {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.you {
		margin-left: 8px;
		font-weight: 400;
		font-size: 14px;
		color: var(--ink-muted);
	}
	.note {
		margin: 4px 0 0;
		font-size: 14px;
	}
	.results {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
	}
	.rank {
		display: inline-block;
		width: 24px;
		font-weight: 700;
	}
	.score {
		font-variant-numeric: tabular-nums;
		margin-left: 6px;
	}
</style>
