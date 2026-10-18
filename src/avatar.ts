// The coach's face: a cartoon of the app's author (black beanie, rectangular
// glasses, full beard, green T-shirt), drawn in SVG so it stays sharp at any
// size. Its expression follows what the coach is saying.

export type Mood = "happy" | "wow" | "worried" | "think" | "talk";

const SKIN = "#7A4B32";
const SKIN_SHADE = "#6B412B";
const HAIR = "#1E1A18";
const OUTLINE = "#3A2416";

const BROWS: Record<Mood, string> = {
  happy: "M33 39.5 q6.5 -4 13 -0.5 M54 39 q6.5 -3.5 13 0.5",
  talk: "M33 40 q6.5 -3 13 0 M54 40 q6.5 -3 13 0",
  wow: "M32.5 35 q7 -6 13.5 -1.5 M54 33.5 q6.5 -4.5 13.5 1.5",
  worried: "M33.5 37 q6.5 3.5 12.5 1.5 M54 38.5 q6 2 12.5 -1.5",
  think: "M33 40.5 q6.5 -2 13 -0.5 M54 36.5 q6.5 -4.5 13 -1",
};

const MOUTHS: Record<Mood, string> = {
  happy: `<path d="M41 66 q9 8.5 18 0" stroke="${OUTLINE}" stroke-width="2.6" fill="#fff" stroke-linecap="round" stroke-linejoin="round"/>`,
  talk: `<path d="M42 66.5 q8 6 16 0 q-8 2.5 -16 0z" fill="${OUTLINE}"/>`,
  wow: `<ellipse cx="50" cy="67.5" rx="4.6" ry="5.8" fill="${OUTLINE}"/>`,
  worried: `<path d="M42 70.5 q8 -6.5 16 0" stroke="${OUTLINE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  think: `<path d="M43 68 q4 -1.5 7 0 t7 -1" stroke="${OUTLINE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
};

const LABELS: Record<Mood, string> = {
  happy: "Coach, pleased",
  talk: "Coach",
  wow: "Coach, amazed",
  worried: "Coach, worried",
  think: "Coach, thinking",
};

let drawn = 0; // each face needs its own clip-path id

/** The coach's face as an SVG string, `size` pixels wide. */
export function avatarSvg(mood: Mood, size = 56): string {
  const clip = `avatar-clip-${++drawn}`;
  const eyeY = mood === "think" ? 48.3 : 50;
  const eyeX = mood === "think" ? 1.2 : 0;
  const extra =
    mood === "think"
      ? `<g fill="#F2EEEA" stroke="${OUTLINE}" stroke-width="1"><circle cx="82" cy="20" r="3"/><circle cx="89" cy="11" r="4.5"/></g>`
      : mood === "wow"
        ? `<g stroke="#FFD166" stroke-width="2.4" stroke-linecap="round"><path d="M14 18 l-6 -5 M11 28 l-8 -1 M86 18 l6 -5 M89 28 l8 -1"/></g>`
        : mood === "worried"
          ? `<path d="M76 30 q3 5 0 8 q-3 -3 0 -8z" fill="#7FC8F8"/>`
          : "";
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${LABELS[mood]}">
  <circle cx="50" cy="50" r="49" fill="var(--avatar-bg, #E8743B)"/>
  <clipPath id="${clip}"><circle cx="50" cy="50" r="49"/></clipPath>
  <g clip-path="url(#${clip})">
    <path d="M14 104 q36 -36 72 0 Z" fill="#2E4A3A"/>
    <path d="M38 80 q12 8 24 0 l2 10 q-14 6 -28 0z" fill="#26402F"/>
  </g>
  <rect x="44" y="70" width="12" height="12" fill="${SKIN_SHADE}"/>
  <ellipse cx="50" cy="53" rx="22.5" ry="25.5" fill="${SKIN}"/>
  <ellipse cx="27.5" cy="56" rx="4" ry="6" fill="${SKIN_SHADE}"/>
  <ellipse cx="72.5" cy="56" rx="4" ry="6" fill="${SKIN_SHADE}"/>
  <path d="M28.5 60 q1.5 24 21.5 28.5 q20 -4.5 21.5 -28.5 q-4 9 -10.5 10 q-11 3.5 -22 0 q-6.5 -1 -10.5 -10z" fill="${HAIR}"/>
  <path d="M41 63.5 q9 -3.5 18 0 q-9 1.8 -18 0z" fill="${HAIR}"/>
  <path d="M26.5 40 q0 -27.5 23.5 -28.5 q23.5 1 23.5 28.5 z" fill="#1F1F22"/>
  <rect x="25.5" y="35.5" width="49" height="8.5" rx="3.5" fill="#2A2A2E"/>
  <path d="M30 36.5v6.5M35.5 36.5v6.5M41 36.5v6.5M46.5 36.5v6.5M52 36.5v6.5M57.5 36.5v6.5M63 36.5v6.5M68.5 36.5v6.5" stroke="#18181B" stroke-width="1.3"/>
  <path d="${BROWS[mood]}" stroke="${HAIR}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <rect x="32.5" y="44" width="15.5" height="11.5" rx="2.5" fill="rgba(255,255,255,0.14)" stroke="#111" stroke-width="2.6"/>
  <rect x="52" y="44" width="15.5" height="11.5" rx="2.5" fill="rgba(255,255,255,0.14)" stroke="#111" stroke-width="2.6"/>
  <path d="M48 47.5 h4 M32.5 47 l-4.5 -1.5 M67.5 47 l4.5 -1.5" stroke="#111" stroke-width="2.2"/>
  <circle cx="${40.3 + eyeX}" cy="${eyeY}" r="2.1" fill="${HAIR}"/>
  <circle cx="${59.7 + eyeX}" cy="${eyeY}" r="2.1" fill="${HAIR}"/>
  <path d="M50 54.5 q-3.2 5.5 0 8" stroke="#5E3824" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  ${MOUTHS[mood]}
  ${extra}
</svg>`;
}

/** The mood that goes with a move rating. */
export function moodForRating(rating: string | undefined): Mood {
  switch (rating) {
    case "Brilliant":
    case "Great":
      return "wow";
    case "Best":
    case "Excellent":
    case "Good":
    case "Book":
    case "Forced":
      return "happy";
    case "Inaccuracy":
      return "think";
    case "Mistake":
    case "Miss":
    case "Missed Win":
    case "Blunder":
      return "worried";
    default:
      return "talk";
  }
}
