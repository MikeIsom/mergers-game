<script lang="ts">
	import type { TutorialController, TutorialSnapshot, TutorialChapterLink } from "@boardgamers/protocol/tutorial";
	import type { GameState, Move } from "acquire-engine";
	import type { Lang } from "../lib/format";
	import PriceTable from "../lib/PriceTable.svelte";
	import { explanation, type Chapter } from "./lessons";
	let {
		chapter,
		snapshot,
		controller,
		lang,
		nextChapter,
	}: {
		chapter: Chapter;
		snapshot: TutorialSnapshot<GameState>;
		controller: TutorialController<GameState, Move>;
		lang: Lang;
		nextChapter?: TutorialChapterLink;
	} = $props();
</script>

<section class="guide" aria-label={lang.t("tutorial.label")}>
	<details open>
		<summary
			><strong>{snapshot.title}</strong><span>{Math.min(snapshot.step + 1, snapshot.total)} / {snapshot.total}</span
			></summary
		>
		<div class="lesson-body" class:completed={snapshot.completed}>
			<p class="instruction" aria-live="polite">{snapshot.text}</p>
			{#if !snapshot.completed}
				<div class="explanation">
					{#each explanation(chapter, snapshot.step, lang).split("\n\n") as paragraph}
						<p>{paragraph}</p>
					{/each}
					{#if chapter === "founding" && snapshot.step === 2}
						<PriceTable state={snapshot.state} />
					{/if}
				</div>
			{/if}
		</div>
		{#if snapshot.error}<p role="alert">{snapshot.error}</p>{/if}
	</details>
	<nav aria-label={lang.t("tutorial.label")}>
		<button disabled={snapshot.busy || snapshot.step === 0} onclick={() => controller.previousStep()}
			>{lang.t("tutorial.previous")}</button
		>
		<button disabled={snapshot.busy || snapshot.completed} onclick={() => controller.restartStep()}
			>{lang.t("tutorial.retry")}</button
		>
		<button disabled={snapshot.busy} onclick={() => controller.restart()}>{lang.t("tutorial.restart")}</button>
		{#if snapshot.completed && nextChapter}<button class="next" onclick={nextChapter.open}
				>{lang.t("tutorial.next")}</button
			>{/if}
	</nav>
</section>

<style>
	.guide {
		padding: 12px;
		background: var(--panel);
		border-bottom: 3px solid var(--accent);
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	summary span {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	p {
		margin: 4px 0 12px;
		max-width: 90ch;
	}
	.instruction {
		font-weight: 600;
	}
	.explanation {
		padding-inline-start: 12px;
		border-inline-start: 2px solid var(--accent);
		margin-bottom: 16px;
	}
	@media (min-width: 900px) {
		.lesson-body:not(.completed) {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
			gap: 24px;
		}
	}
	[role="alert"] {
		font-weight: 700;
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: 8px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	button {
		min-height: 44px;
		padding: 6px 10px;
		font: inherit;
		color: var(--ink);
		background: var(--page);
		border: 1px solid var(--ink);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.next {
		color: var(--on-accent);
		background: var(--accent);
	}
</style>
