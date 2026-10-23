// The coach: a flat cartoon of the app's author (rectangular glasses, full
// beard), face to shoulders, with a hand gesture for each mood. The outfit
// changes once a day (beanie and green tee, smart vest, beanie and hoodie
// with a gold chain), and for the holidays: a Santa hat in December, a party
// hat over New Year, bunny ears at Easter. Drawn in SVG so it stays sharp at
// any size.

export type Mood = "happy" | "wow" | "worried" | "think" | "talk" | "wave";

export type OutfitName = "tee" | "smart" | "hoodie" | "christmas" | "newyear" | "easter";

const SKIN = "#7A4B32";
const SKIN_SHADE = "#6B412B";
const HAIR = "#1E1A18";
const OUTLINE = "#3A2416";

// The face is drawn in its own 100 x 100 space, then shrunk into the top of
// the circle so the shoulders and hands fit below it
const HEAD = "translate(50 39) scale(0.62) translate(-50 -50)";

const BROWS: Record<Mood, string> = {
  happy: "M33 39.5 q6.5 -4 13 -0.5 M54 39 q6.5 -3.5 13 0.5",
  wave: "M33 39.5 q6.5 -4 13 -0.5 M54 39 q6.5 -3.5 13 0.5",
  talk: "M33 40 q6.5 -3 13 0 M54 40 q6.5 -3 13 0",
  wow: "M32.5 35 q7 -6 13.5 -1.5 M54 33.5 q6.5 -4.5 13.5 1.5",
  worried: "M33.5 37 q6.5 3.5 12.5 1.5 M54 38.5 q6 2 12.5 -1.5",
  think: "M33 40.5 q6.5 -2 13 -0.5 M54 36.5 q6.5 -4.5 13 -1",
};

const MOUTHS: Record<Mood, string> = {
  happy: `<path d="M41 66 q9 8.5 18 0" stroke="${OUTLINE}" stroke-width="2.6" fill="#fff" stroke-linecap="round" stroke-linejoin="round"/>`,
  wave: `<path d="M41 66 q9 8.5 18 0" stroke="${OUTLINE}" stroke-width="2.6" fill="#fff" stroke-linecap="round" stroke-linejoin="round"/>`,
  talk: `<path d="M42 66.5 q8 6 16 0 q-8 2.5 -16 0z" fill="${OUTLINE}"/>`,
  wow: `<ellipse cx="50" cy="67.5" rx="4.6" ry="5.8" fill="${OUTLINE}"/>`,
  worried: `<path d="M42 70.5 q8 -6.5 16 0" stroke="${OUTLINE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  think: `<path d="M43 68 q4 -1.5 7 0 t7 -1" stroke="${OUTLINE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
};

const LABELS: Record<Mood, string> = {
  happy: "Coach, thumbs up",
  wave: "Coach, waving",
  talk: "Coach, explaining",
  wow: "Coach, celebrating",
  worried: "Coach, facepalm",
  think: "Coach, thinking",
};

// -- Outfits --------------------------------------------------------------------

type Hat = "beanie" | "hair" | "santa" | "party" | "bunny";

interface Outfit {
  hat: Hat;
  top: string; // the body of the top
  shade: string; // its collar and shadows
  sleeve: string;
  behind?: string; // drawn before the body (a hood, confetti)
  front?: string; // drawn on the body (collars, patterns, headphones)
}

const zigzag = (y: number, colour: string) =>
  `<path d="M8 ${y} ${Array.from({ length: 28 }, (_, i) => `l3 ${i % 2 ? 3 : -3}`).join(" ")}" stroke="${colour}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`;
const dots = (y: number, colours: string[]) =>
  Array.from({ length: 9 }, (_, i) => `<circle cx="${14 + i * 9}" cy="${y}" r="1.7" fill="${colours[i % colours.length]}"/>`).join("");
