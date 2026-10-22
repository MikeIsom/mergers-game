<script lang="ts">
	import {
		CHAIN_IDS,
		activeChains,
		chainSize,
		currentSeat,
		merger,
		sharePrice,
		tileLabel,
		type ChainId,
		type Shares,
	} from "acquire-engine";
	import ChainMark from "./ChainMark.svelte";
	import { adjustShares, canBuy, canDispose, describePlacement, nextDefunctChoices, ofType } from "./decisions";
	import { chainName } from "./format";
	import type { ViewerStore } from "./store.svelte";

	let { store }: { store: ViewerStore } = $props();

	const game = $derived(store.state!);
	const moves = $derived(store.moves);
	const seat = $derived(currentSeat(game));
	const legal = (type: string) => moves.some((move) => move.type === type);
	const lang = $derived(store.lang);
	const t = $derived(lang.t);
	const money = $derived(lang.money);

	// Choices being built up before they are sent; reset whenever a new state arrives.
	let confirmAnnounce = $state(false);
	let order = $state<ChainId[]>([]);
	let sell = $state(0);
	let trade = $state(0);
	let shares = $state<Partial<Shares>>({});
	$effect(() => {
		void store.state;
		confirmAnnounce = false;
		order = [];
		sell = 0;
		trade = 0;
		shares = {};
	});

	const foundable = $derived(new Set(ofType(moves, "found").map((move) => move.chain)));
	const survivors = $derived(new Set(ofType(moves, "survivor").map((move) => move.chain)));
	const nextInOrder = $derived(new Set(nextDefunctChoices(moves, order)));
	const orderComplete = $derived(ofType(moves, "defunctOrder").some((move) => move.chains.join() === order.join()));

	const m = $derived(game.merger);
	const disposing = $derived(game.phase === "dispose" && m ? m.current! : undefined);
	const held = $derived(disposing && seat !== undefined ? game.seats[seat]!.shares[disposing] : 0);
	const sellPrice = $derived(disposing ? sharePrice(disposing, m!.sizes[disposing]!) : 0);

	const buyable = $derived(activeChains(game.board));
	const price = (chain: ChainId) => sharePrice(chain, chainSize(game.board, chain));
	const cost = $derived(Object.entries(shares).reduce((sum, [chain, n]) => sum + n * price(chain as ChainId), 0));
	const total = $derived(Object.values(shares).reduce((sum, n) => sum + n, 0));

	function placeSelected(): void {
		if (store.selected !== undefined) {
			store.send({ type: "place", tile: tileLabel(store.selected) });
		}
	}
</script>

