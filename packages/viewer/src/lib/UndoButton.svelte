<script lang="ts">
	import type { ViewerStore } from "./store.svelte";

	let { store }: { store: ViewerStore } = $props();
</script>

<button type="button" class="actionable undo" onclick={() => store.undo()}>
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
		><path d="M9 4 3 10l6 6M3 10h11a7 7 0 0 1 0 14" transform="translate(0 -2)" /></svg
	>
	{store.lang.t("turn.undo")}
</button>

<style>
	.undo {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-block: 4px;
		margin-inline: auto 0;
		padding: 6px 12px;
		min-height: 36px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
	@media (pointer: coarse) {
		.undo {
			min-height: 44px;
		}
	}
</style>
