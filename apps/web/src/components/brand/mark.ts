// Geometry for the Lockstep mark: a square split along a two-step seam into an
// ascending base and the piece that locks into it. Shared by the React logo and
// scripts/generate-icons.mjs, so it must stay free of imports.

export interface MarkVertex {
  x: number;
  y: number;
  r: number;
}

export interface MarkPiece {
  id: "base" | "lock";
  vertices: MarkVertex[];
}

const OUTER = 5;
const INNER = 1.25;

export const MARK_BOUNDS = { min: 4, max: 28 };

export const MARK_PIECES: MarkPiece[] = [
  {
    id: "base",
    vertices: [
      { x: 21.25, y: 4, r: INNER },
      { x: 28, y: 4, r: OUTER },
      { x: 28, y: 28, r: OUTER },
      { x: 4, y: 28, r: OUTER },
      { x: 4, y: 21.25, r: INNER },
      { x: 13.25, y: 21.25, r: INNER },
      { x: 13.25, y: 13.25, r: INNER },
      { x: 21.25, y: 13.25, r: INNER },
    ],
  },
  {
    id: "lock",
    vertices: [
      { x: 4, y: 4, r: OUTER },
      { x: 18.75, y: 4, r: INNER },
      { x: 18.75, y: 10.75, r: INNER },
      { x: 10.75, y: 10.75, r: INNER },
      { x: 10.75, y: 18.75, r: INNER },
      { x: 4, y: 18.75, r: INNER },
    ],
  },
];

interface Corner {
  start: [number, number];
  end: [number, number];
  center: [number, number];
  r: number;
  clockwise: boolean;
}

function corners(piece: MarkPiece): Corner[] {
  const list = piece.vertices;
  return list.map((vertex, index) => {
    const prev = list[(index - 1 + list.length) % list.length]!;
    const next = list[(index + 1) % list.length]!;
    const inX = Math.sign(vertex.x - prev.x);
    const inY = Math.sign(vertex.y - prev.y);
    const outX = Math.sign(next.x - vertex.x);
    const outY = Math.sign(next.y - vertex.y);
    const start: [number, number] = [vertex.x - inX * vertex.r, vertex.y - inY * vertex.r];
    const end: [number, number] = [vertex.x + outX * vertex.r, vertex.y + outY * vertex.r];
    return {
      start,
      end,
      center: [start[0] + outX * vertex.r, start[1] + outY * vertex.r],
      r: vertex.r,
      clockwise: inX * outY - inY * outX > 0,
    };
  });
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function piecePath(piece: MarkPiece): string {
  const parts: string[] = [];
  corners(piece).forEach((corner, index) => {
    const [sx, sy] = corner.start;
    const [ex, ey] = corner.end;
    parts.push(`${index === 0 ? "M" : "L"}${round(sx)} ${round(sy)}`);
    parts.push(`A${round(corner.r)} ${round(corner.r)} 0 0 ${corner.clockwise ? 1 : 0} ${round(ex)} ${round(ey)}`);
  });
  parts.push("Z");
  return parts.join("");
}

export function pieceOutline(piece: MarkPiece, segments = 12): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const corner of corners(piece)) {
    const [cx, cy] = corner.center;
    const from = Math.atan2(corner.start[1] - cy, corner.start[0] - cx);
    const sweep = corner.clockwise ? Math.PI / 2 : -Math.PI / 2;
    for (let step = 0; step <= segments; step += 1) {
      const angle = from + (sweep * step) / segments;
      points.push([cx + Math.cos(angle) * corner.r, cy + Math.sin(angle) * corner.r]);
    }
  }
  return points;
}

export const MARK_PATHS = {
  base: piecePath(MARK_PIECES[0]!),
  lock: piecePath(MARK_PIECES[1]!),
};
