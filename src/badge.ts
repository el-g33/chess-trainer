// The move-rating badge drawn on the piece that just moved, in the desktop
// app's hand-drawn style (theme.py badge) but the app's own shape and colours:
// a rounded square tag in the rating's colour, a faint white scribble, a
// wobbly ink outline drawn twice, and a small white drawing or a mark like ?!
// in marker pen. Drawn in a 100 x 100 square (one board square), in its
// top-right corner. (The names shown for the ratings are in ratingNames.ts.)

// (symbol, badge colour, move-list text colour)
export const RATING_STYLE: Record<string, [string, string, string]> = {
  Brilliant: ["!!", "#7C4DFF", "#6236D9"], // Masterstroke
  Great: ["!", "#4C5FD5", "#3A4BB8"], // Key move
  Best: ["icon:diamond", "#2F8F5B", "#246F46"], // Top move
  Excellent: ["icon:up", "#5A9E6F", "#3F7A52"], // Strong
  Good: ["icon:ring", "#7F9C86", "#5E7A65"], // Solid
  Book: ["icon:lines", "#8A6D4D", "#6E5438"], // Theory
  Forced: ["icon:arrow", "#8B8F96", "#6B6F76"], // Only move
  Inaccuracy: ["?!", "#D9A21B", "#8A6500"], // Imprecise
  Mistake: ["?", "#E0731F", "#B4530A"],
  Miss: ["icon:slash", "#B5477A", "#93305F"], // Missed chance
  "Missed Win": ["icon:slash", "#9C3D8A", "#7E2C6E"],
  Blunder: ["??", "#C8312B", "#A8221C"],
  Checkmate: ["#", "#3A3330", "#3A3330"],
};

const INK = "#2A2420";
// A marker-pen handwriting font: Windows' own "Ink Free" (as the desktop app)
// where it's installed, otherwise "Permanent Marker", which comes with the site.
const MARKER_FONT = `"Ink Free", "Permanent Marker", cursive`;

/** A darker shade of a colour (for shadows). */
function darker(colour: string, amount = 0.72): string {
  const value = (i: number) => Math.floor(parseInt(colour.slice(i, i + 2), 16) * amount);
  return "#" + [1, 3, 5].map((i) => value(i).toString(16).toUpperCase().padStart(2, "0")).join("");
}

