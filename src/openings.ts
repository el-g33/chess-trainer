// Opening knowledge for the trainer - a port of the desktop app's
// openings.py (same repertoire, same rules, same wording).
//
//   OpeningBook  - the lichess opening database (public/openings/*.tsv, about
//                  3,500 named lines). Positions are looked up by what is on
//                  the board, not by the moves played, so transpositions are
//                  recognised automatically.
//   REPERTOIRE   - hand-picked openings grouped by level, each with a target
//                  setup and a plan, so it can be played - and coached - by
//                  its ideas rather than as a fixed list of moves.
//   chooseOpeningMove() - how Stockfish plays an opening like a sensible human.
//   coachOpeningMove()  - feedback on your moves in your chosen opening.
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeUci, parseSquare } from "chessops/util";

import { afterMove, isCastling, type Score } from "./coach";
import { winningChance } from "./review";

// The opening phase is over after this many moves (each side).
export const OPENING_MOVES = 15;

// How much worse than Stockfish's best move (in percentage points of winning
// chance) a book or setup move may be and still be played. Lower levels stick
// to their opening more stubbornly, like a club player who knows their lines.
const TOLERANCE_BY_LEVEL = [12, 12, 10, 8, 8, 5, 4, 3];

// Levels 1-3, 4-5 and 6-8 (counting from 0) get openings from tiers 1, 2 and 3.
const TIER_BY_LEVEL = [1, 1, 1, 2, 2, 3, 3, 3];
const GAMBIT_TOLERANCE = 25; // winning-chance points a gambit's book move may cost
export const TIER_NAMES: Record<number, string> = { 1: "levels 1-3", 2: "levels 4-5", 3: "levels 6-8" };

// Catch-all names for the first moves, before a real opening takes shape
const GENERIC_NAMES = new Set([
  "Queen's Pawn Game", "King's Pawn Game", "Indian Defense", "Zukertort Opening",
  "King's Knight Opening", "Hungarian Opening", "Van't Kruijs Opening",
]);

/** The position as the book knows it: pieces, side to move, castling, en passant. */
export const epdOf = (position: Chess) => makeFen(position.toSetup()).split(" ").slice(0, 4).join(" ");

// ---------------------------------------------------------------------------
// The opening database
// ---------------------------------------------------------------------------

export type Named = [eco: string, name: string, pgn: string];

export interface BookMove {
  move: NormalMove;
  names: Set<string>;
}

export interface OpeningInfo {
  book: boolean; // a known theory move
  opening: [eco: string, name: string] | null; // the opening's name so far
  notes: string[]; // transpositions, opening changes
}

export class OpeningBook {
  readonly named = new Map<string, Named>(); // position -> (eco, name, usual moves)
  readonly continuations = new Map<string, Map<string, BookMove>>(); // position -> {move: opening names}

  /** Reads the database (a, b, c, d, e .tsv files, in that order). */
  static async load(): Promise<OpeningBook> {
    const book = new OpeningBook();
    const files = await Promise.all(
      ["a", "b", "c", "d", "e"].map(async (letter) => {
        const response = await fetch(`${import.meta.env.BASE_URL}openings/${letter}.tsv`);
        if (!response.ok) throw new Error(`${letter}.tsv: ${response.status}`);
        return response.text();
      }),
    );
    for (const text of files) {
      const [header, ...rows] = text.split(/\r?\n/);
      const columns = header.split("\t");
      const [eco, name, pgn] = ["eco", "name", "pgn"].map((c) => columns.indexOf(c));
      for (const row of rows) {
        if (!row.trim()) continue;
        const cells = row.split("\t");
        book.addLine(cells[eco], cells[name], cells[pgn]);
      }
    }
    return book;
  }

  private addLine(eco: string, name: string, pgn: string) {
    const board = Chess.default();
    for (const token of pgn.split(/\s+/)) {
      if (!token || /^\d/.test(token)) continue; // move numbers like "1." or "3..."
      const move = parseSan(board, token) as NormalMove | undefined;
      if (!move) throw new Error(`Bad move ${token} in ${name}`);
      const key = epdOf(board);
      let moves = this.continuations.get(key);
      if (!moves) this.continuations.set(key, (moves = new Map()));
      const uci = makeUci(move);
      let entry = moves.get(uci);
      if (!entry) moves.set(uci, (entry = { move, names: new Set() }));
      entry.names.add(name);
      board.play(move);
    }
    this.named.set(epdOf(board), [eco, name, pgn]);
  }

  /** (eco, name, usual moves) if this exact position has a name. */
  nameOf(position: Chess): Named | undefined {
    return this.named.get(epdOf(position));
  }

  /** Theory moves from this position, optionally only those belonging to the
   *  given opening families. Keyed by the move in UCI form. */
  bookMoves(position: Chess, families?: string[]): Map<string, BookMove> {
    const moves = this.continuations.get(epdOf(position)) ?? new Map<string, BookMove>();
    if (!families) return new Map(moves);
    return new Map([...moves].filter(([, entry]) => [...entry.names].some((n) => inFamily(n, families))));
  }

  /** For each move of a game: the opening name so far, and notes about book
   *  moves and transpositions. */
  gameOpenings(start: Chess, moves: NormalMove[]): OpeningInfo[] {
    const board = start.clone();
    let current: [string, string] | null = null;
    const played: string[] = [];
    const result: OpeningInfo[] = [];
    for (const move of moves) {
      const book = this.bookMoves(board).has(makeUci(move));
      played.push(makeSan(board, move));
      board.play(move);
      const notes: string[] = [];
      const named = this.nameOf(board);
      if (named) {
        const [eco, name, usual] = named;
        const usualMoves = usual.split(/\s+/).filter((t) => t && !/^\d/.test(t));
        if (usualMoves.join(" ") !== played.join(" ")) {
          notes.push(`Transposition: this position is usually reached by ${usual}.`);
        }
        // General names getting more specific (Queen's Pawn Game -> Indian
        // Defense) isn't news; a switch between real openings is.
        if (current && family(current[1]) !== family(name) && !GENERIC_NAMES.has(family(current[1]))) {
          notes.push(`The opening has changed from ${current[1]} to ${name}.`);
        }
        current = [eco, name];
      }
      result.push({ book, opening: current, notes });
    }
    return result;
  }
}

/** "King's Indian Defense: Classical Variation" -> "King's Indian Defense" */
export function family(name: string): string {
  return name.split(":")[0].split(",")[0].trim();
}

/** The opening most of these lines belong to, e.g. for labelling a theory move. */
export function mainFamily(names: Iterable<string>): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(family(name), (counts.get(family(name)) ?? 0) + 1);
  let best = "";
  for (const [name, count] of counts) if (!best || count > counts.get(best)!) best = name;
  return best;
}

/** Does an opening name belong to one of the families? A family matches the
 *  start of the name; one starting with "~" may appear anywhere in it. */
export function inFamily(name: string, families: string[]): boolean {
  return families.some((f) => (f.startsWith("~") ? name.includes(f.slice(1)) : name.startsWith(f)));
}

// ---------------------------------------------------------------------------
// The repertoire: openings by level, each with a setup and a plan
// ---------------------------------------------------------------------------
// A setup is a list of goals, in the order the plan wants them. ["N", ["f3"]]
// means "a knight on f3"; ["B", ["c5", "e7"]] means "a bishop on c5 or e7";
// "O-O" means castled kingside and "castled" means castled on either side.
// A goal marked "break" (a pawn break like ...e5) only counts once all the
// other goals are met. A Black opening can have different systems depending
// on White's first move.

