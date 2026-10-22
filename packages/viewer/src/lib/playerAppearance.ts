export const PLAYER_COLORS = ["#4595d1", "#e68b32", "#8a5cc2", "#3aa35b", "#d14545", "#d45c9e"];

export function playerColor(player: number, colors?: string[]): string {
	const preferred = colors?.[player];
	return preferred && /^#[\da-f]{6}$/i.test(preferred) ? preferred : PLAYER_COLORS[player % PLAYER_COLORS.length]!;
}
