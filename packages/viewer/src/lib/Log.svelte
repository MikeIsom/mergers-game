<script lang="ts">
	import type { GameState } from "acquire-engine";
	import { describeEntry } from "./format";
	import { useStore } from "./store.svelte";

	let { state: game }: { state: GameState } = $props();

	// The log has no scroll box of its own (nested scrolling traps touch users); it shows the most
	// recent lines and expands in place.
	const RECENT = 8;
	const store = useStore();
	const t = $derived(store.lang.t);
	let showAll = $state(false);

	// Newest first; "turn" entries become headings that group the lines below them.
	const lines = $derived(
		game.log
			.map((entry, index) => ({ index, turn: entry.type === "turn", text: describeEntry(game, entry, store.lang) }))
			.filter((line): line is { index: number; turn: boolean; text: string } => line.text !== undefined)
			.reverse()
	);
</script>

<section aria-label={t("log.label")}>
	<h2>{t("log.title")}</h2>
	<ol class="log">
		{#each showAll ? lines : lines.slice(0, RECENT) as line (line.index)}
			<li class:turn={line.turn}>{line.text}</li>
		{/each}
	</ol>
	{#if lines.length > RECENT}
		<button type="button" class="more actionable" onclick={() => (showAll = !showAll)}>
			{showAll ? t("log.recent") : t("log.all", { count: lines.length - RECENT })}
		</button>
	{/if}
</section>

<style>
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 14px;
	}
	.log li {
		padding: 2px 6px;
	}
	.log li.turn {
		margin-top: 6px;
		font-weight: 600;
		background: var(--panel-alt);
	}
	.more {
		margin: 8px 0 0;
		padding: 6px 12px;
		min-height: 44px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
</style>
