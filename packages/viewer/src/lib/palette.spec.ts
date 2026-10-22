import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAINS } from "acquire-engine";
import { contrastRatio, deltaE2000, difference, type Deficiency } from "./color.ts";
import { ACCEPTED_ACCENT_CLASHES, CHAIN_STYLES, OKABE_ITO_ORIGIN, THEMES } from "./palette.ts";

/** Minimum CIEDE2000 difference required between any two chain colours, in every vision. */
const MIN_CHAIN_DIFFERENCE = 12;
/** Minimum CIEDE2000 difference between any chain colour and any board colour, in every vision. */
const MIN_BOARD_DIFFERENCE = 12;
/** WCAG AA contrast for normal-size text. */
const MIN_TEXT_CONTRAST = 4.5;

const VISIONS: (Deficiency | undefined)[] = [undefined, "protanopia", "deuteranopia", "tritanopia"];
const chains = Object.entries(CHAIN_STYLES);
const themes = Object.entries(THEMES);

test("CIEDE2000 matches the Sharma, Wu & Dalal (2005) reference data", () => {
	const pairs: [[number, number, number], [number, number, number], number][] = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
		[[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
		[[50, 0, 0], [50, -1, 2], 2.3669],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
		[[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
	];
	for (const [lab1, lab2, expected] of pairs) {
		assert.ok(Math.abs(deltaE2000(lab1, lab2) - expected) < 1e-4, `${lab1} vs ${lab2}`);
	}
});

test("every engine chain has a style with a unique letter matching its name", () => {
	assert.deepEqual(Object.keys(CHAIN_STYLES).sort(), CHAINS.map((chain) => chain.id).sort());
	for (const chain of CHAINS) {
		assert.equal(CHAIN_STYLES[chain.id].letter, chain.name[0]);
	}
	assert.equal(new Set(chains.map(([, style]) => style.letter)).size, chains.length);
});

for (const vision of VISIONS) {
	const name = vision ?? "normal vision";
	test(`chain colours stay distinguishable from each other with ${name}`, () => {
		for (let i = 0; i < chains.length; i++) {
			for (let j = i + 1; j < chains.length; j++) {
				const [a, styleA] = chains[i]!;
				const [b, styleB] = chains[j]!;
				const d = difference(styleA.fill, styleB.fill, vision);
				assert.ok(d >= MIN_CHAIN_DIFFERENCE, `${a} vs ${b}: ΔE00 ${d.toFixed(1)} with ${name}`);
			}
		}
	});

	for (const [themeName, theme] of themes) {
		test(`${themeName} theme: chain colours stay distinguishable from the grey squares and black tiles with ${name}`, () => {
			for (const [chain, style] of chains) {
				for (const part of ["empty", "loose"] as const) {
					const d = difference(style.fill, theme[part], vision);
					assert.ok(d >= MIN_BOARD_DIFFERENCE, `${chain} vs ${part} square: ΔE00 ${d.toFixed(1)} with ${name}`);
				}
			}
		});
	}
}

for (const [themeName, theme] of themes) {
	// Chain colours and their labels are the same in both themes, but the check runs per theme so a
	// theme can never quietly diverge.
	test(`${themeName} theme: every chain label has at least 4.5:1 contrast against its colour`, () => {
		for (const [chain, style] of chains) {
			const ratio = contrastRatio(style.fill, style.text);
			assert.ok(ratio >= MIN_TEXT_CONTRAST, `${chain}: ${ratio.toFixed(2)}:1`);
		}
	});

	test(`${themeName} theme: square coordinates have at least 3:1 contrast on empty squares and loose tiles`, () => {
		const onEmpty = contrastRatio(theme.onEmpty, theme.empty);
		const onLoose = contrastRatio(theme.onLoose, theme.loose);
		assert.ok(onEmpty >= 3, `empty square coordinates: ${onEmpty.toFixed(2)}:1`);
		assert.ok(onLoose >= 3, `loose tile coordinates: ${onLoose.toFixed(2)}:1`);
	});
}

for (const [themeName, theme] of themes) {
	// Pairs below the minimum must be on the accepted list, so a new clash fails here.
	test(`${themeName} theme: the accent differs from every chain and board colour except the accepted clashes`, () => {
		const others = [
			...chains.map(([chain, style]) => [chain, style.fill] as const),
			["empty square", theme.empty] as const,
			["loose tile", theme.loose] as const,
		];
		const clashes: string[] = [];
		for (const vision of VISIONS) {
			for (const [name, color] of others) {
				if (difference(theme.accent, color, vision) < MIN_CHAIN_DIFFERENCE) {
					clashes.push(`${name} ${vision ?? "normal vision"}`);
				}
			}
		}
		assert.deepEqual(clashes.sort(), [...ACCEPTED_ACCENT_CLASHES[themeName as "light" | "dark"]].sort());
	});

	test(`${themeName} theme: the accent has at least 3:1 contrast against the page and panels it is drawn on`, () => {
		for (const surface of ["page", "panel"] as const) {
			const ratio = contrastRatio(theme.accent, theme[surface]);
			assert.ok(ratio >= 3, `accent on ${surface}: ${ratio.toFixed(2)}:1`);
		}
		const text = contrastRatio(theme.onAccent, theme.accent);
		assert.ok(text >= MIN_TEXT_CONTRAST, `text on accent: ${text.toFixed(2)}:1`);
	});

	test(`${themeName} theme: the keyboard focus ring is clearly distinct from the accent and the outline`, () => {
		for (const vision of VISIONS) {
			for (const [name, color] of [
				["accent", theme.accent],
				["actionable outline", theme.ink],
			] as const) {
				const d = difference(theme.focus, color, vision);
				assert.ok(d >= 15, `focus vs ${name}: ΔE00 ${d.toFixed(1)} with ${vision ?? "normal vision"}`);
			}
		}
		for (const surface of ["page", "panel"] as const) {
			const ratio = contrastRatio(theme.focus, theme[surface]);
			assert.ok(ratio >= 3, `focus on ${surface}: ${ratio.toFixed(2)}:1`);
		}
	});
}

for (const [themeName, theme] of themes) {
	test(`${themeName} theme: the hand rack keeps the accent and ink outlines at 3:1 or more`, () => {
		const accent = contrastRatio(theme.accent, theme.rack);
		const ink = contrastRatio(theme.ink, theme.rack);
		assert.ok(accent >= 3, `selected-tile accent outline on the rack: ${accent.toFixed(2)}:1`);
		assert.ok(ink >= 3, `playable-tile outline on the rack: ${ink.toFixed(2)}:1`);
		assert.ok(contrastRatio(theme.rack, theme.page) > 1.2, "the rack is visibly distinct from the page");
	});
}

test("dark theme: the rack is the lightest grey that keeps the accent at 3:1, maximising the tiles' contrast", () => {
	const { rack, accent, loose } = THEMES.dark;
	const level = parseInt(rack.slice(1, 3), 16);
	assert.equal(rack, `#${rack.slice(1, 3).repeat(3)}`, "the rack is a neutral grey");
	const lighter = `#${(level + 1).toString(16).padStart(2, "0").repeat(3)}`;
	assert.ok(contrastRatio(accent, lighter) < 3, `one step lighter (${lighter}) would drop the accent below 3:1`);
	assert.ok(
		contrastRatio(loose, rack) > contrastRatio(loose, THEMES.dark.empty),
		"tiles stand out more than on the board"
	);
});

for (const [themeName] of themes) {
	// Patterns are non-text marks (3:1); letters sit on solid patches, so the 4.5:1 check holds.
	test(`${themeName} theme: each chain pattern has at least 3:1 contrast against its chain colour`, () => {
		for (const [chain, style] of chains) {
			const ratio = contrastRatio(style.patternInk, style.fill);
			assert.ok(ratio >= 3, `${chain} pattern: ${ratio.toFixed(2)}:1`);
		}
	});
}

test("colour-blind mode gives every chain a different pattern", () => {
	assert.equal(new Set(chains.map(([, style]) => style.pattern)).size, chains.length);
});

test("the palette stays close to its Okabe-Ito origins", () => {
	for (const [chain, origin] of Object.entries(OKABE_ITO_ORIGIN)) {
		const d = difference(CHAIN_STYLES[chain as keyof typeof CHAIN_STYLES].fill, origin);
		assert.ok(d <= 12, `${chain} moved ΔE00 ${d.toFixed(1)} from ${origin}`);
	}
});
