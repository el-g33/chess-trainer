// The Merida pieces, recoloured like the desktop app (theme.py): cream
// White pieces with a soft shadow, near-black Black pieces - and three more
// colour sets that go with the page themes (Pieces box). The SVG files in
// public/pieces are the unchanged originals; the colours are swapped in when
// they load and handed to the board as CSS. Also the checkmated king toppling
// over (theme.py falling_king).
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

const ROLES: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const GRADIENT = 'stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"';

// The pictures of the falling king: slow at first, then quicker (like falling)
export const FALL_FRAMES = 9;
export const FALL_ANGLES = Array.from(
  { length: FALL_FRAMES },
  (_, i) => (90 * (1 - Math.cos((Math.PI * i) / (FALL_FRAMES - 1)))) / 2,
);

const kings: Record<string, Partial<Record<Color, string>>> = {}; // recoloured king SVGs, by palette
let current = "classic";

/** Which colour set the pieces use (the pieces' CSS is already loaded for all). */
export function setPalette(name: string) {
  current = PALETTES[name] ? name : "classic";
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

export async function loadPieces(): Promise<void> {
  const rules: string[] = [];
  const originals = await Promise.all(
    ["w", "b"].flatMap((colour) =>
      Object.entries(ROLES).map(async ([letter, role]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}pieces/${colour}${letter}.svg`);
        return { colour, role, svg: await response.text() };
      }),
    ),
  );
  for (const [name, palette] of Object.entries(PALETTES)) {
    const scope = `:root[data-pieces="${name}"]`;
    kings[name] = {};
    for (const { colour, role, svg } of originals) {
      const recoloured = recolour(svg, colour === "w", palette);
      const side = colour === "w" ? "white" : "black";
      if (role === "king") kings[name][side] = recoloured;
      const url = dataUrl(recoloured);
      // on the board, and the small captured pieces on the player bars
      rules.push(`${scope} .cg-wrap piece.${role}.${side}, ${scope} .mini-piece.${role}.${side} { background-image: url("${url}"); }`);
    }
    if (palette.rim) {
      rules.push(`${scope} .cg-wrap piece.black { filter: drop-shadow(0 0 1.5px ${palette.rim}); }`);
    }
  }
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
  const drop = (7 * angle) / 90;
  const turned =
    svg.slice(0, start) +
    `<g transform="translate(0 ${drop.toFixed(1)}) rotate(${angle.toFixed(1)} 25 25)">` +
    svg.slice(start, end) +
    "</g></svg>";
  return dataUrl(turned);
}
