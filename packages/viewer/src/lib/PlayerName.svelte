<script lang="ts">
	import { playerSymbolSvg } from "@boardgamers/protocol/player-symbols";
	import type { GameState } from "acquire-engine";
	import { seatName } from "./format";
	import { useStore } from "./store.svelte";

	/** `playerOnly` names the player without a seat number (fourHands results are per player). */
	let { state: game, seat, playerOnly = false }: { state: GameState; seat: number; playerOnly?: boolean } = $props();

	const store = useStore();
	// BGS appearance data is per real player; in fourHands two seats share one player.
	const player = $derived(game.seatOwner[seat] ?? seat);
	const avatar = $derived(store.avatars[player]);
	const color = $derived(store.appearance?.playerColors[player]);
	const symbol = $derived(store.appearance?.playerSymbols?.[player]);
	const badge = $derived(store.appearance?.players[player]?.pro ? store.appearance.supporterBadge : undefined);
</script>

<span class="player">
	{#if avatar}<img class="avatar" src={avatar} alt="" />{/if}
	<!-- The player colour is only ever this narrow bar, never a fill, so it can't pass for a chain. -->
	{#if color}<span class="color" style:background={color} aria-hidden="true"></span>{/if}
	<!-- Catalogued symbol SVGs only: an unknown value renders nothing. -->
	{#if symbol}<span class="symbol" aria-hidden="true">{@html playerSymbolSvg(symbol)}</span>{/if}
	<span class="name">{playerOnly ? game.seats[seat]!.name : seatName(game, seat, store.lang)}</span>
	{#if badge}<img class="badge" src={badge.url} alt={badge.label} title={badge.label} />{/if}
</span>

<style>
	.player {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		vertical-align: middle;
	}
	.avatar {
		width: 22px;
		height: 22px;
		object-fit: cover;
	}
	.color {
		width: 4px;
		height: 16px;
	}
	.symbol {
		display: inline-flex;
		width: 12px;
		height: 12px;
		color: var(--ink);
	}
	.symbol :global(svg) {
		width: 100%;
		height: 100%;
	}
	.badge {
		width: 16px;
		height: 16px;
	}
</style>
