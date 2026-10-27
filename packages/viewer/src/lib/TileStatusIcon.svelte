<script lang="ts">
	let { permanent, size = 16 }: { permanent: boolean; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 20 20"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	aria-hidden="true"
>
	{#if permanent}
		<circle cx="10" cy="10" r="7" />
		<path d="m5 5 10 10" />
	{:else}
		<path d="M7 4v12M13 4v12" stroke-width="3" />
	{/if}
</svg>
