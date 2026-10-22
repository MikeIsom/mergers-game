<script lang="ts">
	import type { TutorialController, TutorialSnapshot, TutorialChapterLink } from "@boardgamers/protocol/tutorial";
	import type { GameState, Move } from "acquire-engine";
	import type { Lang } from "../lib/format";
	let {
		snapshot,
		controller,
		lang,
		nextChapter,
	}: {
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
		<p aria-live="polite">{snapshot.text}</p>
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
