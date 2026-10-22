import { mount, tick, unmount } from "svelte";
import { createTutorial, type TutorialMount } from "@boardgamers/protocol/tutorial";
import { stripSecret } from "acquire-engine/wrapper";
import App from "../App.svelte";
import { isRightToLeft, resolveLocale } from "../lib/i18n";
import { initialTheme, themeCss } from "../lib/palette";
import { STORE, ViewerStore } from "../lib/store.svelte";
import { CHAPTERS, lesson, type Chapter } from "./lessons";
import Guide from "./Guide.svelte";
import "./tutorial.css";

export const mountTutorial: TutorialMount = async (target, options) => {
	if (!CHAPTERS.includes(options.chapter as Chapter)) {
		throw new Error("Unknown Acquire tutorial");
	}
	const locale = resolveLocale(options.locale);
	let storage: Storage | undefined;
	try {
		storage = localStorage;
	} catch {
		storage = undefined;
	}
	const controller = await createTutorial({
		...lesson(options.chapter as Chapter, locale),
		storage,
		onProgress: options.onProgress,
	});
	const style = document.createElement("style");
	style.textContent = themeCss();
	document.head.append(style);
	const wrapper = document.createElement("div");
	wrapper.className = "acquire acquire-tutorial";
	wrapper.lang = locale;
	wrapper.dir = isRightToLeft(locale) ? "rtl" : "ltr";
	const guideHost = document.createElement("div");
	guideHost.className = "tutorial-top";
	const gameHost = document.createElement("div");
	wrapper.append(guideHost, gameHost);
	target.append(wrapper);
	const store = new ViewerStore((move) => {
		void controller.play(move);
		return true;
	});
	store.player = 0;
	store.locale = locale;
	store.analysis = true;
	store.theme = initialTheme() ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
	wrapper.dataset.theme = store.theme;
	store.setState(stripSecret(controller.snapshot.state, 0));
	let snapshot = $state(controller.snapshot);
	const guide = mount(Guide, {
		target: guideHost,
		props: {
			chapter: options.chapter as Chapter,
			get snapshot() {
				return snapshot;
			},
			controller,
			lang: store.lang,
			nextChapter: options.nextChapter,
		},
		context: new Map([[STORE, store]]),
	});
	const app = mount(App, { target: gameHost, props: { store }, context: new Map([[STORE, store]]) });
	const unsubscribe = controller.subscribe((value) => {
		snapshot = value;
		wrapper.dataset.step = String(value.step);
		wrapper.dataset.completed = String(value.completed);
		options.nextChapter?.onVisibilityChange?.(value.completed);
		gameHost.inert = value.busy;
		store.readOnly = value.completed;
		if (!value.busy) {
			store.setState(stripSecret(value.state, 0));
		}
	});
	const media = matchMedia("(prefers-color-scheme: dark)");
	const theme = () => {
		store.theme = media.matches ? "dark" : "light";
		wrapper.dataset.theme = store.theme;
	};
	media.addEventListener("change", theme);
	await tick();
	return () => {
		options.nextChapter?.onVisibilityChange?.(false);
		media.removeEventListener("change", theme);
		unsubscribe();
		controller.destroy();
		store.chat.destroy();
		style.remove();
		void unmount(guide);
		void unmount(app);
		wrapper.remove();
	};
};
