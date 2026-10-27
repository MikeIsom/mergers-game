<script lang="ts">
	import type { ChainId } from "acquire-engine";
	import { chainName } from "./format";
	import { CHAIN_STYLES } from "./palette";

	let { chain, withName = false, small = false }: { chain: ChainId; withName?: boolean; small?: boolean } = $props();
	const style = $derived(CHAIN_STYLES[chain]);
</script>

<span class="mark" class:small>
	<span class="swatch" style:background={style.fill} style:color={style.text} aria-hidden="true">{style.letter}</span>
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