/** A repeatable random number generator, so a badge looks the same every time. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** A small drawing on a 24 x 24 grid (theme.py icon_svg). */
function iconSvg(name: string, fill: string): string {
  const line = (width = 3.4) =>
    `fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case "diamond":
      return `<polygon points="12,3.5 20.5,12 12,20.5 3.5,12" fill="${fill}" stroke="${fill}" stroke-width="1.2" stroke-linejoin="round"/>`;
    case "up":
      return `<line x1="12" y1="19.5" x2="12" y2="5.5" ${line()}/><polyline points="6.5,11 12,5.3 17.5,11" ${line()}/>`;
    case "ring":
      return `<circle cx="12" cy="12" r="6.6" ${line(3.2)}/>`;
    case "lines":
      return `<line x1="5" y1="7" x2="19" y2="7" ${line(3)}/><line x1="5" y1="12" x2="19" y2="12" ${line(3)}/><line x1="5" y1="17" x2="15" y2="17" ${line(3)}/>`;
    case "slash":
      return `<circle cx="12" cy="12" r="7" ${line(2.8)}/><line x1="7" y1="17" x2="17" y2="7" ${line(2.8)}/>`;
    case "arrow":
      return `<line x1="4.5" y1="12" x2="17" y2="12" ${line()}/><polyline points="12,6.5 17.8,12 12,17.5" ${line()}/>`;
  }
  return "";
}

/** The badge for a rating, as SVG for a 100 x 100 square. */
export function badgeSvg(rating: string): string {
  const [symbol, colour] = RATING_STYLE[rating];
  const icon = symbol.startsWith("icon:") ? symbol.slice(5) : undefined;
  const d = 40; // 40% of a square
  const cx = 100 - d * 0.45;
  const cy = d * 0.45;
  const r = d / 2 - d * 0.07;
  const random = seeded(colour + (icon ?? ""));
  const jitter = () => random() * 2 - 1;
  const at = (x: number, y: number) => `${(x + cx).toFixed(1)},${(y + cy).toFixed(1)}`;

  // Faint zigzag pen strokes across the disc, at a slant
  const scribble: string[] = [];
  const step = d * 0.15;
  let flip = false;
  for (let t = -r + step * 0.6; t < r - step * 0.4; t += step) {
    const half = Math.sqrt(Math.max(0, r * r - t * t)) * 0.84;
    const ends = [[-half, t], [half, t]];
    if (flip) ends.reverse();
    for (const [x, y] of ends) scribble.push(at(x + jitter() * d * 0.03, y + jitter() * d * 0.02));
    flip = !flip;
  }

  // The tag's outline: a rounded square, a little wobbly, as if drawn by hand
  const corner = r * 0.42;
  const wobblySquare = (half: number, wobble: number, shift: number) => {
    const points: string[] = [];
    const edge = half - corner;
    const steps = 6;
    // round the four corners, joined by the straight sides between them
    const centres: [number, number, number][] = [[edge, -edge, -Math.PI / 2], [edge, edge, 0], [-edge, edge, Math.PI / 2], [-edge, -edge, Math.PI]];
    for (const [x, y, start] of centres) {
      for (let i = 0; i <= steps; i++) {
        const a = start + (Math.PI / 2) * (i / steps) + shift;
        const rr = corner * (1 + jitter() * wobble * 3);
        points.push(at(x + rr * Math.cos(a) + jitter() * half * wobble, y + rr * Math.sin(a) + jitter() * half * wobble));
      }
    }
    points.push(points[0]);
    return points.join(" ");
  };

  let drawing = "";
  if (icon) {
    // Icons are drawn on a 24 x 24 grid, scaled to fit the disc, with a soft
    // shadow in a darker shade of the disc colour
    const scale = (d * 0.6) / 24;
    const x = cx - 12 * scale;
    const y = cy - 12 * scale;
    drawing =
      `<g transform="translate(${(x + scale * 0.9).toFixed(2)} ${(y + scale * 1.1).toFixed(2)}) scale(${scale.toFixed(3)})">` +
      `${iconSvg(icon, darker(colour))}</g>` +
      `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})">` +
      `${iconSvg(icon, "#FFFFFF")}</g>`;
  }

  let mark = "";
  if (!icon) {
    // A mark like ?! in white marker pen, with a soft shadow in a darker shade
    const size = d * (symbol.length > 1 ? 0.56 : 0.7);
    const text = (x: number, y: number, fill: string) =>
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-family='${MARKER_FONT}' font-weight="bold" ` +
      `font-size="${size.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${symbol}</text>`;
    mark = text(cx + 1, cy + 1.5, darker(colour)) + text(cx - 0.5, cy, "#FFFFFF") + text(cx + 0.5, cy, "#FFFFFF");
  }

  return (
    `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${corner}" fill="${colour}"/>` +
    `<polyline points="${scribble.join(" ")}" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" ` +
    `stroke-width="${(d * 0.05).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" ` +
    `transform="rotate(-35 ${cx} ${cy})"/>` +
    drawing +
    `<polyline points="${wobblySquare(r, 0.012, 0)}" fill="none" stroke="${INK}" ` +
    `stroke-width="${(d * 0.045).toFixed(1)}" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${wobblySquare(r * 0.96, 0.018, 0.05)}" fill="none" stroke="${INK}" ` +
    `stroke-width="${(d * 0.025).toFixed(1)}" stroke-opacity="0.5" stroke-linecap="round"/>` +
    mark
  );
}
