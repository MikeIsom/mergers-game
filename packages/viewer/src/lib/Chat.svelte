<script lang="ts">
	import { untrack } from "svelte";
	import { mountChat } from "@boardgamers/protocol/chat/dom";
	import { PLAYER_SYMBOL_IDS, playerSymbolSvg } from "@boardgamers/protocol/player-symbols";
	import { playerColor, playerInk } from "./playerAppearance";
	import { useStore } from "./store.svelte";

	const store = useStore();
	let host: HTMLDivElement;
	let panel: ReturnType<typeof mountChat> | undefined;

	// The protocol library's chat panel, themed and labelled here. Labels are fixed at mount, so
	// it is remounted when the language changes.
	$effect(() => {
		const t = store.lang.t;
		untrack(() => {
			store.chat.setOpen(true);
			panel = mountChat(host, {
				chat: store.chat,
				renderAuthor: (message) => {
					const author = document.createElement("strong");
					author.className = "chat-author";
					const name = document.createElement("span");
					name.textContent = message.author ?? t("chat.game");
					if (message.playerIndex !== undefined) {
						const player = message.playerIndex;
						const color = playerColor(player, store.appearance?.playerColors);
						name.className = "player-name";
						name.style.setProperty("--player-ink-light", playerInk(color, "light"));
						name.style.setProperty("--player-ink-dark", playerInk(color, "dark"));
						const marker = document.createElement("span");
						marker.className = "player-color";
						marker.style.background = color;
						marker.setAttribute("aria-hidden", "true");
						author.append(marker);
						const symbol =
							store.appearance?.playerSymbols?.[player] ??
							(store.colorBlind ? PLAYER_SYMBOL_IDS[player % PLAYER_SYMBOL_IDS.length] : undefined);
						if (symbol) {
							const mark = document.createElement("span");
							mark.className = "player-symbol";
							mark.setAttribute("aria-hidden", "true");
							mark.innerHTML = playerSymbolSvg(symbol);
							author.append(mark);
						}
					}
					author.append(name);
					return author;
				},
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
		});
		return () => panel?.destroy();
	});
	$effect(() => {
		void store.appearance;
		void store.colorBlind;
		untrack(() => panel?.refresh());
	});
</script>

<section class="chat" aria-label={store.lang.t("chat.label")}>
	<h2>{store.lang.t("chat.title")}</h2>
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
	.chat :global(.bgs-game-chat summary) {
		display: none;
	}
	.chat :global(.chat-author) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		vertical-align: middle;
	}
	.chat :global(.player-color) {
		width: 4px;
		height: 16px;
	}
	.chat :global(.player-symbol),
	.chat :global(.player-symbol svg) {
		width: 12px;
		height: 12px;
	}
	.chat :global(.bgs-game-chat input),
	.chat :global(.bgs-game-chat button:not(:disabled)) {
		outline: 2.5px solid var(--ink);
		outline-offset: -2.5px;
	}
	.chat :global(.chat-composer button:not(:disabled)) {
		color: var(--on-accent);
	}
</style>
