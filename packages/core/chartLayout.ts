import type { Bar } from "./iRealPro";

/** iReal lays every line of a chart out as 16 cells. */
export const CELLS_PER_ROW = 16;

export type PlacedBar = { bar: Bar; start: number; cells: number };

/**
 * Lays bars out in lines the way iReal does: every line is 16 cells, each bar as wide as its
 * `cells` (4 for a normal bar, 2 for a squeezed one), after any blank `offsetCells` — so a line can
 * hold 8 narrow bars, and a 2nd ending can start halfway across under the 1st. Bars made in the
 * chart builder carry no cell info: they're 16/`barsPerRow` cells each, and a section (`newRow`)
 * starts a new line, exactly as before.
 */
export function layoutRows(bars: Bar[], barsPerRow: number): PlacedBar[][] {
  const defaultCells = CELLS_PER_ROW / barsPerRow;
  const rows: PlacedBar[][] = [];
  let row: PlacedBar[] = [];
  let pos = 0;
  const breakLine = () => {
    if (row.length) rows.push(row);
    row = [];
    pos = 0;
  };
  for (const bar of bars) {
    const cells = bar.cells ?? defaultCells;
    if (bar.cells === undefined && bar.newRow && row.length) breakLine();
    pos += bar.offsetCells ?? 0;
    while (pos >= CELLS_PER_ROW) {
      const rest = pos - CELLS_PER_ROW;
      breakLine();
      pos = rest;
    }
    if (pos + cells > CELLS_PER_ROW && row.length) breakLine();
    row.push({ bar, start: pos, cells });
    pos += cells;
    if (pos >= CELLS_PER_ROW) breakLine();
  }
  breakLine();
  return rows;
}

