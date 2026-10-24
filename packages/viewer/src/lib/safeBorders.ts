import { BOARD_COLUMNS, BOARD_ROWS, CHAIN_IDS, isSafe, type Cell } from "acquire-engine";

/** Trace exposed tile edges only, leaving the interior grid of a safe chain unobstructed. */
export function safeBorders(board: Cell[]) {
	return CHAIN_IDS.filter((chain) => isSafe(board, chain)).map((chain) => {
		const edges: string[] = [];
		const matches = (x: number, y: number) =>
			x >= 0 && x < BOARD_COLUMNS && y >= 0 && y < BOARD_ROWS && board[x * BOARD_ROWS + y] === chain;
		for (let x = 0; x < BOARD_COLUMNS; x++) {
			for (let y = 0; y < BOARD_ROWS; y++) {
				if (!matches(x, y)) {
					continue;
				}
				if (!matches(x, y - 1)) {
					edges.push(`M${x},${y}h1`);
				}
				if (!matches(x + 1, y)) {
					edges.push(`M${x + 1},${y}v1`);
				}
				if (!matches(x, y + 1)) {
					edges.push(`M${x},${y + 1}h1`);
				}
				if (!matches(x - 1, y)) {
					edges.push(`M${x},${y}v1`);
				}
			}
		}
		return { chain, path: edges.join(" ") };
	});
}
