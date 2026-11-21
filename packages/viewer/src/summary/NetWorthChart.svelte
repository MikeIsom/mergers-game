<script lang="ts">
	import type { GameState } from "acquire-engine";
	import { playerColor } from "../lib/playerAppearance";
	import { seatName } from "../lib/format";
	import { useStore } from "../lib/store.svelte";
	import type { GameSummary } from "./summary";

	let { state: game, summary }: { state: GameState; summary: GameSummary } = $props();
	const store = useStore();
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);

	let width = $state(640);
	const height = 280;
	const pad = { top: 16, right: 92, bottom: 30, left: 52 };
	const points = $derived(summary.timeline);
	const last = $derived(points.length - 1);
	const maxY = $derived(Math.max(...points.flatMap((p) => p.worth)));
	const step = $derived(maxY > 60000 ? 20000 : maxY > 30000 ? 10000 : 5000);
	const top = $derived(Math.ceil(maxY / step) * step || step);
	const ticks = $derived(Array.from({ length: top / step + 1 }, (_, i) => i * step));
	const plotW = $derived(Math.max(100, width - pad.left - pad.right));
	const plotH = height - pad.top - pad.bottom;
	const x = (i: number) => pad.left + (last === 0 ? 0 : (i / last) * plotW);
	const y = (v: number) => pad.top + plotH - (v / top) * plotH;
	const color = (seat: number) => playerColor(game.seatOwner[seat] ?? seat, store.appearance?.playerColors);
	const name = (seat: number) => seatName(game, seat, store.lang);
	const k = (v: number) => (v === 0 ? "$0" : `$${v / 1000}k`);

	// Play up to the end of the game is solid; the final-scoring step (bonuses and sales) is dashed.
	const paths = $derived(
		game.seats.map((_, seat) =>
			points
				.slice(0, last)
				.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.worth[seat]!).toFixed(1)}`)
				.join("")
		)
	);
	const finals = $derived(
		game.seats.map(
			(_, seat) =>
				`M${x(last - 1).toFixed(1)},${y(points[last - 1]!.worth[seat]!).toFixed(1)}L${x(last).toFixed(1)},${y(points[last]!.worth[seat]!).toFixed(1)}`
		)
	);
	// End labels, nudged apart so names never overlap.
	const labels = $derived.by(() => {
		const end = points[last]!.worth;
		const items = game.seats.map((_, seat) => ({ seat, y: y(end[seat]!) })).sort((a, b) => a.y - b.y);
		for (let i = 1; i < items.length; i++) {
			items[i]!.y = Math.max(items[i]!.y, items[i - 1]!.y + 15);
		}
		return items;
	});
	// Merger markers: the timeline index at which each merger happened.
	const mergerIndex = $derived(
		summary.mergerTurns.map((turn) =>
			Math.max(
				0,
				points.findIndex((p) => p.turn >= turn)
			)
		)
	);

	let hover = $state<number | undefined>();
	function move(event: PointerEvent): void {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const px = event.clientX - rect.left;
		hover = Math.min(last, Math.max(0, Math.round(((px - pad.left) / plotW) * last)));
	}
	const hovered = $derived(
		hover === undefined
			? undefined
			: game.seats.map((_, seat) => ({ seat, worth: points[hover!]!.worth[seat]! })).sort((a, b) => b.worth - a.worth)
	);
</script>

<figure class="chart" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label={t("summary.chartAria")}>
		{#each ticks as tick (tick)}
			<line class="grid" x1={pad.left} x2={pad.left + plotW} y1={y(tick)} y2={y(tick)} />
			<text class="axis" x={pad.left - 6} y={y(tick) + 4} text-anchor="end">{k(tick)}</text>
		{/each}
		{#each mergerIndex as i, n (n)}
			<line class="merger" x1={x(i)} x2={x(i)} y1={pad.top} y2={pad.top + plotH} />
			<rect class="merger-tick" x={x(i) - 3} y={pad.top + plotH + 2} width="6" height="6" />
		{/each}
		{#each [0, Math.round(last / 2), last] as i (i)}
			<text class="axis" x={x(i)} y={height - 6} text-anchor="middle"
				>{t("summary.turnAxis", { turn: points[i]!.turn })}</text
			>
		{/each}
		{#each paths as d, seat (seat)}
			<path {d} fill="none" stroke={color(seat)} stroke-width="2" stroke-linejoin="round" />
			<path d={finals[seat]} fill="none" stroke={color(seat)} stroke-width="2" stroke-dasharray="3 3" />
		{/each}
		{#each labels as label (label.seat)}
			<circle cx={x(last)} cy={y(points[last]!.worth[label.seat]!)} r="4" fill={color(label.seat)} class="ring" />
			<text class="end" x={x(last) + 8} y={label.y + 4}>{name(label.seat)}</text>
		{/each}
		{#if hover !== undefined}
			<line class="cross" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} />
			{#each game.seats as _, seat (seat)}
				<circle cx={x(hover)} cy={y(points[hover]!.worth[seat]!)} r="4" fill={color(seat)} class="ring" />
			{/each}
		{/if}
		<rect
			class="hit"
			x={pad.left}
			y={pad.top}
			width={plotW}
			height={plotH}
			onpointermove={move}
			onpointerleave={() => (hover = undefined)}
			role="presentation"
		/>
	</svg>
	{#if hover !== undefined && hovered}
		<div class="tip" style:left="{Math.min(x(hover) + 12, width - 190)}px">
			<strong
				>{hover === last
					? t("summary.finalScoring")
					: t("summary.turnStart", { turn: points[hover]!.turn + 1 })}</strong
			>
			{#each hovered as row (row.seat)}
				<div class="tip-row">
					<span class="key" style:background={color(row.seat)}></span>{name(row.seat)}
					<span class="num">{money(row.worth)}</span>
				</div>
			{/each}
		</div>
	{/if}
	<figcaption>{t("summary.chartNote")}</figcaption>
</figure>

<style>
	.chart {
		position: relative;
		margin: 0;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--panel-alt);
		stroke-width: 1;
	}
	.axis {
		fill: var(--ink-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.end {
		fill: var(--ink);
		font-size: 12px;
		font-weight: 600;
	}
	.merger {
		stroke: var(--ink-muted);
		stroke-opacity: 0.25;
		stroke-dasharray: 2 3;
	}
	.merger-tick {
		fill: var(--ink-muted);
	}
	.cross {
		stroke: var(--ink-muted);
	}
	.ring {
		stroke: var(--page);
		stroke-width: 2;
	}
	.hit {
		fill: transparent;
		cursor: crosshair;
	}
	.tip {
		position: absolute;
		top: 8px;
		min-width: 170px;
		background: var(--page);
		border: 1px solid var(--panel-alt);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
		padding: 6px 8px;
		font-size: 13px;
		pointer-events: none;
	}
	.tip-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tip-row .num {
		margin-inline-start: auto;
		font-variant-numeric: tabular-nums;
	}
	.key {
		width: 10px;
		height: 3px;
	}
	figcaption {
		font-size: 12px;
		color: var(--ink-muted);
		margin-top: 4px;
	}
</style>