const crew = (shade: string) => `<path d="M40 67 Q50 73.5 60 67" stroke="${shade}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;

const SMART_FRONT = `<path d="M40 67 L50 88 L60 67 Q50 71 40 67Z" fill="#EEF0F3"/>
  <path d="M40 66 L47.5 75 L44.5 66Z M60 66 L52.5 75 L55.5 66Z" fill="#FFFFFF" stroke="#C9CDD4" stroke-width="0.8"/>
  <path d="M48.6 70.5 L51.4 70.5 L52.6 85 L50 88.5 L47.4 85Z" fill="#8C2F39"/>
  <circle cx="50" cy="93" r="1.3" fill="#2B2F36"/><circle cx="50" cy="99" r="1.3" fill="#2B2F36"/>`;

const OUTFITS: Record<OutfitName, Outfit> = {
  tee: { hat: "beanie", top: "#2E4A3A", shade: "#22382B", sleeve: "#2E4A3A", front: crew("#22382B") },
  smart: { hat: "hair", top: "#4A505C", shade: "#3A3F49", sleeve: "#EEF0F3", front: SMART_FRONT },
  hoodie: {
    hat: "beanie", top: "#3C5A8A", shade: "#2F4870", sleeve: "#3C5A8A",
    behind: `<path d="M27 74 Q50 50 73 74 Q50 63 27 74Z" fill="#2F4870"/>`,
    front: `${crew("#2F4870")}
      <path d="M45.5 71 L44.5 85 M54.5 71 L55.5 85" stroke="#E9EEF5" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M40 67.5 Q50 82 60 67.5" stroke="#B8860B" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M40 67.5 Q50 82 60 67.5" stroke="#F2C94C" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-dasharray="2 1.2"/>
      <circle cx="50" cy="78.5" r="2.6" fill="#F2C94C" stroke="#B8860B" stroke-width="0.8"/>`,
  },
  christmas: {
    hat: "santa", top: "#B8322F", shade: "#962825", sleeve: "#B8322F",
    front: `${crew("#F4F1EC")}${zigzag(84, "#F4F1EC")}${dots(92, ["#2E7D4F", "#F4F1EC"])}`,
  },
  newyear: {
    hat: "party", top: "#4A505C", shade: "#3A3F49", sleeve: "#EEF0F3", front: SMART_FRONT,
    behind: `<g opacity="0.95"><rect x="12" y="16" width="3" height="5" rx="1" fill="#FFD166" transform="rotate(25 13 18)"/>
      <rect x="82" y="22" width="3" height="5" rx="1" fill="#3BC1A8" transform="rotate(-30 83 24)"/>
      <circle cx="20" cy="34" r="1.6" fill="#F4F1EC"/><circle cx="86" cy="40" r="1.6" fill="#FFD166"/>
      <rect x="24" y="8" width="3" height="5" rx="1" fill="#6C5CE7" transform="rotate(-20 25 10)"/>
      <rect x="74" y="10" width="3" height="5" rx="1" fill="#F4F1EC" transform="rotate(40 75 12)"/></g>`,
  },
  easter: {
    hat: "bunny", top: "#9ED9C4", shade: "#7FC2AA", sleeve: "#9ED9C4",
    front: `${crew("#F6C6D8")}${dots(85, ["#F6C6D8", "#FFE08A", "#B9C8F2"])}${dots(93, ["#FFE08A", "#B9C8F2", "#F6C6D8"])}`,
  },
};

// In the face's own space (before it is shrunk into the circle)
const HAIR_CAP = `<path d="M27 44 q-2 -31 23 -31 q25 0 23 31 q-2 -9 -7 -13 q-16 -7 -32 0 q-5 4 -7 13z" fill="${HAIR}"/>`;
const HATS: Record<Hat, string> = {
  beanie: `<path d="M26.5 40 q0 -27.5 23.5 -28.5 q23.5 1 23.5 28.5 z" fill="#1F1F22"/>
    <rect x="25.5" y="35.5" width="49" height="8.5" rx="3.5" fill="#2A2A2E"/>
    <path d="M30 36.5v6.5M35.5 36.5v6.5M41 36.5v6.5M46.5 36.5v6.5M52 36.5v6.5M57.5 36.5v6.5M63 36.5v6.5M68.5 36.5v6.5" stroke="#18181B" stroke-width="1.3"/>`,
  hair: HAIR_CAP,
  santa: `<path d="M27 37 Q28 10 52 8 Q71 8 81 22 Q86 30 89 36 L82 39 Q78 30 72 25 Q74 31 73 37 Z" fill="#C8322E"/>
    <rect x="25" y="33" width="50" height="10" rx="5" fill="#F4F1EC"/>
    <circle cx="86" cy="38" r="6" fill="#F4F1EC"/>`,
  party: `${HAIR_CAP}
    <path d="M37 28 L57 -10 L67 25 Z" fill="#6C5CE7"/>
    <path d="M41 21 L63 13 M46 11 L60 6" stroke="#FFD166" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="57" cy="-10" r="4.5" fill="#FFD166"/>`,
  bunny: `${HAIR_CAP}
    <ellipse cx="37" cy="4" rx="7" ry="18" transform="rotate(-14 37 4)" fill="#F7F3F0"/>
    <ellipse cx="37" cy="6" rx="3.4" ry="12.5" transform="rotate(-14 37 6)" fill="#F6C6D8"/>
    <ellipse cx="63" cy="4" rx="7" ry="18" transform="rotate(14 63 4)" fill="#F7F3F0"/>
    <ellipse cx="63" cy="6" rx="3.4" ry="12.5" transform="rotate(14 63 6)" fill="#F6C6D8"/>
    <path d="M28 33 Q50 14 72 33" stroke="#F6C6D8" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
};

