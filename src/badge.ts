// The move-rating badge drawn on the piece that just moved: "Spark shapes" -
// each rating its own symbol (a star for a masterstroke, a lightning bolt for
// a key move, a burst for a blunder...) on a round badge in the top-right
// corner of the square. It's drawn to stand out on the theme: on the light
// themes a pale badge with a white halo and a soft shadow; on the dark ones
// a dark badge with a glowing symbol. Drawn in a 100 x 100 square (one board
// square). (The names shown for the ratings are in ratingNames.ts.)

// (symbol, badge colour, move-list text colour)
export const RATING_STYLE: Record<string, [string, string, string]> = {
  Brilliant: ["star", "#7C4DFF", "#6236D9"], // Masterstroke
  Great: ["bolt", "#4C5FD5", "#3A4BB8"], // Key move
  Best: ["gem", "#2F8F5B", "#246F46"], // Top move
  Excellent: ["up", "#3FA66B", "#3F7A52"], // Strong
  Good: ["shield", "#6E9A80", "#5E7A65"], // Solid
  Book: ["book", "#9A7247", "#6E5438"], // Theory
  Forced: ["arrow", "#6F7683", "#6B6F76"], // Only move
  Inaccuracy: ["text:?!", "#E3A81B", "#8A6500"], // Imprecise
  Mistake: ["warning", "#EC7A1F", "#B4530A"],
  Miss: ["hourglass", "#C2457F", "#93305F"], // Missed chance
  "Missed Win": ["hourglass", "#9C3D8A", "#7E2C6E"],
  Blunder: ["burst", "#E0352B", "#A8221C"],
  Checkmate: ["text:#", "#3A3330", "#3A3330"],
};

type Look = { dark: boolean; card: string };

// How the badges are drawn on each theme (Classic, Warm stone and Rose quartz
// are light; the rest dark, with their own card colour behind the badge)
const LOOKS: Record<string, Look> = {
  classic: { dark: false, card: "#ffffff" },
  stone: { dark: false, card: "#f2eeea" },
  rose: { dark: false, card: "#fff8f6" },
  ember: { dark: true, card: "#1f2229" },
  violet: { dark: true, card: "#2c2f55" },
  forest: { dark: true, card: "#1d2b24" },
};

