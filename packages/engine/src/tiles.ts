import { BOARD_COLUMNS, BOARD_ROWS, TILE_COUNT } from "./config.js";

// A tile is its square's index: (column - 1) * 9 + row. Ascending index is the rules.md §3.3
// board order (by number, then letter), so "lowest tile" is the smallest index.
export type Tile = number;

const ROW_LETTERS = "ABCDEFGHI";

export function tileColumn(tile: Tile): number {
	return Math.floor(tile / BOARD_ROWS) + 1;
}

export function tileRow(tile: Tile): number {
	return tile % BOARD_ROWS;
}

export function tileLabel(tile: Tile): string {
	return `${tileColumn(tile)}${ROW_LETTERS[tileRow(tile)]}`;
}

export function parseTile(label: unknown): Tile | undefined {
	if (typeof label !== "string") {
		return undefined;
	}
	const match = /^([1-9]|1[0-2])([A-I])$/.exec(label);
	if (!match) {
		return undefined;
	}
	return (Number(match[1]) - 1) * BOARD_ROWS + ROW_LETTERS.indexOf(match[2]!);
}

export function isTile(value: unknown): value is Tile {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) < TILE_COUNT;
}

export function neighbours(tile: Tile): Tile[] {
	const column = tileColumn(tile);
	const row = tileRow(tile);
	const result: Tile[] = [];
	if (column > 1) {
		result.push(tile - BOARD_ROWS);
	}
	if (column < BOARD_COLUMNS) {
		result.push(tile + BOARD_ROWS);
	}
	if (row > 0) {
		result.push(tile - 1);
	}
	if (row < BOARD_ROWS - 1) {
		result.push(tile + 1);
	}
	return result;
}

export function allTiles(): Tile[] {
	return Array.from({ length: TILE_COUNT }, (_, tile) => tile);
}

export function sortTiles(tiles: Tile[]): Tile[] {
	return tiles.sort((a, b) => a - b);
}