const EVERYDAY: OutfitName[] = ["tee", "smart", "hoodie"];

/** Easter Sunday of a year (the Gregorian computus). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/** Today's outfit: the holiday's, or one of the everyday ones (a new one each
 *  day). "?outfit=christmas" in the address tries one out. */
export function outfitFor(date = new Date()): OutfitName {
  const asked = new URLSearchParams(globalThis.location?.search ?? "").get("outfit");
  if (asked && asked in OUTFITS) return asked as OutfitName;
  const month = date.getMonth();
  const day = date.getDate();
  if ((month === 11 && day === 31) || (month === 0 && day <= 2)) return "newyear";
  if (month === 11) return "christmas";
  const fromEaster = dayNumber(date) - dayNumber(easterSunday(date.getFullYear()));
  if (fromEaster >= -2 && fromEaster <= 1) return "easter"; // Good Friday to Easter Monday
  return EVERYDAY[dayNumber(date) % EVERYDAY.length];
}

// -- Hands ----------------------------------------------------------------------
// Drawn pointing up around (0, 0), then placed with a transform

const FINGERS = `<rect x="-5.2" y="-12" width="2.6" height="9" rx="1.3"/>
  <rect x="-2.3" y="-13.5" width="2.6" height="10" rx="1.3"/>
  <rect x="0.6" y="-13" width="2.6" height="9.5" rx="1.3"/>
  <rect x="3.3" y="-10.5" width="2.4" height="7.5" rx="1.2"/>`;
const OPEN = `${FINGERS}<rect x="-5.5" y="-5" width="11" height="10" rx="4"/>
  <rect x="-9" y="-2.5" width="3" height="8" rx="1.5" transform="rotate(-38 -6 3)"/>`;
const FIST = `<rect x="-6" y="-6" width="12" height="11" rx="4"/>
  <path d="M-3 -6 v3.5 M0 -6 v3.5 M3 -6 v3.5" stroke="${SKIN_SHADE}" stroke-width="0.9" stroke-linecap="round"/>`;
const HANDS = {
  open: OPEN,
  fist: FIST,
  // a fist seen from the side, knuckles forward, thumb up
  thumbsUp: `<rect x="-6.5" y="-4" width="13" height="11" rx="3.5"/>
    <path d="M-6.5 -0.5 h9 M-6.5 3 h9" stroke="${SKIN_SHADE}" stroke-width="0.9" stroke-linecap="round"/>
    <rect x="-4.5" y="-14" width="5" height="12" rx="2.5"/>`,
  point: `${FIST}<rect x="-5" y="-17" width="3" height="12" rx="1.5"/>`,
};

// (mirrored: the thumb on the other side, for the hand on the left)
const hand = (shape: keyof typeof HANDS, x: number, y: number, angle = 0, scale = 1, mirrored = false) =>
  `<g fill="${SKIN}" transform="translate(${x} ${y}) rotate(${angle}) scale(${mirrored ? -scale : scale} ${scale})">${HANDS[shape]}</g>`;
// A sleeve, with an edge in the darker shade so it stands out from the body
let edge = "#000";
const arm = (x1: number, y1: number, x2: number, y2: number, sleeve: string) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${edge}" stroke-width="11.5" stroke-linecap="round"/>
  <path d="M${x1} ${y1} L${x2} ${y2}" stroke="${sleeve}" stroke-width="9" stroke-linecap="round"/>`;

/** The arms and hands for a mood, and whether they go in front of the face. */
function gesture(mood: Mood, sleeve: string): { art: string; overFace: boolean } {
  switch (mood) {
    case "talk": // explaining: a pointing finger
      return { art: arm(88, 108, 80, 81, sleeve) + hand("point", 79, 75, -12, 1.1), overFace: false };
    case "happy": // thumbs up
      return { art: arm(88, 108, 78, 83, sleeve) + hand("thumbsUp", 77, 77, 0, 1.15), overFace: false };
    case "think": // hand on chin
      return { art: arm(78, 108, 61, 79, sleeve) + hand("fist", 57, 70, -20, 1.05), overFace: true };
    case "wow": // arms up, celebrating
      return {
        art: arm(20, 100, 14, 60, sleeve) + arm(80, 100, 86, 60, sleeve) +
          hand("open", 13, 53, -14, 1.1, true) + hand("open", 87, 53, 14, 1.1),
        overFace: false,
      };
    case "worried": // facepalm
      return { art: arm(86, 110, 71, 63, sleeve) + hand("open", 62, 45, -38, 1.35), overFace: true };
    case "wave":
      return {
        art: arm(88, 106, 85, 66, sleeve) + hand("open", 85, 58, 14, 1.15) +
          `<path d="M73 46 q-3 4 0 8 M96 47 q3 4 0 8" stroke="#FFF7EE" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
        overFace: false,
      };
  }
}