/** A colour mixed towards another (amount 0 = the first, 1 = the second). */
function mix(colour: string, toward: string, amount: number): string {
  const a = parseInt(colour.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const part = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return "#" + [16, 8, 0].map((shift) => part(shift).toString(16).padStart(2, "0")).join("");
}

/** The rating's colour on a theme: brighter on the dark ones, and moved where
 *  it would melt into that theme's board. */
function colourOn(rating: string, theme: string, look: Look): string {
  const base = RATING_STYLE[rating][1];
  if (theme === "rose" && (rating === "Miss" || rating === "Blunder")) return mix(base, "#000000", 0.18); // off the rose squares
  if (!look.dark) return base;
  if (theme === "forest" && ["Best", "Excellent", "Good"].includes(rating)) return mix(base, "#d8fff0", 0.6); // off the green squares
  if (theme === "violet" && rating === "Brilliant") return "#c9b6ff"; // off the lavender squares
  return mix(base, "#ffffff", 0.38);
}

/** A symbol, drawn on a 100 x 100 grid round its middle. */
function symbolSvg(symbol: string, colour: string): string {
  const stroke = (width: number) => `fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  const points = (count: number, outer: number, inner: number, top: number) =>
    Array.from({ length: count * 2 }, (_, i) => {
      const radius = i % 2 ? inner : outer;
      const angle = (Math.PI * i) / count + top;
      return `${(50 + radius * Math.cos(angle)).toFixed(1)},${(51 + radius * Math.sin(angle)).toFixed(1)}`;
    }).join(" ");
  if (symbol.startsWith("text:")) {
    const text = symbol.slice(5);
    return `<text x="50" y="54" text-anchor="middle" dominant-baseline="middle" font-family="Arial Black, Arial, sans-serif" ` +
      `font-weight="900" font-size="${text.length > 1 ? 50 : 54}" fill="${colour}" stroke="${colour}" stroke-width="3" letter-spacing="-3">${text}</text>`;
  }
  switch (symbol) {
    case "star":
      return `<polygon points="${points(5, 32, 14, -Math.PI / 2)}" fill="${colour}" stroke="${colour}" stroke-width="3" stroke-linejoin="round"/>`;
    case "bolt":
      return `<path d="M57 16 L33 56 H49 L42 86 L69 42 H52 Z" fill="${colour}" stroke="${colour}" stroke-width="3" stroke-linejoin="round"/>`;
    case "gem":
      return `<path d="M28 38 L39 25 H61 L72 38 L50 79 Z M28 38 H72 M42 38 L50 79 L58 38" ${stroke(7)}/>`;
    case "up":
      return `<path d="M50 22 L76 50 H61 V79 H39 V50 H24 Z" fill="${colour}" stroke="${colour}" stroke-width="3" stroke-linejoin="round"/>`;
    case "shield":
      return `<path d="M50 20 L75 30 V50 C75 67 64 77 50 83 C36 77 25 67 25 50 V30 Z" ${stroke(8)}/>`;
    case "book":
      return `<path d="M50 33 C42 27 30 26 23 29 V73 C30 70 42 71 50 77 C58 71 70 70 77 73 V29 C70 26 58 27 50 33 Z M50 33 V77" ${stroke(7)}/>`;
    case "arrow":
      return `<path d="M22 50 H72 M56 32 L76 50 L56 68" ${stroke(10)}/>`;
    case "warning":
      return `<path d="M50 20 L82 78 H18 Z" ${stroke(8)}/><path d="M50 40 V58" ${stroke(9)}/><circle cx="50" cy="68.5" r="5" fill="${colour}"/>`;
    case "hourglass":
      return `<path d="M30 22 H70 M30 78 H70 M35 22 C35 41 65 41 65 50 C65 59 35 59 35 78 M65 22 C65 41 35 41 35 50 C35 59 65 59 65 78" ${stroke(9)}/>`;
    case "burst":
      return `<polygon points="${points(8, 34, 18, 0)}" fill="${colour}" stroke="${colour}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  return "";
}

/** The badge for a rating, as SVG for a 100 x 100 square, drawn for the
 *  theme now showing. */
export function badgeSvg(rating: string): string {
  const [symbol] = RATING_STYLE[rating];
  const theme = document.documentElement.dataset.ui ?? "stone";
  const look = LOOKS[theme] ?? LOOKS.stone;
  const colour = colourOn(rating, theme, look);
  // a badge 40% of the square, in its top-right corner
  const r = 19;
  const cx = 100 - r - 1;
  const cy = r + 1;
  const scale = (r * 0.92) / 46; // the symbols fill a 46-radius circle on their grid
  const symbolAt = (fill: string) =>
    `<g transform="translate(${(cx - 50 * scale).toFixed(2)} ${(cy - 50 * scale).toFixed(2)}) scale(${scale.toFixed(3)})">${symbolSvg(symbol, fill)}</g>`;
  if (!look.dark) {
    // light themes: a pale badge in the rating's colour, a white halo and a soft shadow
    return (
      `<circle cx="${cx}" cy="${cy + 1.6}" r="${r + 1.5}" fill="#000" fill-opacity="0.25"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r + 1.5}" fill="#ffffff"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r - 1.2}" fill="${mix(RATING_STYLE[rating][1], "#ffffff", 0.84)}" stroke="${colour}" stroke-width="2.4"/>` +
      symbolAt(colour)
    );
  }
  // dark themes: a dark badge in the theme's card colour, and a glowing symbol
  return (
    `<defs><filter id="spark-glow" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feGaussianBlur stdDeviation="1.3" result="soft"/><feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<circle cx="${cx}" cy="${cy + 1.6}" r="${r + 0.5}" fill="#000" fill-opacity="0.35"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${look.card}" stroke="${colour}" stroke-width="2.4"/>` +
    `<g filter="url(#spark-glow)">${symbolAt(colour)}</g>`
  );
}
