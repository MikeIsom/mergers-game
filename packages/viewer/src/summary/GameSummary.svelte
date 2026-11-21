<script lang="ts">
	// MOCKUP: endgame summary with tabs (dev harness only for now).
	import { CHAIN_IDS, type ChainId, type GameState } from "acquire-engine";
	import ChainMark from "../lib/ChainMark.svelte";
	import PlayerName from "../lib/PlayerName.svelte";
	import { useStore } from "../lib/store.svelte";
	import MoneyBars from "./MoneyBars.svelte";
	import NetWorthChart from "./NetWorthChart.svelte";
	import { summarize, type Settlement } from "./summary";

	let { state: game, onclose }: { state: GameState; onclose: () => void } = $props();
	const store = useStore();
	const t = $derived(store.lang.t);
	const money = $derived(store.lang.money);
	const summary = $derived(summarize(game));
	const order = $derived(game.seats.map((_, seat) => seat).sort((a, b) => game.seats[b]!.cash - game.seats[a]!.cash));
	const sum = (r: Record<ChainId, number>) => CHAIN_IDS.reduce((t, c) => t + r[c], 0);

	const TABS = [
		{ id: "overview", label: "summary.tab.overview" },
		{ id: "timeline", label: "summary.tab.timeline" },
		{ id: "mergers", label: "summary.tab.mergers" },
		{ id: "chains", label: "summary.tab.chains" },
		{ id: "stock", label: "summary.tab.stock" },
	] as const;
	let tab = $state<(typeof TABS)[number]["id"]>("overview");

	// Headline numbers.
	const allSettlements = $derived([...summary.mergers.flatMap((m) => m.settlements), ...summary.endSettlements]);
	const paidTotal = (list: Settlement[]) => list.reduce((t, s) => t + s.payouts.reduce((u, p) => u + p.amount, 0), 0);
	const midBonus = $derived(paidTotal(summary.mergers.flatMap((m) => m.settlements)));
	const endBonus = $derived(paidTotal(summary.endSettlements));
	const endShare = $derived(midBonus + endBonus === 0 ? 0 : Math.round((endBonus / (midBonus + endBonus)) * 100));
	const winner = $derived(order[0]!);
	const margin = $derived(game.seats[order[0]!]!.cash - (game.seats[order[1]!]?.cash ?? 0));

	// Team play: alternating seats share a score.
	const teams = $derived(
		game.options.teamPlay && game.seats.length === 4
			? [
					[0, 2],
					[1, 3],
				].map((seats) => ({ seats, cash: seats.reduce((t, s) => t + game.seats[s]!.cash, 0) }))
			: undefined
	);

	// Bonus income per round, for the small table.
	const rounds = $derived(Math.max(1, ...summary.seats.map((s) => s.bonusByRound.length)));
	const maxRound = $derived(Math.max(1, ...summary.seats.flatMap((s) => s.bonusByRound.map((v) => v ?? 0))));

	// Stock tab: chain filter.
	const chainsPlayed = $derived(CHAIN_IDS.filter((c) => summary.seats.some((s) => s.stock[c].peak > 0)));
	let stockChain = $state<ChainId | "all">("all");
	const stockRows = $derived(
		(stockChain === "all" ? chainsPlayed : [stockChain]).flatMap((chain) =>
			order
				.filter((seat) => summary.seats[seat]!.stock[chain].peak > 0)
				.map((seat) => ({ chain, seat, a: summary.seats[seat]!.stock[chain] }))
		)
	);
	const biggestChain = $derived.by(() => {
		const live = summary.chains.filter((c) => c.finalSize !== undefined);
		return live.sort((a, b) => b.finalSize! - a.finalSize!)[0]?.chain;
	});
	const endHolding = (seat: number) => CHAIN_IDS.reduce((t, c) => t + summary.seats[seat]!.stock[c].final, 0);

	function keydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			onclose();
		}
		if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
			const target = event.target as HTMLElement;
			if (target.getAttribute("role") !== "tab") {
				return;
			}
			const i = TABS.findIndex((t) => t.id === tab);
			const next = (i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
			tab = TABS[next]!.id;
			(target.parentElement!.children[next] as HTMLElement).focus();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="summary-title" tabindex="-1" onkeydown={keydown}>
	<div class="sheet">
		<header>
			<div>
				<h1 id="summary-title">{t("summary.title")}</h1>
				<p class="sub">
					{t("summary.counts", {
						turns: summary.turns,
						mergers: summary.mergers.length,
						foundings: summary.chains.reduce((total, c) => total + c.foundings.length, 0),
					})}
					{#if !summary.balanced}<strong class="warn"> · {t("summary.unbalanced")}</strong>{/if}
				</p>
			</div>
			<button type="button" class="close actionable" onclick={onclose} aria-label={t("summary.close")}>✕</button>
		</header>
		<div class="tabs" role="tablist" aria-label={t("summary.sections")}>
			{#each TABS as item (item.id)}
				<button
					type="button"
					role="tab"
					id="tab-{item.id}"
					aria-selected={tab === item.id}
					aria-controls="panel-{item.id}"
					tabindex={tab === item.id ? 0 : -1}
					onclick={() => (tab = item.id)}>{t(item.label)}</button
				>
			{/each}
		</div>

		<div class="panel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}">
			{#if tab === "overview"}
				<div class="tiles">
					<div class="tile">
						<span class="tile-label">{t("summary.winner")}</span>
						<span class="tile-value"><PlayerName state={game} seat={winner} /></span>
						<span class="tile-foot">{t("summary.winnerBy", { amount: money(margin) })}</span>
					</div>
					<div class="tile">
						<span class="tile-label">{t("summary.bonusesPaid")}</span>
						<span class="tile-value">{money(midBonus + endBonus)}</span>
						<span class="tile-foot">{t("summary.bonusSplit", { merger: 100 - endShare, end: endShare })}</span>
					</div>
				</div>

				{#if teams}
					<h2>{t("summary.teams")}</h2>
					<table>
						<tbody>
							{#each [...teams].sort((a, b) => b.cash - a.cash) as team, i (team.seats.join())}
								<tr>
									<td>{i + 1}</td>
									<td>
										<PlayerName state={game} seat={team.seats[0]!} /> & <PlayerName
											state={game}
											seat={team.seats[1]!}
										/>
									</td>
									<td class="num">{money(team.cash)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				<h2>{t("summary.moneyTitle")}</h2>
				<MoneyBars state={game} {summary} {order} />

				<details>
					<summary>{t("summary.tableView")}</summary>
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th>{t("summary.player")}</th>
									<th class="num">{t("summary.src.start")}</th>
									<th class="num">{t("summary.src.first")}</th>
									<th class="num">{t("summary.src.second")}</th>
									<th class="num">{t("summary.src.merger")}</th>
									<th class="num">{t("summary.src.end")}</th>
									<th class="num">{t("summary.src.swap")}</th>
									<th class="num">{t("summary.src.buys")}</th>
									<th class="num">{t("summary.finalCash")}</th>
								</tr>
							</thead>
							<tbody>
								{#each order as seat (seat)}
									{@const s = summary.seats[seat]!}
									<tr>
										<td><PlayerName state={game} {seat} /></td>
										<td class="num">{money(s.start)}</td>
										<td class="num">{money(sum(s.bonusFirst))}</td>
										<td class="num">{money(sum(s.bonusSecond))}</td>
										<td class="num">{money(s.mergerSales)}</td>
										<td class="num">{money(sum(s.finalSales))}</td>
										<td class="num">{money(s.swapNet)}</td>
										<td class="num">−{money(s.buys)}</td>
										<td class="num"><strong>{money(s.final)}</strong></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{:else if tab === "timeline"}
				<h2>{t("summary.netWorth")}</h2>
				<NetWorthChart state={game} {summary} />

				<h2>{t("summary.bonusPerRound")}</h2>
				<div class="table-scroll">
					<table class="rounds">
						<thead>
							<tr>
								<th>{t("summary.player")}</th>
								{#each Array.from({ length: rounds }, (_, i) => i) as r (r)}<th class="num">{r + 1}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each order as seat (seat)}
								<tr>
									<td><PlayerName state={game} {seat} /></td>
									{#each Array.from({ length: rounds }, (_, i) => summary.seats[seat]!.bonusByRound[i] ?? 0) as v, r (r)}
										<td
											class="heat"
											style:--heat={v / maxRound}
											title={v > 0
												? t("summary.roundAmount", { round: r + 1, amount: money(v) })
												: t("summary.roundNothing", { round: r + 1 })}>{v > 0 ? `${Math.round(v / 1000)}k` : ""}</td
										>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="caption">{t("summary.roundNote")}</p>
			{:else if tab === "mergers"}
				<h2>{t("summary.bonusResults")}</h2>
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th>{t("summary.player")}</th>
								<th class="num" title={t("summary.paidHint")}>{t("summary.paid")}</th>
								<th class="num">{t("summary.place.first")}</th>
								<th class="num">{t("summary.place.firstTied")}</th>
								<th class="num">{t("summary.place.second")}</th>
								<th class="num">{t("summary.place.secondTied")}</th>
								<th class="num" title={t("summary.unpaidHint")}>{t("summary.unpaid")}</th>
								<th class="num" title={t("summary.absentHint")}>{t("summary.absent")}</th>
								<th class="num" title={t("summary.tieLossHint")}>{t("summary.tieLoss")}</th>
							</tr>
						</thead>
						<tbody>
							{#each order as seat (seat)}
								{@const p = summary.seats[seat]!.places}
								<tr>
									<td><PlayerName state={game} {seat} /></td>
									<td class="num">{p.first + p.firstTied + p.second + p.secondTied}/{allSettlements.length}</td>
									<td class="num">{p.first}</td>
									<td class="num">{p.firstTied}</td>
									<td class="num">{p.second}</td>
									<td class="num">{p.secondTied}</td>
									<td class="num">{p.none}</td>
									<td class="num">{p.absent}</td>
									<td class="num">{money(summary.seats[seat]!.tieLoss)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="caption">{t("summary.settledNote")}</p>

				<h2>{t("summary.mergersCaused")}</h2>
				<table>
					<thead>
						<tr>
							<th>{t("summary.player")}</th>
							<th class="num">{t("summary.caused")}</th>
							<th class="num" title={t("summary.onlyOthersHint")}>{t("summary.onlyOthers")}</th>
						</tr>
					</thead>
					<tbody>
						{#each order as seat (seat)}
							{@const s = summary.seats[seat]!}
							<tr>
								<td><PlayerName state={game} {seat} /></td>
								<td class="num">{s.triggered}</td>
								<td class="num">{s.triggeredOnlyRivals}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if tab === "chains"}
				<div class="tiles">
					<div class="tile">
						<span class="tile-label">{t("summary.bonusAtMergers")}</span>
						<span class="tile-value">{100 - endShare}%</span>
						<span class="tile-foot">{money(midBonus)}</span>
					</div>
					<div class="tile">
						<span class="tile-label">{t("summary.bonusAtEnd")}</span>
						<span class="tile-value">{endShare}%</span>
						<span class="tile-foot">{money(endBonus)}</span>
					</div>
				</div>
				<div class="split" aria-hidden="true">
					<span class="split-mid" style:width="{100 - endShare}%"></span><span
						class="split-end"
						style:width="{endShare}%"
					></span>
				</div>

				<h2>{t("summary.tab.chains")}</h2>
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th>{t("summary.chain")}</th>
								<th>{t("summary.foundedBy")}</th>
								<th class="num" title={t("summary.founderKeptHint")}>{t("summary.founderKept")}</th>
								<th class="num">{t("summary.peakSize")}</th>
								<th class="num">{t("summary.absorbed")}</th>
								<th class="num">{t("summary.finalSize")}</th>
								<th class="num">{t("summary.bonusesMergers")}</th>
								<th class="num">{t("summary.bonusesEnd")}</th>
							</tr>
						</thead>
						<tbody>
							{#each summary.chains as c (c.chain)}
								<tr>
									<td><ChainMark chain={c.chain} withName /></td>
									<td>
										{#each c.foundings as f, i (i)}
											<div>
												<PlayerName state={game} seat={f.seat} />
												<span class="muted">{t("summary.turnShort", { turn: f.turn })}</span>
											</div>
										{/each}
									</td>
									<td class="num">
										{#each c.foundings as f, i (i)}<div>{f.founderAtEnd ?? "—"}</div>{/each}
									</td>
									<td class="num">{c.peak}</td>
									<td class="num">{c.absorbed}×</td>
									<td class="num">{c.finalSize ?? "—"}</td>
									<td class="num">{c.midBonus ? money(c.midBonus) : "—"}</td>
									<td class="num">{c.endBonus ? money(c.endBonus) : "—"}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if tab === "stock"}
				<h2>{t("summary.sharesAtEnd")}</h2>
				<table>
					<thead>
						<tr
							><th>{t("summary.player")}</th><th class="num">{t("summary.soldAtEnd")}</th><th class="num"
								>{t("summary.inBiggest")}{#if biggestChain}&nbsp;<ChainMark chain={biggestChain} small />{/if}</th
							></tr
						>
					</thead>
					<tbody>
						{#each order as seat (seat)}
							{@const total = endHolding(seat)}
							{@const big = biggestChain ? summary.seats[seat]!.stock[biggestChain].final : 0}
							<tr>
								<td><PlayerName state={game} {seat} /></td>
								<td class="num">{total}</td>
								<td class="num">{big} <span class="muted">({total ? Math.round((big / total) * 100) : 0}%)</span></td>
							</tr>
						{/each}
					</tbody>
				</table>

				<h2>{t("summary.stockActivity")}</h2>
				<div class="chips" role="group" aria-label={t("summary.filterChain")}>
					<button
						type="button"
						class:on={stockChain === "all"}
						aria-pressed={stockChain === "all"}
						onclick={() => (stockChain = "all")}>{t("summary.all")}</button
					>
					{#each chainsPlayed as c (c)}
						<button
							type="button"
							class:on={stockChain === c}
							aria-pressed={stockChain === c}
							onclick={() => (stockChain = c)}
						>
							<ChainMark chain={c} small />
						</button>
					{/each}
				</div>
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th>{t("summary.chain")}</th>
								<th>{t("summary.player")}</th>
								<th class="num" title={t("summary.founderHint")}>{t("summary.founder")}</th>
								<th class="num">{t("summary.bought")}</th>
								<th class="num" title={t("summary.tradedInHint")}>{t("summary.tradedIn")}</th>
								<th class="num" title={t("summary.tradedOutHint")}>{t("summary.tradedOut")}</th>
								<th class="num" title={t("summary.soldHint")}>{t("summary.sold")}</th>
								<th class="num" title={t("summary.swappedHint")}>{t("summary.swapped")}</th>
								<th class="num" title={t("summary.keptHint")}>{t("summary.kept")}</th>
								<th class="num">{t("summary.peak")}</th>
								<th class="num" title={t("summary.atEndHint")}>{t("summary.atEnd")}</th>
							</tr>
						</thead>
						<tbody>
							{#each stockRows as row (row.chain + row.seat)}
								<tr>
									<td><ChainMark chain={row.chain} small /></td>
									<td><PlayerName state={game} seat={row.seat} /></td>
									<td class="num">{row.a.founded || ""}</td>
									<td class="num">{row.a.bought || ""}</td>
									<td class="num">{row.a.tradedIn || ""}</td>
									<td class="num">{row.a.tradedOut || ""}</td>
									<td class="num">{row.a.sold || ""}</td>
									<td class="num"
										>{row.a.swappedIn || row.a.swappedOut ? `+${row.a.swappedIn} / −${row.a.swappedOut}` : ""}</td
									>
									<td class="num">{row.a.heldThrough || ""}</td>
									<td class="num">{row.a.peak}</td>
									<td class="num">{row.a.final || ""}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.45);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 24px 16px;
		overflow-y: auto;
		z-index: 50;
	}
	.sheet {
		width: min(980px, 100%);
		background: var(--page);
		color: var(--ink);
		box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
		padding: 16px 20px 24px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}
	h1 {
		font-size: 20px;
		margin: 0;
	}
	.sub {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--ink-muted);
	}
	.warn {
		color: var(--focus);
	}
	.close {
		min-width: 44px;
		min-height: 44px;
		background: var(--page);
		color: var(--ink);
		border: none;
		font-size: 18px;
	}
	.tabs {
		display: flex;
		gap: 2px;
		margin: 14px 0 0;
		border-bottom: 2px solid var(--panel-alt);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs button {
		flex: none;
		background: none;
		border: none;
		color: var(--ink-muted);
		font: inherit;
		font-weight: 600;
		padding: 10px 14px;
		min-height: 44px;
		cursor: pointer;
		margin-bottom: -2px;
		border-bottom: 3px solid transparent;
	}
	.tabs button[aria-selected="true"] {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.panel {
		padding-top: 14px;
	}
	.panel :global(h2) {
		margin-top: 18px;
	}
	.panel > :global(h2:first-child) {
		margin-top: 0;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 8px;
		margin-bottom: 8px;
	}
	.tile {
		background: var(--panel);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tile-label {
		font-size: 12px;
		color: var(--ink-muted);
	}
	.tile-value {
		font-size: 24px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tile-foot {
		font-size: 12px;
		color: var(--ink-muted);
	}
	.muted {
		color: var(--ink-muted);
	}
	.caption {
		font-size: 12px;
		color: var(--ink-muted);
		margin: 4px 0 0;
	}
	details {
		margin: 6px 0 4px;
		font-size: 13px;
	}
	summary {
		cursor: pointer;
		color: var(--ink-muted);
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	.rounds td,
	.rounds th {
		padding: 3px 4px;
		min-width: 34px;
	}
	.heat {
		text-align: center;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		background: color-mix(in srgb, var(--accent) calc(var(--heat) * 85%), transparent);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--page);
	}
	.split {
		display: flex;
		height: 10px;
		margin-bottom: 4px;
	}
	.split-mid {
		background: var(--accent);
		box-shadow: inset -2px 0 0 var(--page);
	}
	.split-end {
		background: var(--ink-muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.chips button {
		min-height: 36px;
		min-width: 44px;
		padding: 4px 10px;
		background: var(--panel);
		color: var(--ink);
		border: none;
		font: inherit;
		cursor: pointer;
		outline: 1.5px solid var(--panel-alt);
	}
	.chips button.on {
		outline: 2.5px solid var(--ink);
		outline-offset: -2.5px;
	}
	@media (max-width: 600px) {
		.backdrop {
			padding: 0;
		}
		.sheet {
			padding: 12px 16px 20px;
			min-height: 100%;
		}
	}
</style>
