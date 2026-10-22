<script lang="ts">
	import { mountChat } from "@boardgamers/protocol/chat/dom";
	import { useStore } from "./store.svelte";

	const store = useStore();
	let host: HTMLDivElement;

	// The protocol library's chat panel, themed and labelled here. Labels are fixed at mount, so
	// it is remounted when the language changes.
	$effect(() => {
		const t = store.lang.t;
		// No openPlayer: authors stay plain text rather than a column of outlined buttons.
		const panel = mountChat(host, {
			chat: store.chat,
			labels: {
				title: t("chat.title"),
				message: t("chat.message"),
				placeholder: t("chat.placeholder"),
				send: t("chat.send"),
				sending: t("chat.sending"),
				empty: t("chat.empty"),
				edited: t("chat.edited"),
				suggestions: t("chat.suggestions"),
				game: t("chat.game"),
				unread: (count) => t("chat.unread", { count }),
				date: (date) => date.toLocaleDateString(store.locale, { dateStyle: "long" }),
				status: (state) => {
					if (state.disabled) {
						return t("chat.disabled");
					}
					if (!state.enabled) {
						return t("chat.connecting");
					}
					if (state.canSend) {
						return "";
					}
					switch (state.reason) {
						case "not-logged-in":
							return t("chat.signIn");
						case "not-confirmed":
							return t("chat.confirmAccount");
						case "not-a-player":
							return t("chat.playersOnly");
						case "chat-disabled":
							return t("chat.disabled");
						case "no-game":
							return t("chat.waiting");
						default:
							return t("chat.readOnly");
					}
				},
			},
		});
		return () => panel.destroy();
	});
</script>

<section class="chat" aria-label={store.lang.t("chat.label")}>
	<div bind:this={host}></div>
</section>

<style>
	.chat {
		--chat-background: var(--panel);
		--chat-color: var(--ink);
		/* No frame or dividers: they would look clickable. */
		--chat-border: transparent;
		--chat-input-background: var(--page);
		--chat-button-background: var(--accent);
		--chat-link-color: var(--accent);
		--chat-accent: var(--accent);
		--chat-height: 320px;
	}
	.chat :global(.bgs-game-chat summary),
	.chat :global(.bgs-game-chat input),
	.chat :global(.bgs-game-chat button:not(:disabled)) {
		outline: 2.5px solid var(--ink);
		outline-offset: -2.5px;
	}
	.chat :global(.chat-composer button:not(:disabled)) {
		color: var(--on-accent);
	}
</style>
