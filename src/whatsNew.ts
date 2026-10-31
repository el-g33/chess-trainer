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
    version: "3.17",
    items: [
      { icon: "chart", title: "Played like", text: "Statistics now say the level each side played at, from Beginner to Expert, instead of a rating number." },
      { icon: "eye", title: "A streamlined look", text: "The Forest theme's board is now a deep teal, for a better experience." },
    ],
  },
  {
    version: "3.16",
    items: [
      { icon: "search", title: "New names", text: "Looking back at a game is now called Analyse a game, and the moments that decided it are its Turning points." },
    ],
  },
  {
    version: "3.15",
    items: [
      { icon: "search", title: "A guide to analysing a game", text: "The first time you open Analyse a game, a short tour shows how to bring in your games: from this app, by username, or pasted as a PGN." },
      { icon: "eye", title: "A streamlined look", text: "Shorter lines from the coach on the main menu, which now stays the same size, for a better experience." },
    ],
  },
  {
    version: "3.14",
    items: [
      { icon: "chart", title: "Lighter on your phone", text: "Opens faster, gives memory back when the coach isn't thinking, and the wood board is a quarter of the size." },
    ],
  },
  {
    version: "3.13",
    items: [
      { icon: "upload", title: "Lighter updates", text: "From now on, an update downloads only what changed, not the whole app, so it uses far less of your data." },
      { icon: "chart", title: "Smoother reviews", text: "While a game is being analysed, the screen updates in calm steps, which is easier on your phone's battery." },
    ],
  },
  {
    version: "3.12",
    items: [
      { icon: "eye", title: "A streamlined look", text: "The coach now wears your theme's colour, and Rose quartz shows the last move in sage green, for a better experience." },
    ],
  },
  {
    version: "3.11",
    items: [
      { icon: "book", title: "Opening principles", text: "Six short lessons at the top of Training's Openings tab: take the centre, develop, castle early, don't waste moves, watch f7, and connect your rooks." },
    ],
  },
  {
    version: "3.10",
    items: [
      { icon: "back", title: "Back goes where you came from", text: "Leaving a lesson, puzzles or a game takes you back to the screen you started it from, not all the way Home." },
      { icon: "book", title: "Castled means castled", text: "The coach no longer calls your king castled when it has only walked over and its rook is still stuck in the corner." },
      { icon: "eye", title: "A streamlined look", text: "Clearer board coordinates, from either side of the board, for a better experience." },
    ],
  },
  {
    version: "3.9",
    items: [
      { icon: "back", title: "A back button everywhere", text: "One round button, top left, on every screen. In a review it takes you from the board back to the summary." },
      { icon: "bulb", title: "The coach talks like a coach", text: "One clear sentence per move, and every line ends with where it leaves you: level, better, or winning." },
      { icon: "book", title: "Lesson notes, one idea at a time", text: "Tap the dots on a lesson move to go through its note a sentence at a time, each with its own picture." },
      { icon: "eye", title: "A streamlined look", text: "Calmer pictures on the board and fewer labels in the coach's words, for a better experience." },
    ],
  },
  {
    version: "3.8",
    items: [
      { icon: "flag", title: "Turning points", text: "A review picks out the moments that decided your game. Go through just those or every move, and switch whenever you like." },
      { icon: "bulb", title: "Explanations that fit the move", text: "Tap a move's sign to see why. A simple take is one picture; the moves play out only when there's a real tactic." },
      { icon: "user", title: "From your side", text: "When your opponent slips, the coach says so from your point of view, and how bad it was." },
      { icon: "book", title: "Clearer opening lessons", text: "Each move is pictured with one short line, and the end of a line shows your plan, their answer and the weak spots on both sides." },
      { icon: "back", title: "Back means back", text: "Your phone's back gesture now steps back through the app instead of closing it." },
      { icon: "eye", title: "A streamlined look", text: "Move signs, a calmer board for trying moves and quicker coach words, for a better experience." },
    ],
  },
  {
    version: "3.7",
    items: [
      { icon: "bulb", title: "Why the better move is better", text: "When you open a slip in a review, I now explain what the better move does, the reply it takes away, and what your move cost." },
      { icon: "target", title: "Find it yourself", text: "At the end, step back to before your move and play the better one; I'll tell you if you've found it." },
      { icon: "eye", title: "A streamlined look", text: "Livelier move badges, matched to your theme, for a better experience." },
    ],
  },
  {
    version: "3.6",
    items: [
      { icon: "rapid", title: "Pre-moves", text: "In a timed game, set up your next move while the coach is thinking: it plays the moment the coach has moved." },
      { icon: "user", title: "Play against the coach", text: "Your opponent is now the coach, at the level you choose." },
    ],
  },
  {
    version: "3.5",
    items: [
      { icon: "chart", title: "Move ratings, renamed", text: "Masterstroke, Key move, Top move, Strong, Solid, Theory, Imprecise and Missed chance, with new badges. The ratings themselves are the same." },
      { icon: "download", title: "Games from chess.com", text: "Copy or download a game's PGN on chess.com and paste it into Analyse a game. Lichess games still come in with Get my games." },
    ],
  },
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
