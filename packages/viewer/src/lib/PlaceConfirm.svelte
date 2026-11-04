<script lang="ts">
	import { tileLabel } from "acquire-engine";
	import { describePlacement } from "./decisions";
	import type { ViewerStore } from "./store.svelte";

	let {
		store,
		nearHand = false,
	}: {
		store: ViewerStore;
		/** The copy under the rack on phones, where the decision panel is above the board, out of view. */
		nearHand?: boolean;
	} = $props();

	const t = $derived(store.lang.t);
	const tile = $derived(
		store.state?.phase === "place" && store.moves.length > 0 && !store.sending ? store.selected : undefined
	);

	// Placing can cross a commit boundary mid-turn (e.g. paying merger bonuses), ending undo.
	const final = $derived(
		tile !== undefined && store.drafting && !!store.outcome({ type: "place", tile: tileLabel(tile) })?.commits
	);

	let row = $state<HTMLElement>();
	// Bring the confirmation into view when it opens below a rack at the bottom of the screen.
	$effect(() => {
		if (nearHand && row && tile !== undefined && row.getClientRects().length > 0) {
			const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
			row.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
		}
	});
</script>

{#if tile !== undefined}
	<div class="place-confirm" class:near-hand={nearHand} bind:this={row}>
		<p>{t("place.effect", { tile: tileLabel(tile), effect: describePlacement(store.state!, tile, store.lang) })}</p>
		<button
			type="button"
			class="actionable primary"
			onclick={() => store.send({ type: "place", tile: tileLabel(tile) })}
			>{t("place.button", { tile: tileLabel(tile) })}</button
		>
		<button type="button" class="actionable" onclick={() => (store.selected = undefined)}>{t("place.another")}</button>
		{#if final}<p class="final-note">{t("turn.finalStep")}</p>{/if}
	</div>
{/if}

<style>
	.place-confirm.near-hand {
		margin-top: 8px;
		padding: 10px 12px 12px;
		background: var(--panel);
	}
	p {
		margin: 0 0 8px;
	}
	.final-note {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--ink-muted);
	}
	button {
		margin-block: 4px;
		margin-inline: 0 8px;
		padding: 6px 12px;
		min-height: 36px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
	button.primary {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}
	@media (pointer: coarse) {
		button {
			min-height: 44px;
		}
	}
</style>
