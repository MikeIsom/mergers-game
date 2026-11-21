// Dev harness: opens the endgame summary over the game, with its own store context
// so player names, colours and the theme match the game view.
import { mount, unmount } from "svelte";
import type { PlayerAppearance } from "@boardgamers/protocol";
import type { GameState } from "acquire-engine";
import { resolveLocale } from "../lib/i18n";
import { STORE, ViewerStore } from "../lib/store.svelte";
import GameSummary from "./GameSummary.svelte";

export function openSummary(
	state: GameState,
	look: {
		theme: string;
		locale: string;
		appearance: PlayerAppearance;
		avatars: string[];
	}
): () => void {
	const store = new ViewerStore(() => false);
	store.appearance = look.appearance;
	store.avatars = look.avatars;
	store.locale = resolveLocale(look.locale);
	const host = document.createElement("div");
	host.className = "acquire summary-host";
	host.style.padding = "0";
	if (look.theme) {
		host.dataset.theme = look.theme;
	}
	document.body.append(host);
	let app: ReturnType<typeof mount> | undefined;
	const close = () => {
		if (app) {
			void unmount(app);
			app = undefined;
			host.remove();
		}
	};
	app = mount(GameSummary, {
		target: host,
		props: { state, onclose: close },
		context: new Map([[STORE, store]]),
	});
	return close;
}
