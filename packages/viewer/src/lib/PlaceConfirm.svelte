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