export type Goal = "O-O" | "castled" | [piece: string, squares: string[], kind?: "break"];

export interface OpeningSystem {
  // The first moves this system answers (null: any): White's first move for a
  // Black opening ("e4"), or both first moves for a White opening ("e4 c6")
  when: string[] | null;
  label: string;
  families: string[];
  setup: Goal[];
}

export interface Opening {
  name: string;
  colour: Color;
  tier: number;
  gambit?: boolean; // unsound but tricky: listed under "Gambits & traps", never suggested
  menu?: string; // a shorter name for the drop-down menus
  plan: string;
  systems: OpeningSystem[];
}

export const REPERTOIRE: Opening[] = [
  // ---- Tier 1: fundamentals (levels 1-3) ----
  {
    name: "Italian Game", colour: "white", tier: 1,
    plan: "Put a pawn on e4, develop the knight to f3 and the bishop to c4 (aiming at " +
      "Black's weak f7 square), castle quickly, then build with c3 and d3 before " +
      "pushing d4 later.",
    systems: [{ when: null, label: "Italian Game", families: ["Italian Game"],
      setup: [["P", ["e4"]], ["N", ["f3"]], ["B", ["c4"]], "O-O", ["P", ["d3"]], ["P", ["c3"]]] }],
  },
  {
    name: "London System", colour: "white", tier: 1,
    plan: "Pawn to d4, then the bishop out to f4 BEFORE playing e3 so it isn't locked " +
      "in. Then e3, Nf3, c3, Bd3, Nbd2 and castle: a solid pyramid of pawns with " +
      "every piece developed. The same setup works against almost anything.",
    systems: [{ when: null, label: "London System", families: ["~London System"],
      setup: [["P", ["d4"]], ["B", ["f4"]], ["N", ["f3"]], ["P", ["e3"]], ["P", ["c3"]], ["B", ["d3"]],
        ["N", ["d2"]], "O-O"] }],
  },
  {
    name: "Classical centre (...e5 / ...d5)", colour: "black", tier: 1,
    plan: "Answer White's centre pawn with your own: ...e5 against 1.e4, ...d5 against " +
      "1.d4. Develop knights before bishops, castle early, and don't move the same " +
      "piece twice without a good reason.",
    systems: [
      { when: ["e4"], label: "Open Game (...e5)",
        families: ["Italian Game", "Ruy Lopez", "Scotch Game", "Four Knights Game", "Three Knights Opening",
          "King's Knight Opening", "King's Pawn Game", "Bishop's Opening", "Vienna Game", "Ponziani Opening"],
        setup: [["P", ["e5"]], ["N", ["c6"]], ["N", ["f6"]], ["B", ["c5", "e7"]], ["P", ["d6"]], "O-O"] },
      { when: null, label: "Queen's Gambit Declined (...d5)",
        families: ["Queen's Gambit Declined", "Queen's Pawn Game", "English Opening", "Zukertort Opening",
          "Réti Opening"],
        setup: [["P", ["d5"]], ["P", ["e6"]], ["N", ["f6"]], ["B", ["e7"]], "O-O", ["N", ["d7"]]] },
    ],
  },
  // ---- Tier 2: club (levels 4-5) ----
  {
    name: "Queen's Gambit", colour: "white", tier: 2,
    plan: "Offer the c-pawn with 2.c4 to pull Black's d-pawn away from the centre. " +
      "Develop the knights to c3 and f3, the bishops actively (g5 or f4, then d3), " +
      "and castle. If Black takes on c4, win the pawn back with e3 and Bxc4.",
    systems: [{ when: null, label: "Queen's Gambit", families: ["Queen's Gambit", "Slav Defense", "Semi-Slav Defense"],
      setup: [["P", ["d4"]], ["P", ["c4"]], ["N", ["c3"]], ["N", ["f3"]], ["B", ["g5", "f4"]], ["P", ["e3"]],
        ["B", ["d3", "e2"]], "O-O"] }],
  },
  {
    name: "Rapport-Jobava System", colour: "white", tier: 2,
    plan: "Knight to c3 BEFORE any c4, and the bishop to f4 (a 'Jobava London'). " +
      "Aggressive and flexible: typical ideas are Nb5 hitting c7, e3 with Bd3, and " +
      "sometimes castling queenside before a kingside pawn storm.",
    systems: [{ when: null, label: "Rapport-Jobava System", families: ["Rapport-Jobava"],
      setup: [["P", ["d4"]], ["N", ["c3"]], ["B", ["f4"]], ["P", ["e3"]], ["N", ["f3"]], ["B", ["d3", "e2", "b5"]],
        "castled"] }],
  },
  {
    name: "Caro-Kann / Slav (...c6 and ...d5)", menu: "Caro-Kann / Slav", colour: "black", tier: 2,
    plan: "Support ...d5 with ...c6 so you can recapture with a pawn. Get the " +
      "light-squared bishop out (to f5 or g4) BEFORE ...e6 so it isn't locked in, " +
      "then ...e6, ...Nd7 and castle: a very solid structure.",
    systems: [
      { when: ["e4"], label: "Caro-Kann Defence", families: ["Caro-Kann"],
        setup: [["P", ["c6"]], ["P", ["d5"]], ["B", ["f5", "g4"]], ["P", ["e6"]], ["N", ["f6"]], ["N", ["d7"]], "O-O"] },
      { when: null, label: "Slav Defence", families: ["Slav Defense", "Semi-Slav Defense"],
        setup: [["P", ["d5"]], ["P", ["c6"]], ["N", ["f6"]], ["B", ["f5", "g4"]], ["P", ["e6"]], ["N", ["d7"]], "O-O"] },
    ],
  },
  // ---- Tier 3: advanced (levels 6-8) ----
  {
    name: "Ruy Lopez", colour: "white", tier: 3,
    plan: "After 1.e4 e5 2.Nf3 Nc6, Bb5 pressures the knight that defends e5. Castle, " +
      "Re1, then c3 and d4 to build a big centre. A game of long-term pressure " +
      "rather than quick attacks.",
    systems: [{ when: null, label: "Ruy Lopez", families: ["Ruy Lopez"],
      setup: [["P", ["e4"]], ["N", ["f3"]], ["B", ["b5", "a4", "b3"]], "O-O", ["R", ["e1"]], ["P", ["c3"]],
        ["P", ["d4"]]] }],
  },
  {
    name: "King's Indian / Pirc setup", colour: "black", tier: 3,
    plan: "Let White build a big centre, fianchetto the bishop to g7, castle, then hit " +
      "back at the centre with ...e5 (or ...c5). Later Black often attacks on the " +
      "kingside with ...f5. The same setup is called the Pirc against 1.e4.",
    systems: [
      { when: ["e4"], label: "Pirc Defence", families: ["Pirc Defense", "Modern Defense"],
        setup: [["P", ["d6"]], ["N", ["f6"]], ["P", ["g6"]], ["B", ["g7"]], "O-O", ["P", ["e5", "c5"], "break"]] },
      { when: null, label: "King's Indian Defence", families: ["King's Indian Defense", "East Indian Defense"],
        setup: [["N", ["f6"]], ["P", ["g6"]], ["B", ["g7"]], ["P", ["d6"]], "O-O", ["P", ["e5", "c5"], "break"]] },
    ],
  },
  {
    name: "Sicilian Defence", colour: "black", tier: 3,
    plan: "Fight for the centre from the side with ...c5, trade your c-pawn for White's " +
      "d-pawn, then develop and use the half-open c-file for counterplay. Sharp: " +
      "keep an eye on your king. (Against 1.d4, Stockfish uses the King's Indian " +
      "setup instead.)",
    systems: [
      { when: ["e4"], label: "Sicilian Defence", families: ["Sicilian Defense"],
        setup: [["P", ["c5"]], ["P", ["d6"]], ["N", ["f6"]], ["N", ["c6"]], ["P", ["e6"]], ["B", ["e7"]], "O-O"] },
      { when: null, label: "King's Indian Defence", families: ["King's Indian Defense", "East Indian Defense"],
        setup: [["N", ["f6"]], ["P", ["g6"]], ["B", ["g7"]], ["P", ["d6"]], "O-O", ["P", ["e5", "c5"], "break"]] },
    ],
  },
  // ---- Added in the web version (no desktop equivalent) ----
  {
    name: "Catalan Opening", colour: "white", tier: 3,
    plan: "Pawns to d4 and c4 like the Queen's Gambit, but the bishop goes to g2 " +
      "(after g3), where it presses on the long diagonal towards b7 and Black's " +
      "queenside. Knight to f3 and castle; if Black takes on c4, win the pawn back " +
      "calmly with Qa4+ or Qc2.",
    systems: [{ when: null, label: "Catalan Opening",
      families: ["Catalan Opening", "Queen's Pawn Game", "Indian Defense", "Queen's Gambit Declined", "Slav Defense"],
      setup: [["P", ["d4"]], ["P", ["c4"]], ["P", ["g3"]], ["B", ["g2"]], ["N", ["f3"]], "O-O"] }],
  },
  {
    name: "Black Lion (Philidor, Hanham)", colour: "black", tier: 2,
    plan: "A compact setup: ...d6, ...Nf6, ...Nbd7 and ...e5, then ...Be7, ...c6 and " +
      "castle. Keep the pawn on e5 so White can't open the centre, and watch out for " +
      "Bc4 with Ng5 aiming at f7. Later, ...h6 and ...g5 ('the Lion's claw') can grab " +
      "space on the kingside.",
    systems: [
      { when: ["e4"], label: "Black Lion (Philidor)", families: ["Philidor Defense", "Lion Defense", "Pirc Defense"],
        setup: [["P", ["d6"]], ["N", ["f6"]], ["N", ["d7"]], ["P", ["e5"]], ["B", ["e7"]], ["P", ["c6"]], "O-O"] },
      { when: null, label: "Old Indian (Lion setup)", families: ["Old Indian Defense", "Indian Defense", "Queen's Pawn Game"],
        setup: [["N", ["f6"]], ["P", ["d6"]], ["N", ["d7"]], ["P", ["e5"]], ["B", ["e7"]], ["P", ["c6"]], "O-O"] },
    ],
  },
  {
    name: "Stafford Gambit", colour: "black", tier: 1, gambit: true,
    plan: "After 1.e4 e5 2.Nf3 Nf6 3.Nxe5, give up the e-pawn with ...Nc6 and, after " +
      "Nxc6, take back with ...dxc6 for open lines, ...Bc5 and quick threats against " +
      "f2. It's unsound (about +2 for White with correct play), but the traps catch " +
      "many players. Against other moves, develop normally: ...Nf6, ...Nc6, ...Bc5.",
    systems: [
      { when: ["e4"], label: "Stafford Gambit", families: ["Petrov's Defense"],
        setup: [["P", ["e5"]], ["N", ["f6"]], ["N", ["c6"]], ["B", ["c5"]], "O-O"] },
      { when: null, label: "Queen's Gambit Declined (...d5)",
        families: ["Queen's Gambit Declined", "Queen's Pawn Game", "English Opening", "Zukertort Opening",
          "Réti Opening"],
        setup: [["P", ["d5"]], ["P", ["e6"]], ["N", ["f6"]], ["B", ["e7"]], "O-O", ["N", ["d7"]]] },
    ],
  },
  {
    name: "Alien Gambit (vs the Caro-Kann)", menu: "Alien Gambit (vs Caro-Kann)", colour: "white", tier: 1, gambit: true,
    plan: "Against the Caro-Kann (1...c6) with 4...Nf6: 5.Ng5 and, after ...h6, the " +
      "knight sacrifice Nxf7 to drag Black's king out. It's unsound (Black is clearly " +
      "better with correct play), but dangerous in practice. Against anything else, " +
      "play the Italian Game.",
    systems: [
      { when: ["e4 c6"], label: "Alien Gambit", families: ["Caro-Kann Defense: Alien Gambit"],
        setup: [["P", ["e4"]], ["P", ["d4"]], ["N", ["c3"]], ["N", ["f3"]], ["B", ["c4", "d3"]], "O-O"] },
      { when: null, label: "Italian Game", families: ["Italian Game"],
        setup: [["P", ["e4"]], ["N", ["f3"]], ["B", ["c4"]], "O-O", ["P", ["d3"]], ["P", ["c3"]]] },
    ],
  },
  // ---- Added with fix 5 ----
  {
    name: "French Defence", colour: "black", tier: 2,
    plan: "Answer 1.e4 with ...e6 and ...d5. If White pushes e5, attack the pawn chain " +
      "at its base with ...c5, adding ...Nc6 and ...Qb6 against d4. The light-squared " +
      "bishop is the problem piece: free it later with ...f6 or by trading it.",
    systems: [
      { when: ["e4"], label: "French Defence", families: ["French Defense"],
        setup: [["P", ["e6"]], ["P", ["d5"]], ["P", ["c5"]], ["N", ["c6"]], ["N", ["f6", "d7", "e7", "f5"]],
          ["B", ["e7", "d6", "c5", "b4"]], "O-O"] },
      { when: null, label: "Queen's Gambit Declined (...d5)",
        families: ["Queen's Gambit Declined", "Queen's Pawn Game", "English Opening", "Zukertort Opening",
          "Réti Opening"],
        setup: [["P", ["d5"]], ["P", ["e6"]], ["N", ["f6"]], ["B", ["e7"]], "O-O", ["N", ["d7"]]] },
    ],
  },
  {
    name: "Scandinavian Defence", colour: "black", tier: 1,
    plan: "Hit e4 at once with 1...d5 and take back with the queen (or the knight). " +
      "Put the queen on a5 or d6, develop the bishop to f5 or g4 before ...e6, add " +
      "...c6 for a safe queen retreat, then ...Nbd7 and castle.",
    systems: [
      { when: ["e4"], label: "Scandinavian Defence", families: ["Scandinavian Defense"],
        setup: [["Q", ["a5", "d6"]], ["N", ["f6"]], ["B", ["f5", "g4"]], ["P", ["c6"]], ["P", ["e6"]],
          ["N", ["d7", "c6"]], "castled"] },
      { when: null, label: "Queen's Gambit Declined (...d5)",
        families: ["Queen's Gambit Declined", "Queen's Pawn Game", "English Opening", "Zukertort Opening",
          "Réti Opening"],
        setup: [["P", ["d5"]], ["P", ["e6"]], ["N", ["f6"]], ["B", ["e7"]], "O-O", ["N", ["d7"]]] },
    ],
  },
  {
    name: "Nimzo-Indian Defence", colour: "black", tier: 3,
    plan: "Against 1.d4: ...Nf6, ...e6 and, after Nc3, ...Bb4 to pin the knight so " +
      "White can't push e4. Castle, then fight for the centre with ...d5 or ...c5; " +
      "taking on c3 gives White doubled pawns to aim at. Without Nc3, play ...b6 " +
      "(the Queen's Indian). Against 1.e4, play ...e5.",
    systems: [
      { when: ["e4"], label: "Open Game (...e5)",
        families: ["Italian Game", "Ruy Lopez", "Scotch Game", "Four Knights Game", "Three Knights Opening",
          "King's Knight Opening", "King's Pawn Game", "Bishop's Opening", "Vienna Game", "Ponziani Opening"],
        setup: [["P", ["e5"]], ["N", ["c6"]], ["N", ["f6"]], ["B", ["c5", "e7"]], ["P", ["d6"]], "O-O"] },
      { when: null, label: "Nimzo-Indian Defence",
        families: ["Nimzo-Indian Defense", "Queen's Indian Defense", "Bogo-Indian Defense", "Indian Defense",
          "Queen's Pawn Game"],
        setup: [["N", ["f6"]], ["P", ["e6"]], ["B", ["b4", "e7", "b7", "a6"]], "O-O", ["P", ["d5", "c5"], "break"]] },
    ],
  },
  {
    name: "Anti-English (vs 1.c4 and 1.Nf3)", menu: "vs English / Réti", colour: "black", tier: 2,
    plan: "Against 1.c4, take the centre with ...e5 - a Sicilian with the colours " +
      "reversed: ...Nf6, ...d5 or ...Nc6, ...Be7 and castle. Against 1.Nf3, ...d5 " +
      "with ...Nf6, ...e6, ...Be7 and castle, adding ...c5 for space. Against 1.e4 " +
      "and 1.d4, the classical ...e5 and ...d5.",
    systems: [
      { when: ["c4"], label: "Reversed Sicilian (...e5)", families: ["English Opening"],
        setup: [["P", ["e5"]], ["N", ["f6", "c6"]], ["N", ["c6", "b6", "d5"]], ["B", ["e7", "g7", "b4", "c5"]], "O-O"] },
      { when: ["e4"], label: "Open Game (...e5)",
        families: ["Italian Game", "Ruy Lopez", "Scotch Game", "Four Knights Game", "Three Knights Opening",
          "King's Knight Opening", "King's Pawn Game", "Bishop's Opening", "Vienna Game", "Ponziani Opening"],
        setup: [["P", ["e5"]], ["N", ["c6"]], ["N", ["f6"]], ["B", ["c5", "e7"]], ["P", ["d6"]], "O-O"] },
      { when: null, label: "Queen's Gambit Declined (...d5)",
        families: ["Queen's Gambit Declined", "Queen's Pawn Game", "English Opening", "Zukertort Opening",
          "Réti Opening"],
        setup: [["P", ["d5"]], ["P", ["e6"]], ["N", ["f6"]], ["B", ["e7"]], "O-O", ["N", ["d7"]]] },
    ],
  },
  {
    name: "English Opening", colour: "white", tier: 2,
    plan: "1.c4 controls d5 from the side. Nc3, g3 and Bg2 aim the bishop down the " +
      "long diagonal; Nf3 and castle. Then expand on the queenside with a3 and b4 " +
      "(or Rb1 and b4), or open the centre with d4 when it suits you.",
    systems: [{ when: null, label: "English Opening", families: ["English Opening"],
      setup: [["P", ["c4"]], ["N", ["c3"]], ["P", ["g3"]], ["B", ["g2"]], ["N", ["f3"]], "O-O"] }],
  },
  {
    name: "Scotch Game", colour: "white", tier: 2,
    plan: "After 1.e4 e5 2.Nf3 Nc6, open the centre at once with 3.d4 and take back " +
      "with the knight. Develop quickly - Nc3, Bd3 or Be2, castle - and use the open " +
      "lines; after Nxc6 bxc6, Black's split pawns are targets. Against other replies " +
      "to 1.e4, develop the Italian way.",
    systems: [
      { when: ["e4 e5"], label: "Scotch Game", families: ["Scotch Game"],
        setup: [["P", ["e4"]], ["N", ["f3", "d4"]], ["N", ["c3"]], ["B", ["d3", "e2", "c4"]], "O-O"] },
      { when: null, label: "Italian Game", families: ["Italian Game"],
        setup: [["P", ["e4"]], ["N", ["f3"]], ["B", ["c4"]], "O-O", ["P", ["d3"]], ["P", ["c3"]]] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Adaptations: standard ways each opening adjusts to what the opponent does
// ---------------------------------------------------------------------------
// The setups above describe the opening when the opponent plays "normally".
// These are the well-known answers when they don't - e.g. taking the Englund
// Gambit pawn with dxe5 instead of carrying on with the London setup. Each
// comes from a named lichess line (source), and every one is checked against
// full-strength Stockfish by tests/verify_adaptations.py. They are only
// candidates: the plan still checks each with Stockfish before suggesting it.

export interface Adaptation {
  name: string; // what the opponent did, e.g. "Englund Gambit"
  moves: string[]; // the answers, in notation (only legal ones count)
  when: (position: Chess, me: Color) => boolean; // the situation
  why: string; // the idea, in plain words
  source: string; // where the answer comes from
}

const at = (position: Chess, square: string) => position.board.get(parseSquare(square)!);
/** Is there a piece (letter P N B R Q K) of `colour` on every one of these squares? */
const has = (position: Chess, colour: Color, letter: string, ...squares: string[]) =>
  squares.every((s) => {
    const piece = at(position, s);
    return piece?.color === colour && piece.role === PIECE_ROLES_BY_LETTER[letter];
  });
const PIECE_ROLES_BY_LETTER: Record<string, Role> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const early = (position: Chess, moves = 4) => position.fullmoves <= moves;

/** No enemy pawn in the centre (c4-f4, c5-f5) and no knight eyeing e4/d4:
 *  the opponent has left the centre to you. */
function centreConceded(position: Chess, me: Color, knightSquare: string): boolean {
  const them: Color = me === "white" ? "black" : "white";
  const centre = ["c4", "d4", "e4", "f4", "c5", "d5", "e5", "f5"];
  return !centre.some((s) => has(position, them, "P", s)) && !has(position, them, "N", knightSquare);
}

const ENGLUND: Adaptation = {
  name: "Englund Gambit (1...e5)",
  moves: ["dxe5"],
  when: (p, me) => early(p, 3) && has(p, me, "P", "d4") && has(p, opp(me), "P", "e5"),
  why: "They've offered the e5 pawn. Take it with dxe5: Black's quick tricks (...Qe7, ...Nc6, ...Qxe5) are known not to work, and your setup can follow afterwards.",
  source: "lichess: Englund Gambit 1. d4 e5 2. dxe5",
};

const CENTRE_E4: Adaptation = {
  name: "they've given up the centre",
  moves: ["e4"],
  when: (p, me) => early(p, 4) && has(p, me, "P", "d4") && centreConceded(p, me, "f6"),
  why: "There's no black pawn on d5 or e5 and nothing stopping e4, so take the whole centre with e4. Two pawns side by side in the centre give your pieces more room; the slower setup moves can come after.",
  source: "lichess: Modern Defense / Owen Defense lines with e4",
};

const CENTRE_D4: Adaptation = {
  name: "they've given up the centre",
  moves: ["d4"],
  when: (p, me) => early(p, 3) && has(p, me, "P", "e4") && centreConceded(p, me, "c6"),
  why: "Black hasn't put a pawn in the centre, so take it with d4: with pawns on e4 and d4 you control the key squares and your pieces come out easily.",
  source: "lichess: Modern Defense 1. e4 g6 2. d4, Owen Defense 1. e4 b6 2. d4",
};

const PHILIDOR: Adaptation = {
  name: "Philidor Defence (...d6 instead of ...Nc6)",
  moves: ["d4"],
  when: (p, me) => early(p, 3) && has(p, me, "N", "f3") && has(p, opp(me), "P", "e5", "d6") && !has(p, opp(me), "N", "c6"),
  why: "Black defends e5 with the pawn on d6, which shuts in their own bishop. Strike at once with d4: it gains space and Black's position stays cramped.",
  source: "lichess: Philidor Defense 1. e4 e5 2. Nf3 d6 3. d4",
};

const LATVIAN: Adaptation = {
  name: "Latvian Gambit (...f5)",
  moves: ["Nxe5", "exf5"],
  when: (p, me) => early(p, 3) && has(p, me, "N", "f3") && has(p, opp(me), "P", "e5", "f5"),
  why: "...f5 is a risky gambit that weakens Black's king. Take the e5 pawn with Nxe5 (main line), or take on f5.",
  source: "lichess: Latvian Gambit Accepted 3. Nxe5 / 3. exf5",
};

const PETROV: Adaptation = {
  name: "Petrov's Defence (...Nf6 instead of ...Nc6)",
  moves: ["Nxe5"],
  when: (p, me) => early(p, 3) && has(p, me, "N", "f3") && has(p, opp(me), "N", "f6") && has(p, opp(me), "P", "e5") && !has(p, opp(me), "N", "c6"),
  why: "Black attacks your e4 pawn instead of defending e5. Take first with Nxe5; after ...d6 the knight goes back (Nf3) and you're ready for Black's ...Nxe4.",
  source: "lichess: Petrov's Defense 1. e4 e5 2. Nf3 Nf6 3. Nxe5",
};

const ALBIN: Adaptation = {
  name: "Albin Countergambit (2...e5)",
  moves: ["dxe5"],
  when: (p, me) => early(p, 3) && has(p, me, "P", "d4", "c4") && has(p, opp(me), "P", "e5", "d5"),
  why: "They offer a pawn to open the centre. Take it with dxe5, then develop calmly (Nf3, g3 or a3); don't grab more pawns.",
  source: "lichess: Queen's Gambit Declined: Albin Countergambit 3. dxe5",
};

const QGA: Adaptation = {
  name: "Queen's Gambit Accepted (...dxc4)",
  moves: ["e4", "e3", "Nf3"],
  when: (p, me) => early(p, 5) && has(p, me, "P", "d4") && has(p, opp(me), "P", "c4"),
  why: "They've taken your c-pawn. Don't chase it with b3: take the centre with e4 (or play e3) and win the pawn back with Bxc4.",
  source: "lichess: Queen's Gambit Accepted: Central Variation 3. e4",
};

const LONDON_QB6: Adaptation = {
  name: "...Qb6, attacking b2",
  moves: ["Nc3", "Qc1"],
  when: (p, me) => early(p, 8) && has(p, opp(me), "Q", "b6") && has(p, me, "P", "b2") && has(p, me, "B", "f4"),
  why: "With your bishop on f4 the b2 pawn is unguarded and their queen attacks it. Nc3 sets a trap (after ...Qxb2, Nb5 threatens Nc7+), or simply guard it with Qc1.",
  source: "lichess: London System: Poisoned Pawn Variation 5. Nc3",
};

const JOBAVA_NB5: Adaptation = {
  name: "c7 is weak",
  moves: ["Nb5"],
  when: (p, me) => early(p, 6) && has(p, me, "N", "c3") && has(p, me, "B", "f4") && has(p, opp(me), "P", "c7") && !has(p, opp(me), "B", "d6") && !has(p, opp(me), "N", "a6"),
  why: "Your bishop on f4 already aims at c7; Nb5 attacks it a second time, so Black has to spend a move (...Na6 or ...Bd6) defending - the typical Jobava idea.",
  source: "lichess: Rapport-Jobava System with e6 (Nb5 idea)",
};

const CATALAN_OPEN: Adaptation = {
  name: "Open Catalan (...dxc4)",
  moves: ["Qa4+", "Qc2"],
  when: (p, me) => early(p, 8) && has(p, me, "P", "d4", "g3") && has(p, opp(me), "P", "c4") && !has(p, me, "P", "c4"),
  why: "Black has taken your c-pawn. Win it back calmly instead of spending moves on b3 or a4: Qa4+ (with check) early on, or Qc2 once you have castled. Your g2 bishop then rules the long diagonal.",
  source: "lichess: Catalan Opening: Open Defense 5. Qa4+ / Classical Line 7. Qc2",
};

// -- Black openings --

const LION_NG5: Adaptation = {
  name: "Ng5 with Bc4, aiming at f7",
  moves: ["Nh6"],
  when: (p, me) => early(p, 7) && has(p, opp(me), "N", "g5") && has(p, opp(me), "B", "c4") && has(p, me, "P", "f7") && has(p, me, "N", "g8"),
  why: "White's knight and bishop both hit f7. Cover it with ...Nh6: the knight defends f7, and ...Ngf6 can't work here because e5 would drop.",
  source: "lichess: Philidor Defense: Hanham, Kmoch Variation 5. Ng5 Nh6",
};

const SCOTCH: Adaptation = {
  name: "Scotch Game (d4)",
  moves: ["exd4"],
  when: (p, me) => early(p, 4) && has(p, me, "P", "e5") && has(p, opp(me), "P", "d4"),
  why: "White opens the centre with d4. Take it with ...exd4 and develop quickly; holding e5 with ...d6 is passive.",
  source: "lichess: Scotch Game 3...exd4",
};

const WAYWARD_QUEEN: Adaptation = {
  name: "early queen attack on f7",
  moves: ["g6", "Qe7"],
  when: (p, me) => early(p, 4) && has(p, opp(me), "Q", "h5") && has(p, opp(me), "B", "c4") && has(p, me, "P", "f7"),
  why: "Their queen and bishop both aim at f7, threatening Qxf7 mate. Block with ...g6 (it also attacks the queen), or defend with ...Qe7.",
  source: "lichess: King's Pawn Game: Wayward Queen Attack (...g6)",
};

const BLACKMAR_DIEMER: Adaptation = {
  name: "Blackmar-Diemer Gambit (2.e4)",
  moves: ["dxe4"],
  when: (p, me) => early(p, 3) && has(p, me, "P", "d5") && has(p, opp(me), "P", "e4", "d4"),
  why: "White offers the e4 pawn for fast development. Take it with ...dxe4, then develop with ...Nf6 and don't hang on to everything.",
  source: "lichess: Blackmar-Diemer Gambit 2...dxe4",
};

const VS_EARLY_BF4: Adaptation = {
  name: "Early Bf4 (London)",
  moves: ["c5"],
  when: (p, me) => early(p, 4) && has(p, opp(me), "B", "f4") && has(p, opp(me), "P", "b2", "d4") && has(p, me, "P", "d5", "c7"),
  why: "White's bishop has left c1, so b2 is loose. Hit back at the centre with ...c5; ...Qb6 next attacks b2.",
  source: "lichess: Accelerated London System: Steinitz Countergambit 2...c5",
};

const KINGS_GAMBIT: Adaptation = {
  name: "King's Gambit (f4)",
  moves: ["exf4", "d5"],
  when: (p, me) => early(p, 3) && has(p, me, "P", "e5") && has(p, opp(me), "P", "f4", "e4"),
  why: "White offers the f-pawn. Take it with ...exf4, or strike back in the centre with ...d5 (Falkbeer).",
  source: "lichess: King's Gambit Accepted / Falkbeer Countergambit",
};

const EXCHANGE_RECAPTURE: Adaptation = {
  name: "exchange on d5",
  moves: ["cxd5"],
  when: (p, me) => early(p, 5) && has(p, me, "P", "c6") && has(p, opp(me), "P", "d5"),
  why: "They've exchanged on d5: recapture with the c-pawn (...cxd5) to keep a pawn in the centre - that's what ...c6 prepared.",
  source: "lichess: Caro-Kann Exchange 3...cxd5, Slav Exchange 3...cxd5",
};

const ADVANCE_C5: Adaptation = {
  name: "Advance Variation (e5)",
  moves: ["c5"],
  when: (p, me) => early(p, 8) && has(p, opp(me), "P", "e5", "d4") && has(p, me, "P", "d5", "e6", "c6"),
  why: "White's pawn chain d4-e5 is strong at the front, so attack its base: ...c5 hits d4.",
  source: "lichess: Caro-Kann Advance (cf. Botvinnik-Carls Defense 3...c5)",
};

const SLAV_QB3: Adaptation = {
  name: "Qb3 attacking b7",
  moves: ["Qb6"],
  when: (p, me) => early(p, 8) && has(p, opp(me), "Q", "b3") && has(p, me, "P", "b7") && has(p, me, "B", "f5") && has(p, me, "Q", "d8"),
  why: "With your bishop out on f5, b7 is unguarded and their queen hits it. ...Qb6 defends b7 and offers a queen trade.",
  source: "lichess: Slav Defense with ...Bf5, Qb3 Qb6",
};

const BIG_CENTRE_C5: Adaptation = {
  name: "big pawn centre with f4",
  moves: ["c5"],
  when: (p, me) => early(p, 8) && has(p, opp(me), "P", "e4", "d4", "f4") && has(p, me, "P", "c7"),
  why: "White has three pawns in the centre (Austrian / Four Pawns Attack). Hit them at once with ...c5 before they roll forward.",
  source: "lichess: Pirc Austrian Attack: Dragon Formation 5...c5; King's Indian Four Pawns Attack",
};

const SAEMISCH: Adaptation = {
  name: "Sämisch (f3)",
  moves: ["e5", "c5"],
  when: (p, me) => early(p, 9) && has(p, opp(me), "P", "f3", "e4", "d4", "c4") && has(p, me, "B", "g7"),
  why: "Against the Sämisch, the standard counter-punches are ...e5 or ...c5, opening lines for your g7 bishop.",
  source: "lichess: King's Indian Defense: Sämisch Variation",
};

const KID_VS_LONDON: Adaptation = {
  name: "London setup against your King's Indian",
  moves: ["c5"],
  when: (p, me) => early(p, 9) && has(p, opp(me), "B", "f4") && has(p, opp(me), "P", "d4") && !has(p, opp(me), "P", "e4") && has(p, me, "B", "g7") && has(p, me, "P", "c7"),
  why: "White's calm London setup doesn't fear ...e5, so attack d4 with ...c5 instead - it also opens the long diagonal for your g7 bishop.",
  source: "lichess: London System, with Be2 (...c5)",
};

const OPEN_SICILIAN: Adaptation = {
  name: "Open Sicilian (d4)",
  moves: ["cxd4"],
  when: (p, me) => early(p, 4) && has(p, me, "P", "c5") && has(p, opp(me), "P", "d4"),
  why: "Take with ...cxd4: swapping your c-pawn for White's d-pawn is the whole point of the Sicilian - you keep more centre pawns.",
  source: "lichess: Open Sicilian 3...cxd4",
};

const ALAPIN: Adaptation = {
  name: "Alapin (c3)",
  moves: ["Nf6", "d5"],
  when: (p, me) => early(p, 3) && has(p, opp(me), "P", "c3", "e4") && has(p, me, "P", "c5") && !has(p, opp(me), "P", "d4"),
  why: "c3 prepares d4 for a full pawn centre. Hit e4 at once with ...Nf6 or ...d5 so it never gets built.",
  source: "lichess: Sicilian Defense: Alapin Variation 2...Nf6 / 2...d5",
};

const MOSCOW: Adaptation = {
  name: "check from b5",
  moves: ["Bd7", "Nd7"],
  when: (p, me) => early(p, 4) && has(p, opp(me), "B", "b5") && p.isCheck(),
  why: "Block the check with ...Bd7 (the main line), offering to trade White's active bishop.",
  source: "lichess: Sicilian Defense: Moscow Variation 3...Bd7",
};

const GRAND_PRIX: Adaptation = {
  name: "Grand Prix Attack (f4)",
  moves: ["g6", "e6"],
  when: (p, me) => early(p, 4) && has(p, opp(me), "P", "f4", "e4") && has(p, me, "P", "c5") && !has(p, opp(me), "P", "d4"),
  why: "White aims for a kingside attack. Set up solidly: ...g6 with ...Bg7, or ...e6 followed by ...d5.",
  source: "lichess: Sicilian Defense: Grand Prix Attack",
};

const FRENCH_ADVANCE: Adaptation = {
  name: "Advance Variation (e5)",
  moves: ["c5"],
  when: (p, me) => early(p, 6) && has(p, opp(me), "P", "e5", "d4") && has(p, me, "P", "d5", "e6", "c7"),
  why: "White's pawn chain d4-e5 is strong at the front, so attack its base: ...c5 hits d4, and ...Nc6 and ...Qb6 can add more pressure.",
  source: "lichess: French Defense: Advance Variation 3...c5",
};

const FRENCH_EXCHANGE: Adaptation = {
  name: "exchange on d5",
  moves: ["exd5"],
  when: (p, me) => early(p, 4) && has(p, me, "P", "e6") && has(p, opp(me), "P", "d5"),
  why: "They've exchanged on d5: take back with the e-pawn (...exd5). It keeps a pawn in the centre and frees your light-squared bishop.",
  source: "lichess: French Defense: Exchange Variation 3...exd5",
};

const SCANDINAVIAN_TAKE: Adaptation = {
  name: "exd5",
  moves: ["Qxd5", "Nf6"],
  when: (p, me) => early(p, 3) && has(p, opp(me), "P", "d5") && !has(p, me, "P", "d5", "e6", "c6"),
  why: "White took your d-pawn: win it back with ...Qxd5 (the main line), or prepare ...Nxd5 with ...Nf6.",
  source: "lichess: Scandinavian Defense 2...Qxd5 / 2...Nf6",
};

function opp(colour: Color): Color {
  return colour === "white" ? "black" : "white";
}

/** The adaptations for each opening system, by its label. */
const ADAPTATIONS: Record<string, Adaptation[]> = {
  "Italian Game": [CENTRE_D4, PHILIDOR, LATVIAN, PETROV],
  "London System": [ENGLUND, LONDON_QB6, CENTRE_E4],
  "Queen's Gambit": [ALBIN, QGA, CENTRE_E4],
  "Rapport-Jobava System": [ENGLUND, CENTRE_E4, JOBAVA_NB5],
  "Ruy Lopez": [CENTRE_D4, PHILIDOR, PETROV, LATVIAN],
  "Open Game (...e5)": [SCOTCH, WAYWARD_QUEEN, KINGS_GAMBIT],
  "Queen's Gambit Declined (...d5)": [BLACKMAR_DIEMER, VS_EARLY_BF4],
  "Caro-Kann Defence": [EXCHANGE_RECAPTURE, ADVANCE_C5],
  "Slav Defence": [EXCHANGE_RECAPTURE, SLAV_QB3],
  "Pirc Defence": [BIG_CENTRE_C5, KID_VS_LONDON],
  "King's Indian Defence": [BIG_CENTRE_C5, SAEMISCH, KID_VS_LONDON],
  "Sicilian Defence": [OPEN_SICILIAN, ALAPIN, MOSCOW, GRAND_PRIX],
  "Catalan Opening": [ENGLUND, ALBIN, CATALAN_OPEN],
  "Black Lion (Philidor)": [LION_NG5],
  "Old Indian (Lion setup)": [],
  "Stafford Gambit": [SCOTCH, WAYWARD_QUEEN, KINGS_GAMBIT],
  "Alien Gambit": [],
  "French Defence": [FRENCH_ADVANCE, FRENCH_EXCHANGE],
  "Scandinavian Defence": [SCANDINAVIAN_TAKE],
  "Nimzo-Indian Defence": [],
  "Reversed Sicilian (...e5)": [],
  "English Opening": [],
  "Scotch Game": [PHILIDOR, PETROV, LATVIAN],
};

/** The adaptation moves that fit this position for the side to move. */
export function adaptationMoves(position: Chess, system: OpeningSystem): { move: NormalMove; adaptation: Adaptation }[] {
  const me = position.turn;
  const found: { move: NormalMove; adaptation: Adaptation }[] = [];
  for (const adaptation of ADAPTATIONS[system.label] ?? []) {
    if (!adaptation.when(position, me)) continue;
    for (const san of adaptation.moves) {
      const move = parseSan(position, san) as NormalMove | undefined;
      if (move && !found.some((f) => makeUci(f.move) === makeUci(move))) found.push({ move, adaptation });
    }
  }
  return found;
}

const PIECE_WORDS: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const PIECE_ROLES: Record<string, Role> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };

export function openingsFor(colour: Color): Opening[] {
  return REPERTOIRE.filter((o) => o.colour === colour);
}

export function suggestedFor(colour: Color, levelIndex: number): Opening[] {
  const tier = TIER_BY_LEVEL[levelIndex];
  return openingsFor(colour).filter((o) => o.tier === tier && !o.gambit);
}

/** The system the opening uses, given White's first move (for Black openings). */
export function systemFor(opening: Opening, firstMove: string | null): OpeningSystem {
  for (const system of opening.systems) {
    if (system.when === null) return system;
    if (firstMove && system.when.some((w) => firstMove === w || firstMove.startsWith(`${w} `))) return system;
  }
  return opening.systems[opening.systems.length - 1];
}

/** How the opening is listed in the practice match menus (the side is chosen
 *  separately, so just the name) */
export function menuName(opening: Opening): string {
  return opening.menu ?? opening.name;
}

// ---------------------------------------------------------------------------
// Setups
// ---------------------------------------------------------------------------

function goalMet(position: Chess, colour: Color, goal: Goal): boolean {
  if (goal === "O-O" || goal === "castled") {
    const king = position.board.kingOf(colour);
    const rank = colour === "white" ? 0 : 7;
    const isRook = (file: number) => {
      const piece = position.board.get(rank * 8 + file);
      return piece?.role === "rook" && piece.color === colour;
    };
    const kingside = king === rank * 8 + 6 && isRook(5);
    const queenside = king === rank * 8 + 2 && isRook(3);
    return kingside || (goal === "castled" && queenside);
  }
  const [letter, squares] = goal;
  return squares.some((s) => {
    const piece = position.board.get(parseSquare(s)!);
    return piece?.role === PIECE_ROLES[letter] && piece.color === colour;
  });
}

const isBreak = (goal: Goal) => Array.isArray(goal) && goal[2] === "break";

export function goalWords(goal: Goal): string {
  if (goal === "O-O") return "castle kingside";
  if (goal === "castled") return "castle";
  const words = `${PIECE_WORDS[goal[0]]} to ${goal[1].join(" or ")}`;
  return isBreak(goal) ? `then the pawn break ${goal[1].join(" or ")}` : words;
}

/** For each goal, whether it is met. A pawn break only counts once everything
 *  else is in place. */
function metGoals(position: Chess, colour: Color, setup: Goal[]): boolean[] {
  const met = setup.map((g) => goalMet(position, colour, g));
  const othersDone = setup.every((g, i) => isBreak(g) || met[i]);
  return setup.map((g, i) => met[i] && (othersDone || !isBreak(g)));
}

/** [goals met, goals still to do] */
export function setupProgress(position: Chess, colour: Color, setup: Goal[]): [number, Goal[]] {
  const met = metGoals(position, colour, setup);
  return [met.filter(Boolean).length, setup.filter((_, i) => !met[i])];
}

/** Which goal of the plan a move achieves (0 = the first one), or undefined if
 *  it doesn't bring the setup any closer. */
function planPriority(position: Chess, move: NormalMove, setup: Goal[]): number | undefined {
  const colour = position.turn;
  const before = metGoals(position, colour, setup);
  const after = metGoals(afterMove(position, move), colour, setup);
  const count = (list: boolean[]) => list.filter(Boolean).length;
  if (count(after) <= count(before)) return undefined;
  return after.findIndex((a, i) => a && !before[i]);
}

/** Legal moves that bring the side to move closer to its setup, in plan order
 *  (moves for the same goal stay in python-chess's move order). */
export function setupMoves(position: Chess, setup: Goal[]): NormalMove[] {
  const found: [number, NormalMove][] = [];
  for (const move of legalMovesInPythonOrder(position)) {
    const priority = planPriority(position, move, setup);
    if (priority !== undefined) found.push([priority, move]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, move]) => move);
}

/** White's first move of the game in notation, e.g. "e4" (null if the game
 *  didn't start from the usual position). */
/** The game's first moves, which decide the system an opening uses: "e4",
 *  or "e4 c6" once Black has replied. */
export function firstMoveOf(start: Chess, moves: NormalMove[]): string | null {
  if (!moves.length || !isStartPosition(start)) return null;
  const first = makeSan(start, moves[0]);
  if (moves.length < 2) return first;
  return `${first} ${makeSan(afterMove(start, moves[0]), moves[1])}`;
}

/** The usual starting position (python-chess's STARTING_FEN, clocks included). */
export function isStartPosition(position: Chess): boolean {
  return epdOf(position) === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -" &&
    position.halfmoves === 0 && position.fullmoves === 1;
}

/** Every legal move, in the order python-chess lists them (the desktop app's
 *  choices between equally good setup moves depend on this order): pieces from
 *  the highest square down, castling, pawn captures, pawn pushes, double pushes,
 *  en passant. In check, king moves come first. */
export function legalMovesInPythonOrder(position: Chess): NormalMove[] {
  const inCheck = position.isCheck();
  const promotions: Role[] = ["queen", "rook", "bishop", "knight"];
  const moves: { move: NormalMove; key: number[] }[] = [];
  for (const [from, dests] of position.allDests()) {
    const piece = position.board.get(from)!;
    for (const to of dests) {
      const move: NormalMove = { from, to };
      if (piece.role === "pawn") {
        const promotes = to >> 3 === 0 || to >> 3 === 7;
        const capture = (from & 7) !== (to & 7);
        const enPassant = capture && !position.board.get(to);
        const double = Math.abs(to - from) === 16;
        for (const [index, role] of (promotes ? promotions : [undefined]).entries()) {
          const key = enPassant ? [5, -from] : capture ? [2, -from, -to, index] : double ? [4, -to] : [3, -to, index];
          moves.push({ move: role ? { from, to, promotion: role } : move, key });
        }
      } else if (isCastling(position, move)) {
        moves.push({ move, key: [1, -to] });
      } else if (inCheck && piece.role === "king") {
        moves.push({ move, key: [-1, -to] });
      } else {
        moves.push({ move, key: [0, -from, -to] });
      }
    }
  }
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d) return d;
    }
    return 0;
  };
  return moves.sort((a, b) => compare(a.key, b.key)).map((m) => m.move);
}

