import { mount, tick, unmount } from "svelte";
import { registerViewer } from "@boardgamers/protocol/viewer";
import type { GameState, Move } from "acquire-engine";
import App from "./App.svelte";
import { resolveLocale } from "./lib/i18n";
import { initialTheme, themeCss } from "./lib/palette";
import { createActionSounds } from "./lib/sounds";
import { STORE, ViewerStore } from "./lib/store.svelte";
import "./lib/theme.css";
import { mountTutorial } from "./tutorial/mount.svelte";

export const viewer = registerViewer<GameState, Move>(
	"acquire",
	({ target, move, setReplayInfo }) => {
		const style = document.createElement("style");
		style.textContent = themeCss();
		document.head.append(style);
		const store = new ViewerStore(move);
		const sounds = createActionSounds(target);
		store.theme = initialTheme();
		const app = mount(App, { target, props: { store }, context: new Map([[STORE, store]]) });
		return {
			chat: store.chat,
			async onState(state) {
				sounds.onState(state);
				store.setState(state);
				await tick();
			},
			onPlayer({ index }) {
				store.player = index;
			},
			onPreferences(preferences) {
				sounds.onPreferences(preferences);
				store.appearance = preferences.bgs;
				store.analysis = preferences.analysis === true;
				store.locale = resolveLocale(preferences.locale);
			},
			onAvatars(avatars) {
				store.avatars = avatars;
			},
			onTheme({ dark }) {
				store.theme = dark ? "dark" : "light";
			},
			onReplayStart() {
				sounds.onReplayStart();
				const { start, end } = store.replayRange();
				store.replayAt = end;
				setReplayInfo({ start, current: end, end });
			},
			onReplayTo(index) {
				const { start, end } = store.replayRange();
				store.replayAt = Math.min(end, Math.max(start, index));
				setReplayInfo({ start, current: store.replayAt, end });
			},
			onReplayEnd() {
				sounds.onReplayEnd();
				store.replayAt = undefined;
			},
			onMoveResult({ ok }) {
				if (!ok) {
					store.sending = false;
				}
			},
			destroy() {
				sounds.destroy();
				style.remove();
				void unmount(app);
			},
		};
	},
	{ tutorial: mountTutorial }
);