let drawn = 0; // each drawing needs its own clip-path id

/** The coach as an SVG string, `size` pixels wide. */
export function avatarSvg(mood: Mood, size = 56, outfitName: OutfitName = outfitFor()): string {
  const clip = `avatar-clip-${++drawn}`;
  const outfit = OUTFITS[outfitName];
  const eyeY = mood === "think" ? 48.3 : 50;
  const eyeX = mood === "think" ? 1.2 : 0;
  const extra =
    mood === "think"
      ? `<g fill="#F2EEEA"><circle cx="80" cy="22" r="2.6"/><circle cx="87" cy="13" r="4"/></g>`
      : mood === "wow"
        ? `<g stroke="#FFD166" stroke-width="2.2" stroke-linecap="round"><path d="M30 14 l-3 -5 M50 8 v-5 M70 14 l3 -5"/></g>`
        : mood === "worried"
          ? `<path d="M31 27 q3 5 0 8 q-3 -3 0 -8z" fill="#7FC8F8"/>`
          : "";
  edge = outfit.shade;
  const arms = gesture(mood, outfit.sleeve);
  const face = `<g transform="${HEAD}">
    <ellipse cx="50" cy="53" rx="22.5" ry="25.5" fill="${SKIN}"/>
    <ellipse cx="27.5" cy="56" rx="4" ry="6" fill="${SKIN_SHADE}"/>
    <ellipse cx="72.5" cy="56" rx="4" ry="6" fill="${SKIN_SHADE}"/>
    <path d="M28.5 60 q1.5 24 21.5 28.5 q20 -4.5 21.5 -28.5 q-4 9 -10.5 10 q-11 3.5 -22 0 q-6.5 -1 -10.5 -10z" fill="${HAIR}"/>
    <path d="M41 63.5 q9 -3.5 18 0 q-9 1.8 -18 0z" fill="${HAIR}"/>
    ${HATS[outfit.hat]}
    <path d="${BROWS[mood]}" stroke="${HAIR}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="32.5" y="44" width="15.5" height="11.5" rx="2.5" fill="rgba(255,255,255,0.14)" stroke="#111" stroke-width="2.6"/>
    <rect x="52" y="44" width="15.5" height="11.5" rx="2.5" fill="rgba(255,255,255,0.14)" stroke="#111" stroke-width="2.6"/>
    <path d="M48 47.5 h4 M32.5 47 l-4.5 -1.5 M67.5 47 l4.5 -1.5" stroke="#111" stroke-width="2.2"/>
    <circle cx="${40.3 + eyeX}" cy="${eyeY}" r="2.1" fill="${HAIR}"/>
    <circle cx="${59.7 + eyeX}" cy="${eyeY}" r="2.1" fill="${HAIR}"/>
    <path d="M50 54.5 q-3.2 5.5 0 8" stroke="#5E3824" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${MOUTHS[mood]}
  </g>`;
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${LABELS[mood]}">
  <circle cx="50" cy="50" r="49" fill="var(--avatar-bg, #E8743B)"/>
  <clipPath id="${clip}"><circle cx="50" cy="50" r="49"/></clipPath>
  <g clip-path="url(#${clip})">
    ${outfit.behind ?? ""}
    <rect x="45.5" y="55" width="9" height="14" fill="${SKIN_SHADE}"/>
    <path d="M4 104 C6 80 21 70 40 67 Q50 73.5 60 67 C79 70 94 80 96 104 Z" fill="${outfit.top}"/>
    <path d="M24 104 C25 92 27 84 30 78 M76 104 C75 92 73 84 70 78" stroke="${outfit.shade}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${outfit.front ?? ""}
    ${arms.overFace ? "" : arms.art}
    ${face}
    ${arms.overFace ? arms.art : ""}
    ${extra}
  </g>
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
