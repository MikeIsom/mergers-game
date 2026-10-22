import type { ChainId } from "acquire-engine";
import { contrastRatio, hexToRgb } from "./color.ts";

export interface Theme {
	page: string;
	panel: string;
	panelAlt: string;
	ink: string;
	inkMuted: string;
	/** Between squares: the board showing through, never an outline. */
	gap: string;
	/** Board colours: grey empty squares and black loose tiles. */
	empty: string;
	loose: string;
	/** Coordinates printed on squares: muted on empty squares, light on loose tiles. */
	onEmpty: string;
	onLoose: string;
	/**
	 * The rack behind the hand tiles. Its own colour, not the board grey, so the selected tile's
	 * accent outline and the playable tiles' ink outline both reach 3:1 against it.
	 */
	rack: string;
	/**
	 * The board accent: selected square outline, merging-tile stripe, safe tag, status stripe.
	 * Never a square's fill, and always drawn against the page or panel colour.
	 */
	accent: string;
	/** Text on the accent (safe tag, primary buttons). */
	onAccent: string;
	/** Keyboard focus ring, clearly distinct from the accent and the actionable outline. */
	focus: string;
}

// The traditional look in both themes: grey squares, black loose tiles. Chain colours are the
// same in both themes so a chain is always recognisable.
export const THEMES: Record<"light" | "dark", Theme> = {
	light: {
		page: "#fbfaf6",
		panel: "#f4f2ec",
		panelAlt: "#e9e6dc",
		ink: "#1b1b1b",
		inkMuted: "#5c5c5c",
		gap: "#3a3a3a",
		empty: "#a6a6a6",
		loose: "#1e1e1e",
		onEmpty: "#3f3f3f",
		onLoose: "#f2f2f2",
		rack: "#d4d4d4",
		accent: "#1c599b",
		onAccent: "#ffffff",
		focus: "#c4002f",
	},
	dark: {
		page: "#121212",
		panel: "#1d1d1d",
		panelAlt: "#262626",
		ink: "#ececec",
		inkMuted: "#a8a8a8",
		gap: "#000000",
		empty: "#3c3c3c",
		loose: "#141414",
		onEmpty: "#c8c8c8",
		onLoose: "#f2f2f2",
		// The lightest grey that keeps the accent at 3:1, which maximises the black tiles' contrast.
		rack: "#515151",
		// #1c599b is only 2.63:1 on the dark page, so dark mode uses a lighter shade of its hue.
		accent: "#68a3e4",
		onAccent: "#121212",
		focus: "#ff4f8f",
	},
};

/**
 * Accent pairs known to fall below the chain colour-difference minimum. The accent is never a
 * fill and every use has a non-colour cue (outline position, stripe, "safe" text), so these were
 * accepted; the palette test fails if any other pair falls below the minimum.
 */
export const ACCEPTED_ACCENT_CLASHES: Record<"light" | "dark", string[]> = {
	light: ["imperial protanopia", "imperial deuteranopia", "worldwide protanopia", "festival tritanopia"],
	dark: [
		"american normal vision",
		"american protanopia",
		"american deuteranopia",
		"american tritanopia",
		"continental protanopia",
		"continental deuteranopia",
		"continental tritanopia",
	],
};

/**
 * CSS custom properties for both themes. The BGS light/dark setting decides (data-theme on the
 * viewer root); prefers-color-scheme is only the fallback while BGS has not sent a setting.
 */
export function themeCss(): string {
	const vars = (theme: Theme) =>
		Object.entries(theme)
			.map(([name, value]) => `--${name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${value};`)
			.join(" ");
	const light = `${vars(THEMES.light)} color-scheme: light;`;
	const dark = `${vars(THEMES.dark)} color-scheme: dark;`;
	return [
		`.acquire, html:has(.acquire) { ${light} }`,
		`.acquire[data-theme="dark"], html:has(.acquire[data-theme="dark"]) { ${dark} }`,
		`@media (prefers-color-scheme: dark) { .acquire:not([data-theme]), html:has(.acquire:not([data-theme])) { ${dark} } }`,
	].join(" ");
}

/**
 * The BGS theme known before the first theme event: the wrapper page marks <html class="dark">
 * (or passes ?dark=1) for the first paint. Undefined means no setting yet.
 */
export function initialTheme(): "dark" | undefined {
	const dark =
		document.documentElement.classList.contains("dark") || new URLSearchParams(location.search).get("dark") === "1";
	return dark ? "dark" : undefined;
}

export interface ChainStyle {
	/** Tile and marker fill. */
	fill: string;
	/** Label colour on that fill, chosen for at least 4.5:1 contrast. */
	text: string;
	/** Shown on every chain tile and marker, so colour is never the only signal. */
	letter: string;
}

// Okabe-Ito without its black and yellow (they clash with the board), nudged and with a violet
// added so every pair stays apart under each colour-vision deficiency. See palette.spec.ts.
export const CHAIN_STYLES: Record<ChainId, ChainStyle> = {
	tower: { fill: "#b44906", text: "#ffffff", letter: "T" },
	luxor: { fill: "#d08200", text: "#000000", letter: "L" },
	worldwide: { fill: "#a16494", text: "#000000", letter: "W" },
	american: { fill: "#5285e0", text: "#000000", letter: "A" },
	festival: { fill: "#0b7d59", text: "#ffffff", letter: "F" },
	imperial: { fill: "#7a2ac4", text: "#ffffff", letter: "I" },
	continental: { fill: "#21c5e2", text: "#000000", letter: "C" },
};

/** The Okabe-Ito colour each chain colour started from (the violet is new). */
export const OKABE_ITO_ORIGIN: Partial<Record<ChainId, string>> = {
	tower: "#d55e00",
	luxor: "#e69f00",
	worldwide: "#cc79a7",
	american: "#0072b2",
	festival: "#009e73",
	continental: "#56b4e9",
};

/** Keep colored text readable across every surface in the current theme. */
export function themeInk(color: string, mode: "light" | "dark"): string {
	const theme = THEMES[mode];
	const rgb = hexToRgb(color);
	const ink = hexToRgb(theme.ink);
	for (let step = 0; step <= 20; step++) {
		const mix = step / 20;
		const candidate = `#${rgb
			.map((value, i) =>
				Math.round((value * (1 - mix) + ink[i]! * mix) * 255)
					.toString(16)
					.padStart(2, "0")
			)
			.join("")}`;
		if ([theme.page, theme.panel, theme.panelAlt].every((background) => contrastRatio(candidate, background) >= 4.5)) {
			return candidate;
		}
	}
	return theme.ink;
}
