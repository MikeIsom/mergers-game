<script lang="ts">
	import type { ChainId } from "acquire-engine";
	import { chainName } from "./format";
	import { CHAIN_STYLES, patternCss } from "./palette";

	let {
		chain,
		withName = false,
		small = false,
		patterned = false,
	}: { chain: ChainId; withName?: boolean; small?: boolean; patterned?: boolean } = $props();
	const style = $derived(CHAIN_STYLES[chain]);
</script>

<span class="mark" class:small>
	{#if patterned}
		<!-- Colour-blind mode: the chain's pattern around a solid patch carrying the letter. -->
		<span class="swatch patterned" style:background={style.fill} aria-hidden="true">
			<span class="pattern" style:background={patternCss(style.pattern, style.patternInk)}></span>
			<span class="patch" style:background={style.fill} style:color={style.text}>{style.letter}</span>
		</span>
	{:else}
		<span class="swatch" style:background={style.fill} style:color={style.text} aria-hidden="true">{style.letter}</span>
	{/if}
	{#if withName}<span class="name">{chainName(chain)}</span>{:else}<span class="sr-only">{chainName(chain)}</span>{/if}
</span>

<style>
	.mark {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		font-weight: 800;
		font-size: 14px;
	}
	.patterned {
		position: relative;
		width: 26px;
		height: 26px;
	}
	.pattern {
		position: absolute;
		inset: 0;
	}
	.patch {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		line-height: 1;
	}
	.small .patterned {
		width: 21px;
		height: 21px;
	}
	.small .patch {
		width: 13px;
		height: 13px;
	}
	.small .swatch {
		width: 17px;
		height: 17px;
		font-size: 11px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
