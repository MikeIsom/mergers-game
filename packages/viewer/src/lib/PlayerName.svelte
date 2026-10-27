<script lang="ts">
	import type { GameState } from "acquire-engine";
	import { seatName } from "./format";
	import { playerColor } from "./playerAppearance";
	import { themeInk } from "./palette";
	import { useStore } from "./store.svelte";

	/** `playerOnly` names the player without a seat number (fourHands results are per player). */
	let { state: game, seat, playerOnly = false }: { state: GameState; seat: number; playerOnly?: boolean } = $props();

	const store = useStore();
	// BGS appearance data is per real player; in fourHands two seats share one player.
	const player = $derived(game.seatOwner[seat] ?? seat);
	const avatar = $derived(store.avatars[player]);
	const color = $derived(playerColor(player, store.appearance?.playerColors));
	const badge = $derived(store.appearance?.players[player]?.pro ? store.appearance.supporterBadge : undefined);
</script>

<span class="player">
	{#if avatar}<img class="avatar" src={avatar} alt="" />{/if}
	<span class="color" style:background={color} aria-hidden="true"></span>
	<span
		class="player-name"
		style:--name-ink-light={themeInk(color, "light")}
		style:--name-ink-dark={themeInk(color, "dark")}
		>{playerOnly ? game.seats[seat]!.name : seatName(game, seat, store.lang)}</span
	>
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
	.badge {
		width: 16px;
		height: 16px;
	}
</style>
