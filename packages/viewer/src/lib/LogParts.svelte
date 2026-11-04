<script lang="ts">
	import type { GameState } from "acquire-engine";
	import type { LogPart } from "./format";
	import { CHAIN_STYLES, themeInk } from "./palette";
	import { playerColor } from "./playerAppearance";
	import { useStore } from "./store.svelte";

	let { game, parts }: { game: GameState; parts: LogPart[] } = $props();
	const store = useStore();
</script>

{#each parts as part}
	{#if part.kind === "player" || part.kind === "chain"}
		{@const color =
			part.kind === "player"
				? playerColor(game.seatOwner[part.seat] ?? part.seat, store.appearance?.playerColors)
				: CHAIN_STYLES[part.chain].fill}
		<span
			class="name"
			class:player-name={part.kind === "player"}
			class:chain-name={part.kind === "chain"}
			style:--name-ink-light={themeInk(color, "light")}
			style:--name-ink-dark={themeInk(color, "dark")}>{part.text}</span
		>
	{:else if part.kind === "money"}<span class="money">{part.text}</span>{:else}{part.text}{/if}
{/each}

<style>
	.name,
	.money {
		font-weight: 600;
	}
	.money {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
</style>