{#if moves.length > 0 && !store.sending}
	<section class="panel" aria-label={t("panel.label")}>
		{#if legal("announce")}
			<div class="announce">
				{#if confirmAnnounce}
					<p>{t("announce.ask")}</p>
					<button type="button" class="actionable" onclick={() => store.send({ type: "announce" })}
						>{t("announce.confirm")}</button
					>
					<button type="button" class="actionable" onclick={() => (confirmAnnounce = false)}
						>{t("announce.cancel")}</button
					>
				{:else}
					<button type="button" class="actionable" onclick={() => (confirmAnnounce = true)}>{t("announce.open")}</button
					>
				{/if}
			</div>
		{/if}

		{#if game.phase === "place"}
			{#if store.selected !== undefined}
				<p>
					{t("place.effect", {
						tile: tileLabel(store.selected),
						effect: describePlacement(game, store.selected, lang),
					})}
				</p>
				<button type="button" class="actionable primary" onclick={placeSelected}
					>{t("place.button", { tile: tileLabel(store.selected) })}</button
				>
				<button type="button" class="actionable" onclick={() => (store.selected = undefined)}
					>{t("place.another")}</button
				>
			{:else if legal("place")}
				<p>{t("place.choose")}</p>
			{/if}
			{#if legal("pass")}
				<p>{t("place.none")}</p>
				<button type="button" class="actionable" onclick={() => store.send({ type: "pass" })}>{t("place.pass")}</button>
			{/if}
		{:else if game.phase === "found"}
			<p>{t("found.prompt")}</p>
			<div class="choices">
				{#each CHAIN_IDS as chain (chain)}
					<button
						type="button"
						class="choice"
						class:actionable={foundable.has(chain)}
						disabled={!foundable.has(chain)}
						onclick={() => store.send({ type: "found", chain })}><ChainMark {chain} withName /></button
					>
				{/each}
			</div>
		{:else if game.phase === "survivor" && m}
			<p>{t("survivor.prompt")}</p>
			<div class="choices">
				{#each CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined) as chain (chain)}
					<button
						type="button"
						class="choice"
						class:actionable={survivors.has(chain)}
						disabled={!survivors.has(chain)}
						onclick={() => store.send({ type: "survivor", chain })}
						><ChainMark {chain} withName /> <span class="size">{t("tiles", { count: m.sizes[chain]! })}</span></button
					>
				{/each}
			</div>
		{:else if game.phase === "defunctOrder" && m}
			<p>{t("order.prompt", { survivor: chainName(m.survivor!) })}</p>
			<div class="choices">
				{#each CHAIN_IDS.filter((chain) => m.sizes[chain] !== undefined && chain !== m.survivor) as chain (chain)}
					{@const position = order.indexOf(chain)}
					<button
						type="button"
						class="choice"
						class:actionable={nextInOrder.has(chain)}
						disabled={!nextInOrder.has(chain)}
						onclick={() => (order = [...order, chain])}
					>
						<ChainMark {chain} withName />
						<span class="size">{t("tiles", { count: m.sizes[chain]! })}</span>
						{#if position >= 0}<span class="position">#{position + 1}</span>{/if}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class:actionable={orderComplete}
				disabled={!orderComplete}
				class="primary"
				onclick={() => store.send({ type: "defunctOrder", chains: order })}>{t("order.confirm")}</button
			>
			<button
				type="button"
				class:actionable={order.length > 0}
				disabled={order.length === 0}
				onclick={() => (order = [])}>{t("order.reset")}</button
			>
		{:else if game.phase === "dispose" && disposing && m}
			<p class="takeover">
				<ChainMark chain={disposing} /><span class="arrow" aria-hidden="true">→</span><ChainMark chain={m.survivor!} />
			</p>
			<p>
				{t("dispose.takenOver", { defunct: chainName(disposing), survivor: chainName(m.survivor!) })}
				{t("dispose.holding", { count: held, chain: chainName(disposing) })}
			</p>
			<div class="steppers">
				<span class="label">{t("dispose.sell", { price: money(sellPrice) })}</span>
				<button
					type="button"
					class:actionable={canDispose(moves, sell - 1, trade)}
					disabled={!canDispose(moves, sell - 1, trade)}
					onclick={() => sell--}
					aria-label={t("dispose.sellFewer")}>−</button
				>
				<span class="value">{sell}</span>
				<button
					type="button"
					class:actionable={canDispose(moves, sell + 1, trade)}
					disabled={!canDispose(moves, sell + 1, trade)}
					onclick={() => sell++}
					aria-label={t("dispose.sellMore")}>+</button
				>
				<span class="effect">+{money(sell * sellPrice)}</span>

				<span class="label">{t("dispose.trade")}</span>
				<button
					type="button"
					class:actionable={canDispose(moves, sell, trade - 2)}
					disabled={!canDispose(moves, sell, trade - 2)}
					onclick={() => (trade -= 2)}
					aria-label={t("dispose.tradeFewer")}>−</button
				>
				<span class="value">{trade}</span>
				<button
					type="button"
					class:actionable={canDispose(moves, sell, trade + 2)}
					disabled={!canDispose(moves, sell, trade + 2)}
					onclick={() => (trade += 2)}
					aria-label={t("dispose.tradeMore")}>+</button
				>
				<span class="effect">{t("dispose.receive", { count: trade / 2, chain: chainName(m.survivor!) })}</span>

				<span class="label">{t("dispose.keep")}</span>
				<span></span>
				<span class="value">{held - sell - trade}</span>
				<span></span>
				<span class="effect">{t("dispose.keepNote", { chain: chainName(disposing) })}</span>
			</div>
			<button type="button" class="actionable primary" onclick={() => store.send({ type: "dispose", sell, trade })}
				>{t("dispose.confirm")}</button
			>
		{:else if game.phase === "buy"}
			<p>{t("buy.prompt")}</p>
			{#if buyable.length > 0}
				<table class="buy">
					<thead>
						<tr>
							<th>{t("buy.chain")}</th><th class="num">{t("buy.price")}</th><th class="num">{t("buy.bank")}</th><th
								class="num">{t("buy.buy")}</th
							>
						</tr>
					</thead>
					<tbody>
						{#each buyable as chain (chain)}
							{@const fewer = adjustShares(shares, chain, -1)}
							{@const more = adjustShares(shares, chain, 1)}
							<tr>
								<td><ChainMark {chain} withName /></td>
								<td class="num">{money(price(chain))}</td>
								<td class="num">{game.bank[chain]}</td>
								<td class="num stepper">
									<button
										type="button"
										class:actionable={canBuy(moves, fewer)}
										disabled={!canBuy(moves, fewer)}
										onclick={() => (shares = fewer)}
										aria-label={t("buy.fewer", { chain: chainName(chain) })}>−</button
									>
									<span class="value">{shares[chain] ?? 0}</span>
									<button
										type="button"
										class:actionable={canBuy(moves, more)}
										disabled={!canBuy(moves, more)}
										onclick={() => (shares = more)}
										aria-label={t("buy.more", { chain: chainName(chain) })}>+</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			<p class="total">
				{t("buy.total", { count: total, cost: money(cost), cash: money(game.seats[seat!]!.cash - cost) })}
			</p>
			<button type="button" class="actionable primary" onclick={() => store.send({ type: "buy", shares })}>
				{total === 0 ? t("buy.nothing") : t("buy.confirm", { cost: money(cost) })}
			</button>
		{/if}
	</section>
{:else if store.sending}
	<section class="panel"><p>{t("panel.sending")}</p></section>
{/if}

<style>
	.panel {
		background: var(--panel);
		padding: 10px 12px 12px;
		margin: 0 0 12px;
	}
	.panel p {
		margin: 0 0 8px;
	}
	.panel button {
		margin: 4px 8px 4px 0;
		padding: 6px 12px;
		min-height: 36px;
		background: var(--page);
		color: var(--ink);
		font: inherit;
		border: none;
	}
	.panel button:disabled {
		background: transparent;
		color: var(--ink-muted);
	}
	.panel button.primary.actionable {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}
	.takeover {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	/* The arrow runs from the defunct chain to the survivor in either reading direction. */
	:global([dir="rtl"]) .arrow {
		transform: scaleX(-1);
	}
	.announce {
		margin: 0 0 10px;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0 0 6px;
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.size {
		font-size: 13px;
		color: var(--ink-muted);
	}
	.position {
		font-weight: 700;
	}
	.steppers {
		display: grid;
		grid-template-columns: auto auto 32px auto 1fr;
		align-items: center;
		gap: 4px 6px;
		margin: 0 0 8px;
	}
	.steppers button,
	.stepper button {
		width: 36px;
		padding: 0;
		margin: 0;
		font-size: 18px;
	}
	.value {
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.effect {
		font-size: 13px;
		color: var(--ink-muted);
		/* "+$600" and "+2 Tower" keep their order inside right-to-left text. */
		direction: ltr;
		unicode-bidi: isolate;
	}
	.buy {
		margin: 0 0 6px;
	}
	.stepper {
		white-space: nowrap;
	}
	.stepper .value {
		display: inline-block;
		width: 24px;
	}
	.total {
		font-variant-numeric: tabular-nums;
	}
	/* Touch screens get 44px targets. */
	@media (pointer: coarse) {
		.panel button {
			min-height: 44px;
		}
		.steppers button,
		.stepper button {
			width: 44px;
		}
	}
</style>
