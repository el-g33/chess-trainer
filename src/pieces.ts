// The pieces (Pieces box): the Merida pieces recoloured like the desktop app
// (theme.py) - cream White pieces with a soft shadow, near-black Black pieces -
// plus three more colour sets that go with the page themes, and four other
// lichess piece sets used as they are (public/pieces/<set>, see CREDITS.txt).
// The SVG files are unchanged originals; they are handed to the board as CSS
// when they load. Also the checkmated king toppling over (theme.py falling_king).
import type { Color } from "chessops/types";

interface Palette {
  label: string;
  white: [string, string, string]; // body top, body bottom, outline
  black: [string, string, number]; // body, sheen, sheen strength
  rim?: string; // a thin glow round Black's pieces
}

export const PALETTES: Record<string, Palette> = {
  classic: { label: "Cream and ink", white: ["#F3E6C8", "#C9B48E", "#2A221B"], black: ["#1A1714", "#8C8378", 0.55] },
  ember: { label: "Steel and ember", white: ["#E6E9F0", "#AEB4C2", "#15171C"], black: ["#1A1C22", "#8C93A6", 0.5], rim: "#FF5A36" },
  stone: { label: "Ivory and espresso", white: ["#FFF8EE", "#E3D2BA", "#3A2A20"], black: ["#3A2A20", "#B08968", 0.6] },
  violet: { label: "Pearl and indigo", white: ["#FFFFFF", "#D9D6F5", "#26215C"], black: ["#26215C", "#9D97E8", 0.6], rim: "#5DE0E6" },
};

/** Other piece sets, drawn by their authors (folder in public/pieces). */
export const PIECE_SETS: Record<string, string> = {
  chessnut: "Chessnut (flat)",
  mpchess: "MPChess (modern)",
  staunty: "Staunty (Staunton)",
  spatial: "Spatial (glossy)",
};

/** Every choice for the Pieces box: value -> label. */
export const PIECE_CHOICES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PALETTES).map(([name, palette]) => [name, palette.label])),
  ...PIECE_SETS,
};

const ROLES: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const GRADIENT = 'stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"';

// The pictures of the falling king: slow at first, then quicker (like falling)
export const FALL_FRAMES = 9;
export const FALL_ANGLES = Array.from(
  { length: FALL_FRAMES },
  (_, i) => (90 * (1 - Math.cos((Math.PI * i) / (FALL_FRAMES - 1)))) / 2,
);

const kings: Record<string, Partial<Record<Color, string>>> = {}; // the king SVGs, by choice
let current = "classic";

/** Which colour set the pieces use (the pieces' CSS is already loaded for all). */
export function setPalette(name: string) {
  current = PIECE_CHOICES[name] ? name : "classic";
  document.documentElement.dataset.pieces = current;
}

function recolour(svg: string, white: boolean, palette: Palette): string {
  if (white) {
    const [top, bottom, outline] = palette.white;
    return svg
      .replaceAll('fill="#1f1a17"', `fill="${outline}"`)
      .replaceAll(GRADIENT, `stop-color="${top}"/><stop offset="1" stop-color="${bottom}"`);
  }
  // A dark body with a faint sheen
  const [body, sheen, strength] = palette.black;
  return svg
    .replaceAll('fill="#1f1a17"', `fill="${body}"`)
    .replaceAll(
      GRADIENT,
      `stop-color="${sheen}" stop-opacity="${strength}"/><stop offset="1" stop-color="${sheen}" stop-opacity="0"`,
    );
}

const dataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

/** The 12 SVGs of a set (folder "" = the Merida originals). */
function fetchSet(folder: string) {
  return Promise.all(
    ["w", "b"].flatMap((colour) =>
      Object.entries(ROLES).map(async ([letter, role]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}pieces/${folder}${colour}${letter}.svg`);
        return { colour, role, svg: await response.text() };
      }),
    ),
  );
}

function pieceRule(choice: string, role: string, side: string, svg: string): string {
  const scope = `:root[data-pieces="${choice}"]`;
  // on the board, and the small captured pieces on the player bars
  return `${scope} .cg-wrap piece.${role}.${side}, ${scope} .mini-piece.${role}.${side} { background-image: url("${dataUrl(svg)}"); }`;
}

export async function loadPieces(): Promise<void> {
  const rules: string[] = [];
  const [originals, ...sets] = await Promise.all([fetchSet(""), ...Object.keys(PIECE_SETS).map((name) => fetchSet(`${name}/`))]);
  for (const [name, palette] of Object.entries(PALETTES)) {
    const scope = `:root[data-pieces="${name}"]`;
    kings[name] = {};
    for (const { colour, role, svg } of originals) {
      const recoloured = recolour(svg, colour === "w", palette);
      const side = colour === "w" ? "white" : "black";
      if (role === "king") kings[name][side] = recoloured;
      rules.push(pieceRule(name, role, side, recoloured));
    }
    if (palette.rim) {
      rules.push(`${scope} .cg-wrap piece.black { filter: drop-shadow(0 0 1.5px ${palette.rim}); }`);
    }
  }
  Object.keys(PIECE_SETS).forEach((name, i) => {
    kings[name] = {};
    for (const { colour, role, svg } of sets[i]) {
      const side = colour === "w" ? "white" : "black";
      if (role === "king") kings[name][side] = svg;
      rules.push(pieceRule(name, role, side, svg));
    }
  });
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
  document.head.append(style);
  document.documentElement.dataset.pieces ??= current;
}

/** The king of `colour` tipped over by `angle` degrees: it turns round its
 *  middle and sinks a little, so it lies on its side within its own square. */
export function fallenKing(colour: Color, angle: number): string | undefined {
  const svg = kings[current]?.[colour];
  if (!svg) return undefined;
  const start = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  const end = svg.lastIndexOf("</svg>");
  // Turn it round the middle of its drawing (each set has its own size)
  const box = /viewBox="([^"]+)"/.exec(svg.slice(0, start))?.[1].split(/[\s,]+/).map(Number) ?? [0, 0, 50, 50];
  const [x, y, width, height] = box;
  const drop = (0.14 * height * angle) / 90;
  const turned =
    svg.slice(0, start) +
    `<g transform="translate(0 ${drop.toFixed(2)}) rotate(${angle.toFixed(1)} ${x + width / 2} ${y + height / 2})">` +
    svg.slice(start, end) +
    "</g></svg>";
  return dataUrl(turned);
}
