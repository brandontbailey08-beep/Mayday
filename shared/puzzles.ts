import type { OilPuzzle, RackPuzzle } from "./protocol.js";
// Bit ports clockwise: north, east, south, west. Every tile has two ports.
export const rotatePipe = (mask: number) => ((mask << 1) & 15) | (mask >> 3);
export const pipePorts = (mask: number) =>
  ["north", "east", "south", "west"].filter((_, i) => mask & (1 << i));
export function createOilPuzzle(seed: number): OilPuzzle {
  const paths = [
    [4, 5, 1, 2, 6, 10, 11],
    [4, 8, 9, 5, 6, 7, 11],
    [4, 0, 1, 5, 9, 10, 6, 7, 11],
  ];
  let state = seed >>> 0;
  const random = () =>
    (state = (1664525 * state + 1013904223) >>> 0) / 4294967296;
  const path = paths[Math.floor(random() * paths.length)];
  const tiles: number[] = Array.from({ length: 16 }, () =>
    random() < 0.5 ? 5 : 3,
  );
  const direction = (from: number, to: number) =>
    to === from - 4 ? 1 : to === from + 1 ? 2 : to === from + 4 ? 4 : 8;
  path.forEach((cell, i) => {
    tiles[cell] =
      (i === 0 ? 8 : direction(cell, path[i - 1])) |
      (i === path.length - 1 ? 2 : direction(cell, path[i + 1]));
  });
  for (let i = 0; i < tiles.length; i++) {
    const turns = Math.floor(random() * 4);
    for (let j = 0; j < turns; j++) tiles[i] = rotatePipe(tiles[i]);
  }
  // Never spawn an already-complete repair.
  if (oilFlow({ tiles }).connected) tiles[4] = rotatePipe(tiles[4]);
  return { tiles };
}
const neighbor = (cell: number, side: number) => {
  const row = Math.floor(cell / 4),
    col = cell % 4;
  if (
    (side === 0 && row === 0) ||
    (side === 1 && col === 3) ||
    (side === 2 && row === 3) ||
    (side === 3 && col === 0)
  )
    return -1;
  return cell + [-4, 1, 4, -1][side];
};
export function oilFlow(puzzle: OilPuzzle): {
  connected: boolean;
  wet: number[];
} {
  const wet: number[] = [];
  let cell = 4,
    entry = 3;
  while (cell >= 0 && !wet.includes(cell)) {
    const mask = puzzle.tiles[cell];
    if (!(mask & (1 << entry))) return { connected: false, wet };
    wet.push(cell);
    const exit = [0, 1, 2, 3].find((i) => i !== entry && mask & (1 << i))!;
    if (cell === 11 && exit === 1) return { connected: true, wet };
    cell = neighbor(cell, exit);
    entry = (exit + 2) % 4;
  }
  return { connected: false, wet };
}
/** Bot searches the same visible tile shapes a player sees, without a secret solution. */
export function solveOil(puzzle: OilPuzzle): Map<number, number> | null {
  function visit(
    cell: number,
    entry: number,
    path: Map<number, number>,
  ): Map<number, number> | null {
    if (cell < 0 || path.has(cell)) return null;
    let mask = puzzle.tiles[cell];
    for (let rotation = 0; rotation < 4; rotation++, mask = rotatePipe(mask)) {
      if (!(mask & (1 << entry))) continue;
      const exit = [0, 1, 2, 3].find((i) => i !== entry && mask & (1 << i))!;
      const next = new Map(path).set(cell, mask);
      if (cell === 11 && exit === 1) return next;
      const result = visit(neighbor(cell, exit), (exit + 2) % 4, next);
      if (result) return result;
    }
    return null;
  }
  return visit(4, 3, new Map());
}
export function createRackPuzzle(seed: number): RackPuzzle {
  const labels = [0, 1, 2];
  const shift = Math.abs(seed) % 3;
  labels.push(...labels.splice(0, shift));
  if (seed % 2) labels.reverse();
  return {
    faultySlot: Math.abs(seed) % 3,
    stage: "powered",
    wiring: [0, 1, 2],
    labels,
  };
}
