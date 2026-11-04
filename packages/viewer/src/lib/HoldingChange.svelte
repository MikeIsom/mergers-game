<script lang="ts">
	import ChainMark from "./ChainMark.svelte";
	import type { HoldingChange } from "./turn-summary";
	import { useStore } from "./store.svelte";

	let {
		label,
		cash,
		shares,
		onlyChanged = false,
	}: {
		label: string;
		cash: { before: number; after: number };
		shares: HoldingChange[];
		/** Hide holdings this action leaves unchanged. */
		onlyChanged?: boolean;
	} = $props();
	const store = useStore();
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);
	const shown = $derived(onlyChanged ? shares.filter((change) => change.before !== change.after) : shares);
</script>

<!-- "Cash $6,000 → $5,400 · T 3 → 5": what the player will have once this action is sent. -->
<p class="holding-change" aria-live="polite">
	<span class="label">{label}</span>
	<span class="item" class:changed={cash.before !== cash.after}
		>{t("players.cash")}
		<bdi dir="ltr"
			>{#if cash.before !== cash.after}{money(cash.before)}<span class="arrow">→</span>{/if}<strong
				>{money(cash.after)}</strong
			></bdi
		></span
	>
	{#each shown as change (change.chain)}
		<span class="item" class:changed={change.before !== change.after}
			><ChainMark chain={change.chain} small />
			<bdi dir="ltr"
				>{#if change.before !== change.after}{change.before}<span class="arrow">→</span>{/if}<strong
					>{change.after}</strong
				></bdi
			></span
		>
	{/each}
</p>

<style>
	.holding-change {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 12px;
		margin: 0 0 8px;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.label {
		flex-basis: 100%;
		color: var(--ink-muted);
		font-size: 13px;
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
		color: var(--ink-muted);
	}
	.item.changed {
		color: var(--ink);
	}
	.arrow {
		margin-inline: 0.25em;
	}
</style>
