// The move-rating icon drawn on the piece that just moved, in the desktop
// app's hand-drawn style (theme.py badge): a disc in the rating's colour, a
// faint white scribble, a wobbly ink outline drawn twice, and a small white
// drawing or a mark like ?! in marker pen. Drawn in a 100 x 100 square (one
// board square), in its top-right corner.

// (symbol, icon colour, move-list text colour) - the same as RATING_STYLE
export const RATING_STYLE: Record<string, [string, string, string]> = {
  Brilliant: ["!!", "#26C2A3", "#159C82"],
  Great: ["!", "#749BBF", "#4F7AA3"],
  Best: ["icon:star", "#81B64C", "#5E9431"],
  Excellent: ["icon:thumb", "#81B64C", "#5E9431"],
  Good: ["icon:check", "#77915F", "#5C7347"],
  Book: ["icon:book", "#D5A47D", "#A0703F"],
  Forced: ["icon:arrow", "#96AF8B", "#6E8C62"],
  Inaccuracy: ["?!", "#F7C631", "#B88F00"],
  Mistake: ["?", "#FFA459", "#E07A1F"],
  Miss: ["icon:x", "#FF7769", "#E05A4C"],
  "Missed Win": ["icon:minus", "#DBAC16", "#A6800A"],
  Blunder: ["??", "#FA412D", "#E0301E"],
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
function iconSvg(name: string, fill: string, detail: string): string {
  const line = (width = 3.4) =>
    `fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case "star": {
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 10 : 4.3;
        const angle = (Math.PI * i) / 5 - Math.PI / 2;
        points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)},${(12.6 + radius * Math.sin(angle)).toFixed(2)}`);
      }
      return `<polygon points="${points.join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="1.2" stroke-linejoin="round"/>`;
    }
    case "thumb":
      return (
        `<rect x="3" y="11" width="4" height="9" rx="1" fill="${fill}"/>` +
        `<path d="M8.6 20V11.3l3.8-6.6c.6-1 2.2-.9 2.6.3.2.5.2 1.1 0 1.7l-1 3.3h5.4c1.3 0 2.2 ` +
        `1.2 1.9 2.4l-1.8 6.4c-.3 1-1.2 1.7-2.2 1.7z" fill="${fill}"/>`
      );
    case "check":
      return `<polyline points="4.5,12.8 9.8,18 19.5,6.8" ${line()}/>`;
    case "x":
      return `<line x1="6.5" y1="6.5" x2="17.5" y2="17.5" ${line()}/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5" ${line()}/>`;
    case "minus":
      return `<line x1="5" y1="12" x2="19" y2="12" ${line(3.8)}/>`;
    case "arrow":
      return `<line x1="4.5" y1="12" x2="17" y2="12" ${line()}/><polyline points="12,6.5 17.8,12 12,17.5" ${line()}/>`;
    case "book":
      return (
        `<path d="M12 7.6C9.9 6 6.4 5.6 3.8 6.4v11.4c2.6-.8 6.1-.4 8.2 1.2 2.1-1.6 5.6-2 8.2-1.2` +
        `V6.4c-2.6-.8-6.1-.4-8.2 1.2z" fill="${fill}"/>` +
        `<line x1="12" y1="7.6" x2="12" y2="19" stroke="${detail}" stroke-width="0.9"/>`
      );
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

  const wobblyCircle = (radius: number, wobble: number, turn: number) => {
    const points: string[] = [];
    for (let i = 0; i < 25; i++) {
      const a = (2 * Math.PI * i) / 24 + turn;
      const rr = radius * (1 + jitter() * wobble);
      points.push(at(rr * Math.cos(a), rr * Math.sin(a)));
    }
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
      `${iconSvg(icon, darker(colour), darker(colour))}</g>` +
      `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})">` +
      `${iconSvg(icon, "#FFFFFF", darker(colour, 0.55))}</g>`;
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
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"/>` +
    `<polyline points="${scribble.join(" ")}" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" ` +
    `stroke-width="${(d * 0.05).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" ` +
    `transform="rotate(-35 ${cx} ${cy})"/>` +
    drawing +
    `<polyline points="${wobblyCircle(r, 0.04, 0)}" fill="none" stroke="${INK}" ` +
    `stroke-width="${(d * 0.045).toFixed(1)}" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${wobblyCircle(r * 0.96, 0.055, 0.4)}" fill="none" stroke="${INK}" ` +
    `stroke-width="${(d * 0.025).toFixed(1)}" stroke-opacity="0.5" stroke-linecap="round"/>` +
    mark
  );
}
