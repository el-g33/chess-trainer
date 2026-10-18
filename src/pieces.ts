// The Merida pieces, recoloured like the desktop app (theme.py): cream
// White pieces with a soft shadow, near-black Black pieces. The SVG files
// in public/pieces are the unchanged originals; the colours are swapped in
// when they load and handed to the board as CSS. Also the checkmated king
// toppling over (theme.py falling_king).
import type { Color } from "chessops/types";

const CREAM = "#F3E6C8"; // White's pieces
const CREAM_SHADOW = "#2A221B"; // their outline
const INK = "#1A1714"; // Black's pieces
const INK_SHEEN = "#8C8378"; // soft highlight on Black's pieces

const ROLES: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const GRADIENT = 'stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"';

// The pictures of the falling king: slow at first, then quicker (like falling)
export const FALL_FRAMES = 9;
export const FALL_ANGLES = Array.from(
  { length: FALL_FRAMES },
  (_, i) => (90 * (1 - Math.cos((Math.PI * i) / (FALL_FRAMES - 1)))) / 2,
);

const kings: Partial<Record<Color, string>> = {}; // recoloured king SVGs

function recolour(svg: string, white: boolean): string {
  if (white) {
    return svg
      .replaceAll('fill="#1f1a17"', `fill="${CREAM_SHADOW}"`)
      .replaceAll(GRADIENT, `stop-color="${CREAM}"/><stop offset="1" stop-color="#C9B48E"`);
  }
  // Near-black body with a faint sheen
  return svg
    .replaceAll('fill="#1f1a17"', `fill="${INK}"`)
    .replaceAll(
      GRADIENT,
      `stop-color="${INK_SHEEN}" stop-opacity="0.55"/><stop offset="1" stop-color="${INK_SHEEN}" stop-opacity="0"`,
    );
}

const dataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

export async function loadPieces(): Promise<void> {
  const rules: string[] = [];
  await Promise.all(
    ["w", "b"].flatMap((colour) =>
      Object.entries(ROLES).map(async ([letter, role]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}pieces/${colour}${letter}.svg`);
        const svg = recolour(await response.text(), colour === "w");
        const side = colour === "w" ? "white" : "black";
        if (role === "king") kings[side] = svg;
        rules.push(`.cg-wrap piece.${role}.${side} { background-image: url("${dataUrl(svg)}"); }`);
        // the small captured pieces on the player bars
        rules.push(`.mini-piece.${role}.${side} { background-image: url("${dataUrl(svg)}"); }`);
      }),
    ),
  );
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
  document.head.append(style);
}

/** The king of `colour` tipped over by `angle` degrees: it turns round its
 *  middle and sinks a little, so it lies on its side within its own square. */
export function fallenKing(colour: Color, angle: number): string | undefined {
  const svg = kings[colour];
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
