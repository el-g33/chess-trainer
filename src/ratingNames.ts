// What each move rating is called on screen. The ratings keep their own names
// inside the app (saved reviews, mistakes and the tests use them); these are
// the app's own words for them, with its own badges (badge.ts) and colours.

export const RATING_NAMES: Record<string, string> = {
  Brilliant: "Masterstroke",
  Great: "Key move",
  Best: "Top move",
  Excellent: "Strong",
  Good: "Solid",
  Book: "Theory",
  Forced: "Only move",
  Inaccuracy: "Imprecise",
  Mistake: "Mistake",
  Miss: "Missed chance",
  "Missed Win": "Missed win",
  Blunder: "Blunder",
};

/** A rating as it's shown: "Brilliant" -> "Masterstroke". */
export const ratingName = (rating: string) => RATING_NAMES[rating] ?? rating;

/** Every rating's name, in a piece of text made with the ratings' own names
 *  ("4.Nxe5 Excellent → Inaccuracy" -> "4.Nxe5 Strong → Imprecise"). */
export function withRatingNames(text: string): string {
  return text.replace(/Missed Win|Brilliant|Great|Best|Excellent|Good|Book|Forced|Inaccuracy|Miss(?!ed)/g, (name) => ratingName(name));
}
