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
    version: "3.32",
    items: [
      { icon: "flag", title: "What next, when a game ends", text: "The result comes up with your next steps: review the game, play again with the same settings, or choose another mode." },
      { icon: "back", title: "Back that goes where you expect", text: "Switching between Board, Statistics and History no longer piles up, and a game opened from Game history goes back to it." },
    ],
  },
  {
    version: "3.31",
    items: [
      { icon: "hazard", title: "Your slips, front and centre", text: "After a review, your slips come up first: how many blunders, mistakes and missed chances, each a tap away, and Go to the first slip to start learning from them." },
      { icon: "plus", title: "New, and every other mode", text: "The New button says what comes next in the mode you're in, and its arrow opens the other modes and Home." },
      { icon: "star", title: "The five turning points that mattered", text: "A review shows up to five turning points, the biggest swings, and says how many more are in the full review." },
      { icon: "eye", title: "A streamlined look", text: "A calmer move list, the players beside the board and the summary beside it on a computer, Game history by month, clearer names in the accuracy table, and About in your theme, for a better experience." },
    ],
  },
  {
    version: "3.30",
    items: [
      { icon: "eye", title: "A streamlined look", text: "A tidier Your profile, with Import PGN kept in Game history, for a better experience." },
    ],
  },
  {
    version: "3.29",
    items: [
      { icon: "history", title: "Game history in Your profile", text: "Your profile has a Your games section, with Game history one tap away." },
      { icon: "upload", title: "Import PGN", text: "Add a .pgn file of your Lichess or chess.com games from your device, straight from Game history." },
    ],
  },
  {
    version: "3.28",
    items: [
      { icon: "download", title: "Games from a file into Game history", text: "Open a .pgn file of your Lichess or chess.com games in Analyse a game and tap Add to Game history. They count in your stats and progress, and games already there aren't added twice." },
      { icon: "history", title: "Room for 2,000 games", text: "Game history now keeps up to 2,000 games brought in from other sites, as well as the games you play here." },
    ],
  },
  {
    version: "3.27",
    items: [
      { icon: "bulb", title: "Why the better move is better", text: "When your move was good but not the best, the coach now compares the two: what your move let them do and how the better move stops it, or why the better move comes first, like getting a new piece out while your king is still in the centre." },
      { icon: "star", title: "Just as good", text: "When another move was only a touch better, the coach just names it as just as good, with no card to open." },
      { icon: "shield", title: "No made-up reasons", text: "When there's no clear reason one move is better, the coach says it was a little more accurate rather than giving a reason that doesn't hold up." },
    ],
  },
  {
    version: "3.26",
    items: [
      { icon: "hazard", title: "What it costs, a few moves on", text: "The coach now looks further ahead. When a move loses something a few moves later, it says what and how it starts, like your rook falling to a bishop check. It also names what a better move would have won, checkmates a few moves away, and pawns that run through to promote." },
      { icon: "target", title: "Where your piece is heading", text: "When the better move sets a piece on its way, the coach draws its route and says why it's going there." },
      { icon: "bulb", title: "Taking back with the right piece", text: "Took back with the wrong piece? The coach shows the better one and why, such as freeing your bishop or keeping your queen safe at home." },
      { icon: "play", title: "The better move, straight away", text: "Seeing the better move now plays it in on the board from the position before, with why it's better in one line." },
      { icon: "eye", title: "A streamlined look", text: "Explanations play each move in so you see the piece go, with the arrows after, for a better experience." },
    ],
  },
  {
    version: "3.25",
    items: [
      { icon: "star", title: "Why it's the key move", text: "For a key move, the coach now shows why nothing else works: another move, and the answer that punishes it. When you miss the only good move, the coach tells you." },
      { icon: "close", title: "Clear a pasted game", text: "In Analyse a game, a Clear button empties the game box in one tap." },
    ],
  },
  {
    version: "3.24",
    items: [
      { icon: "bulb", title: "Reasons about your pieces", text: "The coach now spots the opening habits that cost you: the queen out early, the king left in the centre, the same piece moved again, a centre pawn blocked in, a knight on the edge, or a piece that does less where it went." },
      { icon: "play", title: "Faster explanations", text: "The coach gets each explanation ready while you read its comment, so it opens straight away when you tap." },
    ],
  },
  {
    version: "3.23",
    items: [
      { icon: "bulb", title: "The real reason", text: "When a move loses nothing you can see but leaves you worse placed, the coach names why: a hole in front of your king, loosened king cover, or an isolated, doubled or backward pawn, with why it matters." },
      { icon: "target", title: "Better moves, explained", text: "Your better option is said in one line, like stopping their pawn from chasing your bishop, and your next pawn ideas are drawn as arrows." },
      { icon: "shield", title: "What you got away with", text: "When they miss a strong move, the coach shows it, such as their bishop jumping into a hole in front of your king. A plain trade is no longer called a blunder or a chance." },
    ],
  },
  {
    version: "3.22",
    items: [
      { icon: "hazard", title: "Pieces left hanging", text: "When their move threatened a piece and yours didn't deal with it, the coach says so plainly, and the explanation starts from their threat on the board before your move." },
      { icon: "bulb", title: "Castling into trouble", text: "Castle beside a weak pawn and the coach tells you, then shows how their pawns attack it, your best fight back, and why blocking makes it worse." },
      { icon: "search", title: "Try moves while you learn", text: "From any explanation, try your own moves on the board, then go straight back to the coaching." },
      { icon: "eye", title: "A streamlined look", text: "On a computer the board fills the screen with everything else beside it, and explanations show each move's squares and start from the position before, for a better experience." },
    ],
  },
  {
    version: "3.21",
    items: [
      { icon: "bulb", title: "Clearer explanations", text: "A warning sign now means something can really be won from you; a move that only left you worse placed gets the bulb. The coach also names pins, pawns advancing on your king, and lines opening in front of it." },
      { icon: "home", title: "Home and back", text: "A Home button sits beside Back. On a phone, Home, your profile, Settings and the quick tour are in the menu at the top right." },
      { icon: "eye", title: "A streamlined look", text: "On a computer, explanations appear beside the board and the moves panel is roomier, plus clearer review labels, for a better experience." },
    ],
  },
  {
    version: "3.20",
    items: [
      { icon: "download", title: "Updates find you", text: "The installed app now looks for a new version whenever you come back to it, not only when it starts afresh." },
    ],
  },
  {
    version: "3.19",
    items: [
      { icon: "back", title: "Back works in Training", text: "The back button now takes you from a list of lessons to its tab, then home." },
      { icon: "eye", title: "A streamlined look", text: "Gentle transitions between screens, calmer pop-ups, and Training that stays in place as you switch tabs, for a better experience." },
    ],
  },
  {
    version: "3.18",
    items: [
      { icon: "target", title: "Coaching for your level", text: "At beginner level the coach focuses on what decides those games: pieces left loose, free pieces taken or missed, and checkmates, with the habit that would have saved each slip. Choose it in Settings, under Coach me on." },
      { icon: "flag", title: "Real turning points", text: "Only moves that swung the game for a reason you can see on the board. Jump between them with the big buttons, and step through the moves around each one." },
      { icon: "chart", title: "Tidier statistics", text: "Overall accuracy first, with Details for the rest, and Look deeper tucked in the corner." },
      { icon: "eye", title: "A streamlined look", text: "A new Classic dark theme, and tours the coach presents himself, for a better experience." },
    ],
  },
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
