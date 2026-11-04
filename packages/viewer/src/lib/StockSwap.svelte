<script lang="ts">
	import {
		activeChains,
		chainSize,
		sharePrice,
		sharePurchaseLimit,
		stockSwapCost,
		stockSwapsRemaining,
		type ChainId,
	} from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import HoldingChange from "./HoldingChange.svelte";
	import { ofType } from "./decisions";
	import { chainName } from "./format";
	import type { ViewerStore } from "./store.svelte";
	import { holdingsAfter, moveEffect } from "./turn-summary";

	let { store, open = $bindable(false) }: { store: ViewerStore; open?: boolean } = $props();
	const game = $derived(store.state!);
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);
	const choices = $derived(ofType(store.moves, "swap"));
	const active = $derived(activeChains(game.board));
	const seat = $derived(game.seats[game.activeSeat]!);
	const held = $derived(seat.shares);
	const remaining = $derived(stockSwapsRemaining(game));
	let from = $state<ChainId>("tower");
	let to = $state<ChainId>("continental");
	let count = $state(1);
	$effect(() => {
		void store.state;
		const first = choices[0];
		if (first) {
			from = first.from;
			to = first.to;
		}
		count = 1;
	});
	const pair = $derived(choices.filter((move) => move.from === from && move.to === to));
	const max = $derived(pair.at(-1)?.count ?? 0);
	const selected = $derived(pair.find((move) => move.count === count));
	const cost = $derived(selected ? stockSwapCost(game, from, to, selected.count) : 0);
	const cash = $derived(
		cost === 0 ? t("swap.even") : t(cost > 0 ? "swap.pay" : "swap.receive", { amount: money(Math.abs(cost)) })
	);
	// Chains off the board have no price; they are never offered, but the defaults may name one.
	const priceOf = (chain: ChainId) => (active.includes(chain) ? sharePrice(chain, chainSize(game.board, chain)) : 0);
	const after = $derived.by(() => {
		const effect = selected && moveEffect(game, selected);
		return effect ? holdingsAfter(game, effect) : undefined;
	});
	/** Why this pair cannot be swapped at all, most specific reason first. */
	const blocked = $derived.by(() => {
		if (remaining <= 0) {
			return t("swap.noneLeft");
		}
		if (!active.includes(from) || !active.includes(to)) {
			return t("swap.unavailable");
		}
		if (game.bank[to] <= 0) {
			return t("swap.bankEmpty", { chain: chainName(to) });
		}
		return priceOf(to) > priceOf(from) && seat.cash < priceOf(to) - priceOf(from)
			? t("swap.cash")
			: t("swap.unavailable");
	});
</script>

<details class="stock-swap" bind:open>
	<summary
		><span aria-hidden="true">⇄</span>
		{t("swap.title")}
		<small>· {remaining === Infinity ? t("swap.unlimited") : t("swap.remaining", { count: remaining })}</small></summary
	>
	<p class="note">{t("swap.note", { limit: sharePurchaseLimit(game.options) })}</p>
	{#if choices.length}
		<div class="chains">
			<label
				>{t("swap.give")}
				<select
					bind:value={from}
					aria-label={t("swap.give")}
					onchange={(event) => {
						count = 1;
						to = choices.find((move) => move.from === event.currentTarget.value)?.to ?? to;
					}}
				>
					{#each active.filter((chain) => held[chain] > 0) as chain (chain)}
						<option value={chain}
							>{t("swap.optionGive", {
								chain: chainName(chain),
								count: held[chain],
								price: money(priceOf(chain)),
							})}</option
						>
					{/each}
				</select>
			</label>
			<label
				>{t("swap.take")}
				<select aria-label={t("swap.take")} bind:value={to} onchange={() => (count = 1)}>
					{#each active.filter((chain) => chain !== from) as chain (chain)}
						<option value={chain}
							>{t("swap.optionTake", {
								chain: chainName(chain),
								count: game.bank[chain],
								price: money(priceOf(chain)),
							})}</option
						>
					{/each}
				</select>
			</label>
		</div>
		<div class="swap-controls">
			<span class="count-label">{t("swap.count")}</span>
			<div class="stepper">
				<button
					type="button"
					class:actionable={count > 1 && max > 0}
					disabled={count <= 1 || max === 0}
					onclick={() => count--}
					aria-label={t("swap.fewer")}>−</button
				>
				<span class="value">{max === 0 ? 0 : count}</span>
				<button
					type="button"
					class:actionable={count < max}
					disabled={count >= max}
					onclick={() => count++}
					aria-label={t("swap.more")}>+</button
				>
			</div>
			{#if max > 0}<small>{t("swap.max", { count: max })}</small>{/if}
		</div>
		{#if selected}
			<p class="exchange" aria-live="polite">
				<span class="leg"
					><ChainMark chain={from} small />
					{t("swap.giveDetail", {
						count: selected.count,
						chain: chainName(from),
						value: money(selected.count * priceOf(from)),
					})}</span
				>
				<span class="leg"
					><ChainMark chain={to} small />
					{t("swap.takeDetail", {
						count: selected.count,
						chain: chainName(to),
						value: money(selected.count * priceOf(to)),
					})}</span
				>
				<strong>{cash}</strong>
			</p>
			{#if after}
				<HoldingChange label={t("swap.after")} cash={after.cash} shares={after.shares} onlyChanged />
			{/if}
		{:else}
			<p class="why">{blocked}</p>
		{/if}
		<button
			type="button"
			class="confirm"
			class:actionable={!!selected}
			disabled={!selected}
			onclick={() => selected && store.send(selected)}
			>{selected
				? t("swap.confirmExact", { count: selected.count, from: chainName(from), to: chainName(to), cash })
				: t("swap.confirm")}</button
		>
	{:else}
		<p class="why">{remaining <= 0 ? t("swap.noneLeft") : t("swap.unavailable")}</p>
	{/if}
</details>

<style>
	.stock-swap {
		border-bottom: 1px solid var(--ink-muted);
		padding-bottom: 10px;
		margin-bottom: 12px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 32px;
	}
	small,
	.note,
	.why {
		color: var(--ink-muted);
		font-size: 13px;
		font-weight: 400;
	}
	.why {
		font-style: italic;
	}
	p {
		margin: 8px 0;
	}
	.chains {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
		gap: 8px;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 13px;
		min-width: 0;
	}
	select {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		font: inherit;
		color: var(--ink);
		background: var(--page);
		border: 1px solid var(--ink-muted);
		padding: 6px;
	}
	.swap-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		margin: 10px 0 4px;
	}
	.count-label {
		font-size: 13px;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.stepper button {
		width: 44px;
		padding: 0;
		font-size: 18px;
	}
	.value {
		display: inline-block;
		min-width: 24px;
		text-align: center;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.exchange {
		display: grid;
		gap: 4px;
		min-width: 0;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.leg {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	button {
		min-height: 44px;
		padding: 6px 12px;
		color: var(--ink);
		background: var(--page);
		border: none;
		font: inherit;
	}
	button:disabled {
		color: var(--ink-muted);
		background: transparent;
	}
	.confirm {
		text-align: start;
	}
	@media (max-width: 400px) {
		.chains {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
