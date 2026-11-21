<script lang="ts">
	import { CHAIN_IDS, type GameState } from "acquire-engine";
	import PlayerName from "../lib/PlayerName.svelte";
	import { useStore } from "../lib/store.svelte";
	import type { GameSummary, SeatSummary } from "./summary";

	let { state: game, summary, order }: { state: GameState; summary: GameSummary; order: number[] } = $props();
	const store = useStore();
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);

	const sum = (r: Record<string, number>) => CHAIN_IDS.reduce((total, c) => total + (r[c] ?? 0), 0);
	const SOURCES = [
		{ key: "start", label: "summary.src.start" },
		{ key: "first", label: "summary.src.first" },
		{ key: "second", label: "summary.src.second" },
		{ key: "merger", label: "summary.src.merger" },
		{ key: "end", label: "summary.src.end" },
		{ key: "swap", label: "summary.src.swap" },
		{ key: "buys", label: "summary.src.buys" },
	] as const;
	type Key = (typeof SOURCES)[number]["key"];

	function segments(s: SeatSummary): { key: Key; amount: number }[] {
		return [
			{ key: "start", amount: s.start },
			{ key: "first", amount: sum(s.bonusFirst) },
			{ key: "second", amount: sum(s.bonusSecond) },
			{ key: "merger", amount: s.mergerSales },
			{ key: "end", amount: sum(s.finalSales) },
			{ key: "swap", amount: s.swapNet },
			{ key: "buys", amount: -s.buys },
		];
	}
	const rows = $derived(order.map((seat) => ({ seat, segs: segments(summary.seats[seat]!) })));
	const posMax = $derived(Math.max(...rows.map((r) => r.segs.reduce((t, s) => t + Math.max(0, s.amount), 0))));
	const negMax = $derived(Math.max(1, ...rows.map((r) => r.segs.reduce((t, s) => t - Math.min(0, s.amount), 0))));
	const total = $derived(posMax + negMax);
	const label = (key: Key) => t(SOURCES.find((s) => s.key === key)!.label);

	let tip = $state<{ seat: number; key: Key; amount: number; x: number; y: number } | undefined>();
	function show(event: PointerEvent, seat: number, key: Key, amount: number): void {
		const host = (event.currentTarget as HTMLElement).closest(".money")!.getBoundingClientRect();
		tip = { seat, key, amount, x: event.clientX - host.left, y: event.clientY - host.top };
	}
</script>

<div class="money" role="figure" aria-label={t("summary.moneyAria")}>
	<ul class="legend">
		{#each SOURCES as source (source.key)}
			<li><span class="swatch src-{source.key}"></span>{t(source.label)}</li>
		{/each}
	</ul>
	{#each rows as row (row.seat)}
		{@const s = summary.seats[row.seat]!}
		<div class="row">
			<div class="who">
				<PlayerName state={game} seat={row.seat} />
				<span class="final">{money(s.final)}</span>
			</div>
			<div class="track">
				<div class="neg" style:width="{(negMax / total) * 100}%">
					{#each row.segs.filter((x) => x.amount < 0).reverse() as seg (seg.key)}
						<span
							class="seg src-{seg.key}"
							style:width="{(-seg.amount / negMax) * 100}%"
							onpointermove={(e) => show(e, row.seat, seg.key, seg.amount)}
							onpointerleave={() => (tip = undefined)}
							role="presentation"
						></span>
					{/each}
				</div>
				<div class="zero"></div>
				<div class="pos" style:width="{(posMax / total) * 100}%">
					{#each row.segs.filter((x) => x.amount > 0) as seg (seg.key)}
						<span
							class="seg src-{seg.key}"
							style:width="{(seg.amount / posMax) * 100}%"
							onpointermove={(e) => show(e, row.seat, seg.key, seg.amount)}
							onpointerleave={() => (tip = undefined)}
							role="presentation"
						></span>
					{/each}
				</div>
			</div>
			{#if s.founderShareValue > 0}
				<p class="note">{t("summary.founderNote", { amount: money(s.founderShareValue) })}</p>
			{/if}
		</div>
	{/each}
	{#if tip}
		<div class="tip" style:left="{tip.x + 12}px" style:top="{tip.y + 12}px">
			<span class="swatch src-{tip.key}"></span>{label(tip.key)}: <strong>{money(tip.amount)}</strong>
		</div>
	{/if}
	<p class="caption">{t("summary.moneyNote")}</p>
</div>

<style>
	.money {
		position: relative;
		/* Reference categorical slots, in stack order; dark steps chosen for the dark surface. */
		--src-start: #9b9a94;
		--src-first: #2a78d6;
		--src-second: #eb6834;
		--src-merger: #1baf7a;
		--src-end: #eda100;
		--src-swap: #e87ba4;
		--src-buys: #6250d6;
	}
	:global(.acquire[data-theme="dark"]) .money {
		--src-start: #6a6964;
		--src-first: #3987e5;
		--src-second: #d95926;
		--src-merger: #199e70;
		--src-end: #c98500;
		--src-swap: #d55181;
		--src-buys: #9085e9;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		list-style: none;
		padding: 0;
		margin: 0 0 10px;
		font-size: 12px;
		color: var(--ink-muted);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-inline-end: 4px;
	}
	.row {
		margin-bottom: 12px;
	}
	.who {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 3px;
	}
	.final {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.track {
		display: flex;
		height: 18px;
		align-items: stretch;
	}
	.neg {
		display: flex;
		justify-content: flex-end;
	}
	.pos {
		display: flex;
	}
	.zero {
		width: 2px;
		background: var(--ink);
	}
	.seg {
		display: block;
		height: 100%;
		box-shadow: inset -2px 0 0 var(--page);
	}
	.neg .seg {
		box-shadow: inset 2px 0 0 var(--page);
	}
	.src-start {
		background: var(--src-start);
	}
	.src-first {
		background: var(--src-first);
	}
	.src-second {
		background: var(--src-second);
	}
	.src-merger {
		background: var(--src-merger);
	}
	.src-end {
		background: var(--src-end);
	}
	.src-swap {
		background: var(--src-swap);
	}
	.src-buys {
		background: var(--src-buys);
	}
	.note,
	.caption {
		font-size: 12px;
		color: var(--ink-muted);
		margin: 2px 0 0;
	}
	.tip {
		position: absolute;
		background: var(--page);
		border: 1px solid var(--panel-alt);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
		padding: 4px 8px;
		font-size: 13px;
		pointer-events: none;
		white-space: nowrap;
		z-index: 2;
	}
</style>
