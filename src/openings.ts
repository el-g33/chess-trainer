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
  when: string[] | null; // White's first moves this system answers (null: any)
  label: string;
  families: string[];
  setup: Goal[];
}

export interface Opening {
  name: string;
  colour: Color;
  tier: number;
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
    name: "Caro-Kann / Slav (...c6 and ...d5)", colour: "black", tier: 2,
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
];

const PIECE_WORDS: Record<string, string> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
const PIECE_ROLES: Record<string, Role> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };

export function openingsFor(colour: Color): Opening[] {
  return REPERTOIRE.filter((o) => o.colour === colour);
}

export function suggestedFor(colour: Color, levelIndex: number): Opening[] {
  const tier = TIER_BY_LEVEL[levelIndex];
  return openingsFor(colour).filter((o) => o.tier === tier);
}

/** The system the opening uses, given White's first move (for Black openings). */
export function systemFor(opening: Opening, firstMove: string | null): OpeningSystem {
  for (const system of opening.systems) {
    if (system.when === null || (firstMove && system.when.includes(firstMove))) return system;
  }
  return opening.systems[opening.systems.length - 1];
}

/** How the opening is listed in the start menu, e.g. "Italian Game (White, levels 1-3)" */
export function menuName(opening: Opening): string {
  return `${opening.name} (${opening.colour === "white" ? "White" : "Black"}, ${TIER_NAMES[opening.tier]})`;
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
export function firstMoveOf(start: Chess, moves: NormalMove[]): string | null {
  if (!moves.length || !isStartPosition(start)) return null;
  return makeSan(start, moves[0]);
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

  const tolerance = TOLERANCE_BY_LEVEL[levelIndex];
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
