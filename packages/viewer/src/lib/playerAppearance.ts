import { contrastRatio, hexToRgb } from "./color.ts";
import { THEMES } from "./palette.ts";

export const PLAYER_COLORS = ["#4595d1", "#e68b32", "#8a5cc2", "#3aa35b", "#d14545", "#d45c9e"];

export function playerColor(player: number, colors?: string[]): string {
	const preferred = colors?.[player];
	return preferred && /^#[\da-f]{6}$/i.test(preferred) ? preferred : PLAYER_COLORS[player % PLAYER_COLORS.length]!;
}

export function playerInk(color: string, mode: "light" | "dark"): string {
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
