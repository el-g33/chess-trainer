// What's new: shown once after the app updates (the versions since the one
// you last saw, newest first), and from Settings any time. Add an entry here
// with each version you publish (package.json's version, without the .0).
// Gameplay changes are spelled out, one each; changes to how things look go
// together in one short line.

export interface Release {
  version: string; // "3.2"
  items: { icon: string; title: string; text: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "3.4",
    items: [
      { icon: "user", title: "A streamlined look", text: "Your profile has its own button, and Settings keeps one size, for a better experience." },
    ],
  },
  {
    version: "3.3",
    items: [
      { icon: "puzzle", title: "Your slips, as you go", text: "I tell you once when slips are saved, point each one out in the review, and offer them as puzzles at the end." },
      { icon: "eye", title: "A streamlined look", text: "A cleaner review and settings, for a better experience." },
    ],
  },
  {
    version: "3.2",
    items: [
      { icon: "download", title: "Your Lichess games", text: "Add your Lichess username in Your profile, then Get my games. Tap any game to review it." },
      { icon: "knight", title: "Choose your promotion", text: "A pawn on the last rank can become a queen, knight, rook or bishop." },
      { icon: "eye", title: "New themes and a streamlined look", text: "Two new themes, and a fresher look for a better experience." },
    ],
  },
  {
    version: "3.1",
    items: [
      { icon: "target", title: "How the game got there", text: "Your mistakes now show the moves before the puzzle, and play their last move for you." },
      { icon: "eye", title: "A streamlined look", text: "A tidier Training screen, for a better experience." },
    ],
  },
  {
    version: "3.0",
    items: [
      { icon: "target", title: "Your mistakes, as puzzles", text: "Slips from your reviewed games come back to practise, spaced out as you get them right." },
      { icon: "chart", title: "Your progress", text: "What your reviewed games add up to: your strongest and weakest phases and habits." },
      { icon: "book", title: "Six more openings", text: "French, Scandinavian, Nimzo-Indian, English, Scotch and lines against 1.c4 and 1.Nf3." },
      { icon: "upload", title: "Back up your data", text: "Keep your games and mistakes safe in one small file, from Settings." },
    ],
  },
];

const SEEN_KEY = "chess-trainer-seen-version";

/** "3.2" from the build label "3.2 · 27 Oct 2026". */
export const shortVersion = (build: string) => build.split(" ")[0];

const newer = (a: string, b: string) => {
  const [a1, a2 = 0] = a.split(".").map(Number);
  const [b1, b2 = 0] = b.split(".").map(Number);
  return a1 !== b1 ? a1 > b1 : a2 > b2;
};

/** The releases after `seen`, up to `current`, newest first. */
export function releasesSince(seen: string, current: string): Release[] {
  return RELEASES.filter((r) => newer(r.version, seen) && !newer(r.version, current));
}

/** At start-up: what to show now (empty if nothing). The first visit shows
 *  nothing; someone who used the app before this was added last saw 3.1. */
export function newSinceLastVisit(current: string): Release[] {
  let seen: string | null = null;
  let usedBefore = false;
  try {
    seen = localStorage.getItem(SEEN_KEY);
    usedBefore = localStorage.getItem("chess-trainer-settings") !== null;
    localStorage.setItem(SEEN_KEY, current);
  } catch {
    return []; // storage blocked: no way to tell, so say nothing
  }
  if (seen === null) return usedBefore ? releasesSince("3.1", current) : [];
  return releasesSince(seen, current);
}