// ---------------------------------------------------------------------------
// Stockfish playing an opening like a sensible human
// ---------------------------------------------------------------------------

/** What chooseOpeningMove needs from Stockfish (at full strength). */
export interface OpeningEngine {
  /** The top `lines` moves with their scores (from White's point of view). */
  lines(position: Chess, seconds: number, lines: number): Promise<{ move?: NormalMove; score: Score }[]>;
  /** The score of one particular move (from White's point of view). */
  moveScore(position: Chess, move: NormalMove, seconds: number): Promise<Score>;
}

export interface OpeningChoice {
  move?: NormalMove; // undefined: play normally
  note: string;
  finished: boolean; // the opening phase is over for good
}

/** Pick Stockfish's move while it is following an opening. A move of
 *  undefined means "play normally": either following the opening here would
 *  be a real mistake, or the opening is finished (finished = true). */
export async function chooseOpeningMove(
  engine: OpeningEngine, position: Chess, opening: Opening, book: OpeningBook,
  levelIndex: number, firstMove: string | null, thinkTime = 0.3,
): Promise<OpeningChoice> {
  const colour = position.turn;
  const system = systemFor(opening, firstMove);
  const label = system.label;
  const [, missing] = setupProgress(position, colour, system.setup);
  const bookHere = book.bookMoves(position, system.families);
  if (position.fullmoves > OPENING_MOVES) {
    return { note: `Move ${OPENING_MOVES} reached: the ${label} opening phase is over, so Stockfish now plays normally.`, finished: true };
  }
  if (!missing.length && !bookHere.size) {
    return { note: `The ${label} setup is complete, so Stockfish now plays normally.`, finished: true };
  }

  // A gambit opening is chosen to practise the gambit, so Stockfish plays its
  // (objectively dubious) book moves at every level
  const tolerance = opening.gambit ? Math.max(TOLERANCE_BY_LEVEL[levelIndex], GAMBIT_TOLERANCE) : TOLERANCE_BY_LEVEL[levelIndex];
  const infos = await engine.lines(position, thinkTime, 5);
  const bestChance = winningChance(infos[0].score, colour);
  const known = new Map<string, number>();
  for (const info of infos) if (info.move) known.set(makeUci(info.move), winningChance(info.score, colour));

  const loss = async (move: NormalMove) => {
    const uci = makeUci(move);
    if (!known.has(uci)) known.set(uci, winningChance(await engine.moveScore(position, move, 0.15), colour));
    return bestChance - known.get(uci)!;
  };

  /** [cost, move] for each move, the plan's next goal first, then the cheapest. */
  const pick = async (moves: NormalMove[]): Promise<[number, NormalMove][]> => {
    const scored: [number, number, NormalMove][] = [];
    for (const move of moves.slice(0, 8)) {
      const priority = planPriority(position, move, system.setup);
      scored.push([priority ?? system.setup.length, await loss(move), move]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.map(([, cost, move]) => [cost, move]);
  };

  const bookScored = await pick([...bookHere.values()].map((b) => b.move));
  const goodBook = bookScored.filter(([cost]) => cost <= tolerance);
  if (goodBook.length) {
    const move = goodBook[0][1];
    const name = book.nameOf(afterMove(position, move));
    return { move, note: `Book move: ${label} theory${name ? ` (${name[1]})` : ""}.`, finished: false };
  }

  const setupScored = await pick(setupMoves(position, system.setup));
  const goodSetup = setupScored.filter(([cost]) => cost <= tolerance);
  if (goodSetup.length) {
    const move = goodSetup[0][1];
    const san = makeSan(position, move);
    const [, still] = setupProgress(afterMove(position, move), colour, system.setup);
    const todo = still.length ? ` Still to do: ${still.map(goalWords).join(", ")}.` : " Setup complete.";
    if (bookScored.length) {
      const usual = makeSan(position, bookScored[0][1]);
      return { move, finished: false,
        note: `The usual ${label} move ${usual} doesn't work well here, so Stockfish ` +
          `changes the move order: ${san} keeps building the setup.${todo}` };
    }
    return { move, finished: false,
      note: `No ${label} theory for this position, so Stockfish keeps building its setup with ${san}.${todo}` };
  }

  const rejected = bookScored.length ? bookScored[0] : setupScored[0];
  if (rejected) {
    const [cost, move] = rejected;
    return { finished: false,
      note: `Stockfish leaves its ${label} plan for now: ${makeSan(position, move)} would cost ` +
        `too much here (about ${cost.toFixed(0)}% of its winning chances), so it plays ` +
        `what the position needs instead.` };
  }
  return { finished: true,
    note: `The rest of the ${label} setup (${missing.map(goalWords).join(", ")}) isn't possible in this position, ` +
      `so Stockfish now plays normally.` };
}

// ---------------------------------------------------------------------------
// Coaching your moves in your chosen opening
// ---------------------------------------------------------------------------

/** Feedback on one of your moves while you practise an opening (undefined
 *  once the opening phase is over). */
export function coachOpeningMove(
  position: Chess, move: NormalMove, opening: Opening, book: OpeningBook, firstMove: string | null,
): string | undefined {
  const colour = position.turn;
  const system = systemFor(opening, firstMove);
  const [, missing] = setupProgress(position, colour, system.setup);
  const bookHere = book.bookMoves(position, system.families);
  if (position.fullmoves > OPENING_MOVES || (!missing.length && !bookHere.size)) return undefined;

  const label = system.label;
  const san = makeSan(position, move);
  const [, still] = setupProgress(afterMove(position, move), colour, system.setup);
  const todo = still.length
    ? ` Still to do: ${still.map(goalWords).join(", ")}.`
    : ` Your ${label} setup is complete: now follow the plan.`;

  if (bookHere.has(makeUci(move))) return `Book move: ${san} is ${label} theory.${todo}`;
  if (still.length < missing.length) {
    if (bookHere.size) {
      const usual = [...bookHere.values()].slice(0, 3).map((b) => makeSan(position, b.move)).join(", ");
      return `${san} isn't the usual ${label} move order (theory here: ${usual}), but it still builds your setup.${todo}`;
    }
    return `No ${label} theory for this position, but ${san} builds your setup.${todo}`;
  }
  const options = setupMoves(position, system.setup).slice(0, 4).map((m) => makeSan(position, m));
  const hint = options.length ? ` Setup moves available were: ${options.join(", ")}.` : "";
  return `${san} isn't one of the ${label} setup moves - fine if the position needed it (check the rating below).${hint}${todo}`;
}
