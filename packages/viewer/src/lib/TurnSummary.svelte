<script lang="ts">
	import HoldingChange from "./HoldingChange.svelte";
	import LogParts from "./LogParts.svelte";
	import UndoButton from "./UndoButton.svelte";
	import type { ViewerStore } from "./store.svelte";
	import { holdingsAfter, moveEffect, turnSummary } from "./turn-summary";

	let { store }: { store: ViewerStore } = $props();

	const review = $derived(store.review!);
	const game = $derived(store.state!);
	const t = $derived(store.lang.t);
	// Without private drafts every sent move is already final, so nothing is greyed out.
	const lines = $derived(turnSummary(game, review.move, store.lang, store.drafting ? store.undoFrom : 0));
	const effect = $derived(moveEffect(game, review.move));
	const holdings = $derived(effect && holdingsAfter(game, effect));
	const mixed = $derived(store.canUndo && lines.some((line) => line.final));
	const note = $derived(
		review.outcome.endsGame ? t("turn.gameEnds") : review.kind === "end" ? t("turn.endNote") : t("turn.finalStep")
	);
</script>

<section class="panel turn-summary" aria-label={t("turn.summary")}>
	<div class="head">
		<h3>{t("turn.summary")}</h3>
		{#if store.canUndo}<UndoButton {store} />{/if}
	</div>
	<ol class="lines">
		{#each lines as line (line.key)}
			<li class:final={line.final} class:pending={line.pending}><LogParts {game} parts={line.parts} /></li>
		{/each}
	</ol>
	{#if mixed}<p class="note">{t("turn.finalLines")}</p>{/if}
	{#if holdings}
		<HoldingChange label={t("turn.after")} cash={holdings.cash} shares={holdings.shares} />
	{/if}
	<p class="note warning">{note}</p>
	<div class="actions">
		<button type="button" class="actionable primary" onclick={() => store.send(review.move, true)}
			>{review.kind === "commit" && review.move.type === "place"
				? t("place.button", { tile: review.move.tile })
				: t("turn.end")}</button
		>
		<button type="button" class="actionable" onclick={() => (store.review = undefined)}>{t("turn.back")}</button>
	</div>
</section>

<style>
	.turn-summary {
		background: var(--panel);
		padding: 10px 12px 12px;
		margin: 0 0 12px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h3 {
		margin: 0;
		font-size: 15px;
	}
	.lines {
		list-style: none;
		margin: 6px 0 8px;
		padding: 0;
		font-size: 14px;
	}
	.lines li {
		padding: 3px 0 3px 10px;
		border-inline-start: 3px solid var(--panel-alt);
	}
	.lines li.final {
		color: var(--ink-muted);
	}
	.lines li.pending {
		border-inline-start-color: var(--accent);
		font-weight: 600;
	}
	.note {
		margin: 0 0 8px;
		font-size: 13px;
		color: var(--ink-muted);
	}
	.note.warning {
		color: var(--ink);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.actions button {
		padding: 6px 16px;
		min-height: 40px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
	.actions button.primary {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}
	@media (pointer: coarse) {
		.actions button {
			min-height: 44px;
		}
	}
</style>
