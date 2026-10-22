import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio } from "./color.ts";
import { THEMES } from "./palette.ts";
import { PLAYER_COLORS, playerInk } from "./playerAppearance.ts";

test("default and custom player names remain readable on every light and dark surface", () => {
	for (const mode of ["light", "dark"] as const) {
		for (const color of [...PLAYER_COLORS, "#000000", "#ffffff", "#ffff00", "#13b7c8"]) {
			const ink = playerInk(color, mode);
			for (const surface of ["page", "panel", "panelAlt"] as const) {
				assert.ok(contrastRatio(ink, THEMES[mode][surface]) >= 4.5, `${color} on ${mode} ${surface}`);
			}
		}
	}
});
