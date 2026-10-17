// "Explain the ideas" without any AI - a port of the desktop app's ideas.py
// (same rules, same wording). Rules read Stockfish's expected line and the
// current position, and pick out the ideas in plain words:
//   - tactics in the line: forks, pins, discovered attacks, checks, winning
//     material, attacks on undefended or more valuable pieces
//   - targets: a square or piece that several moves keep aiming at
//   - the position itself: king safety, pawn structure, open files, pieces
//     under attack, pieces with no safe squares
//
// Lists are built in the same order python-chess walks the board (pieces
// from h8 down to a1, attacked squares from a1 up), so the notes come out in
// the same order as on the desktop.
import { between, kingAttacks, ray } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import type { Color, NormalMove, Piece, Role, Square } from "chessops/types";
import { makeSquare, opposite, squareFile, squareRank } from "chessops/util";

import {
  PIECE_VALUES,
  afterMove,
  attackers,
  attacksFrom,
  colourName,
  isAttackedBy,
  isCapture,
  isCastling,
} from "./coach";
import { formatScore, verdictWords } from "./review";
import type { Plan, Threat } from "./strategy";

/** Piece values, with the king counting as the most valuable of all. */
const value = (role: Role) => (role === "king" ? 100 : PIECE_VALUES[role]);

const owner = (colour: Color, you: Color) => (colour === you ? "your" : "their");

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1);

/** e.g. "your queen on e2" or "their king" */
function namePiece(position: Chess, square: Square, you: Color): string {
  const piece = position.board.get(square)!;
  if (piece.role === "king") return `${owner(piece.color, you)} king`;
  return `${owner(piece.color, you)} ${piece.role} on ${makeSquare(square)}`;
}

function join(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Every piece, from h8 down to a1 (python-chess's piece_map order). */
function pieceMap(position: Chess): [Square, Piece][] {
  return [...position.board.occupied].reverse().map((s) => [s, position.board.get(s)!]);
}

/** The squares the piece on `square` attacks (none for an empty square). */
function attacksOf(position: Chess, square: Square): SquareSet {
  return position.board.get(square) ? attacksFrom(position, square) : SquareSet.empty();
}

/** The squares a pinned piece may stay on (the whole line through its king
 *  and the pinning piece), or undefined if it isn't pinned - python-chess's pin(). */
function pinLine(position: Chess, colour: Color, square: Square): SquareSet | undefined {
  const king = position.board.kingOf(colour);
  if (king === undefined) return undefined;
  const board = position.board;
  const kf = squareFile(king);
  const kr = squareRank(king);
  const line = (test: (s: Square) => boolean) => {
    let set = SquareSet.empty();
    for (let s = 0; s < 64; s++) if (s !== king && test(s)) set = set.with(s);
    return set;
  };
  const rooksQueens = board.rook.union(board.queen);
  const bishopsQueens = board.bishop.union(board.queen);
  const lines: [SquareSet, SquareSet][] = [
    [line((s) => squareFile(s) === kf), rooksQueens],
    [line((s) => squareRank(s) === kr), rooksQueens],
    [line((s) => squareFile(s) - squareRank(s) === kf - kr || squareFile(s) + squareRank(s) === kf + kr), bishopsQueens],
  ];
  for (const [rays, sliders] of lines) {
    if (!rays.has(square)) continue;
    const snipers = rays.intersect(sliders).intersect(board[opposite(colour)]);
    for (const sniper of [...snipers].reverse()) {
      const inBetween = between(sniper, king).intersect(board.occupied.with(square));
      if (inBetween.equals(SquareSet.fromSquare(square))) return ray(king, sniper);
    }
    break;
  }
  return undefined;
}

/** Where the moved piece ends up: python-chess's to_square (for castling,
 *  the king's square g1/c1, where chessops stores the rook's square). */
function landing(position: Chess, move: NormalMove): Square {
  return isCastling(position, move) ? (move.from & ~7) + (move.to > move.from ? 6 : 2) : move.to;
}

const chebyshev = (a: Square, b: Square) =>
  Math.max(Math.abs(squareFile(a) - squareFile(b)), Math.abs(squareRank(a) - squareRank(b)));

// ---------------------------------------------------------------------------
// Tactics in a single move
// ---------------------------------------------------------------------------

/** The tactical ideas in one move, as short phrases ("forks your queen and rook"). */
export function moveTactics(position: Chess, move: NormalMove, you: Color): string[] {
  const after = afterMove(position, move);
  const mover = position.turn;
  const enemy = opposite(mover);
  const piece = position.board.get(move.from)!;
  const castling = isCastling(position, move);
  const to = landing(position, move);
  const found: string[] = [];

  if (after.isCheckmate()) return ["checkmate!"];

  if (castling) found.push("castles, putting the king somewhere safer");

  // Winning material
  if (isCapture(position, move)) {
    const captured = position.board.get(move.to);
    const what = captured ? namePiece(position, move.to, you) : `${owner(enemy, you)} pawn`;
    if (captured && !attackers(position, enemy, move.to).nonEmpty()) found.push(`wins ${what} for free`);
    else found.push(`captures ${what}`);
  }

  // The moved piece's new attacks. Ignore it if it can simply be taken for free.
  const canBeTaken = attackers(after, enemy, to).nonEmpty() && !attackers(after, mover, to).nonEmpty();
  const targets: Square[] = [];
  if (!canBeTaken && !castling) {
    for (const square of attacksOf(after, to)) {
      const target = after.board.get(square);
      if (!target || target.color !== enemy) continue;
      const undefended = !attackers(after, enemy, square).nonEmpty();
      if (target.role === "king" || value(target.role) > value(piece.role) || undefended) targets.push(square);
    }
  }
  if (targets.length >= 2) {
    found.push("forks " + join(targets.map((s) => namePiece(after, s, you))));
  } else if (targets.length === 1 && targets[0] !== after.board.kingOf(enemy)) {
    const target = targets[0];
    const extra = !attackers(after, enemy, target).nonEmpty() ? " (undefended)" : "";
    found.push(`attacks ${namePiece(after, target, you)}${extra}`);
  }

  // Pins against the king created by the moved piece
  for (const [square, target] of pieceMap(after)) {
    if (target.color === enemy && target.role !== "king") {
      const pin = pinLine(after, enemy, square);
      if (pin && pin.has(to) && !pinLine(position, enemy, square)) {
        found.push(`pins ${namePiece(after, square, you)} to the king`);
      }
    }
  }

  // Discovered attacks: another piece's line opens because this piece moved
  const discovered: string[] = [];
  for (const [square, own] of pieceMap(after)) {
    if (own.color !== mover || square === to || !["bishop", "rook", "queen"].includes(own.role)) continue;
    const newly = attacksOf(after, square).diff(attacksOf(position, square));
    for (const hit of newly) {
      const target = after.board.get(hit);
      if (target && target.color === enemy && (target.role === "king" || value(target.role) >= 3)) {
        const what = target.role === "king" ? "check" : namePiece(after, hit, you);
        discovered.push(`the ${own.role} on ${makeSquare(square)} on ${what}`);
      }
    }
  }
  if (discovered.length) found.push("opens a discovered attack: " + join(discovered));

  if (after.isCheck() && !found.some((f) => f.includes("discovered") && f.includes("check"))) {
    found.push("gives check");
  }

  // Bringing a piece close to the enemy king
  const king = after.board.kingOf(enemy)!;
  if (["knight", "bishop", "rook", "queen"].includes(piece.role) && chebyshev(to, king) <= 2 && 2 < chebyshev(move.from, king)) {
    found.push(`brings the ${piece.role} close to ${owner(enemy, you)} king`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Features of the position
// ---------------------------------------------------------------------------

function kingNotes(position: Chess, side: Color, you: Color): string[] {
  const notes: string[] = [];
  const board = position.board;
  const king = board.kingOf(side)!;
  const who = capitalise(owner(side, you));
  const file = squareFile(king);
  const rank = squareRank(king);
  const home = side === "white" ? 0 : 7;
  const forward = side === "white" ? 1 : -1;
  const queensOn = board.queen.nonEmpty();

  if ([3, 4, 5].includes(file) && position.fullmoves >= 8 && queensOn) {
    notes.push(`${who} king is still in the centre, where it is easier to attack.`);
  } else if (rank === home && [0, 1, 2, 6, 7].includes(file)) {
    let shield = 0;
    for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
      for (const r of [rank + forward, rank + 2 * forward]) {
        const piece = r >= 0 && r <= 7 ? board.get(r * 8 + f) : undefined;
        if (piece?.role === "pawn" && piece.color === side) shield++;
      }
    }
    if (shield < 2) notes.push(`${who} king has few pawns in front of it, so it is exposed.`);
  }

  // Enemy pieces aiming at the squares around the king
  const zone = kingAttacks(king).with(king);
  const aiming = new Set<Square>();
  for (const square of zone) {
    for (const a of attackers(position, opposite(side), square)) {
      if (board.get(a)!.role !== "pawn") aiming.add(a);
    }
  }
  if (aiming.size >= 3) {
    notes.push(`${who} king is under pressure: ${aiming.size} enemy pieces aim at the squares around it.`);
  }
  return notes;
}

function pawnNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  const board = position.board;
  for (const side of [you, opposite(you)]) {
    const who = capitalise(owner(side, you));
    const pawns = [...board.pieces(side, "pawn")];
    const enemyPawns = [...board.pieces(opposite(side), "pawn")];
    const files = pawns.map(squareFile);

    for (const square of pawns) {
      const file = squareFile(square);
      const rank = squareRank(square);
      const ahead = (r: number) => (side === "white" ? r > rank : r < rank);
      const blockers = enemyPawns.filter((s) => Math.abs(squareFile(s) - file) <= 1 && ahead(squareRank(s)));
      if (!blockers.length) {
        notes.push(`${who} pawn on ${makeSquare(square)} is a passed pawn (no enemy pawns can stop it).`);
      } else if (!files.includes(file - 1) && !files.includes(file + 1)) {
        notes.push(`${who} pawn on ${makeSquare(square)} is isolated (no friendly pawns beside it), so it can become a target.`);
      }
    }
    const doubled = [...new Set(files.filter((f) => files.filter((g) => g === f).length > 1))].sort((a, b) => a - b);
    for (const file of doubled) notes.push(`${who} pawns are doubled on the ${"abcdefgh"[file]}-file.`);
  }
  return notes;
}

function fileNotes(position: Chess, you: Color): string[] {
  const board = position.board;
  const pawnFiles = new Set([...board.pawn].map(squareFile));
  const openFiles = [0, 1, 2, 3, 4, 5, 6, 7].filter((f) => !pawnFiles.has(f));
  if (!openFiles.length) return [];
  const names = join(openFiles.map((f) => `${"abcdefgh"[f]}-file`));
  let note = `Open ${openFiles.length > 1 ? "files" : "file"}: the ${names} - good roads for rooks and queens.`;
  const rooks: string[] = [];
  for (const f of openFiles) {
    for (let r = 0; r < 8; r++) {
      const square = r * 8 + f;
      if (board.get(square)?.role === "rook") rooks.push(namePiece(position, square, you));
    }
  }
  if (rooks.length) note += ` Already using one: ${join(rooks)}.`;
  return [note];
}

function dangerNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const [square, piece] of pieceMap(position)) {
    if (piece.role === "king") continue;
    const hitters = [...attackers(position, opposite(piece.color), square)];
    if (!hitters.length) continue;
    const name = capitalise(namePiece(position, square, you));
    if (!attackers(position, piece.color, square).nonEmpty()) {
      notes.push(`${name} is attacked and not defended.`);
    } else {
      const cheapest = Math.min(...hitters.map((a) => value(position.board.get(a)!.role)));
      if (cheapest < value(piece.role)) notes.push(`${name} is attacked by a less valuable piece.`);
    }
  }
  return notes;
}

/** Pieces that have left home but have no safe square to go to. */
function stuckPieceNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const [square, piece] of pieceMap(position)) {
    if (!["knight", "bishop", "rook"].includes(piece.role)) continue;
    const home = piece.color === "white" ? 0 : 7;
    if (squareRank(square) === home) continue;
    const safe = [...attacksFrom(position, square)].filter((s) => {
      const there = position.board.get(s);
      return !(there && there.color === piece.color) && !isAttackedBy(position, opposite(piece.color), s);
    });
    if (!safe.length) {
      notes.push(`${capitalise(namePiece(position, square, you))} has no safe squares to move to; it could get trapped.`);
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

/** The full "Explain the ideas" text for a position. With `extra`, the web
 *  version's middlegame notes (outposts, bad bishops...) are added too. */
export function explainIdeas(position: Chess, threat: Threat, plan: Plan, extra: string[] = []): string {
  const you = position.turn;
  const themName = colourName(opposite(you));

  // Tactics along Stockfish's line, numbered like the arrows on the board
  const theirIdeas: string[] = [];
  const yourIdeas: string[] = [];
  let firstDanger: string | undefined;
  plan.steps.forEach((step, i) => {
    const before = plan.positions[i];
    const tactics = moveTactics(before, step.move, you);
    if (!tactics.length) return;
    const line = `Move ${step.number}, ${step.san}: ${join(tactics)}.`;
    if (step.side === you) {
      yourIdeas.push(line);
    } else {
      theirIdeas.push(line);
      const big = tactics.filter((t) => ["forks", "pins", "opens a discovered", "wins", "checkmate"].some((p) => t.startsWith(p)));
      if (big.length && firstDanger === undefined) {
        firstDanger = `move ${step.number} of the line, ${step.san}, which ${big[0]}`;
      }
    }
  });

  // Squares or pieces their moves keep aiming at
  const aims = new Map<Square, Set<number>>();
  plan.steps.forEach((step, i) => {
    if (step.side === you) return;
    const before = plan.positions[i];
    const after = afterMove(before, step.move);
    for (const square of attacksOf(after, landing(before, step.move))) {
      const target = after.board.get(square);
      if (target && target.color === you) {
        if (!aims.has(square)) aims.set(square, new Set());
        aims.get(square)!.add(step.number);
      }
    }
  });
  const repeated = [...aims].filter(([, moves]) => moves.size >= 2).map(([square]) => square);
  for (const square of repeated) {
    const what = position.board.get(square) ? namePiece(position, square, you) : makeSquare(square);
    theirIdeas.push(`Several of their moves aim at ${what}: keep it protected.`);
  }

  // What to watch for, most urgent first
  let watch: string;
  if (threat.inCheck) watch = "You're in check: deal with that first.";
  else if (threat.serious) watch = `${threat.severity}: ${threat.threatSan} right now (see the threat check).`;
  else if (firstDanger) watch = `${firstDanger}. Make sure your moves don't allow it.`;
  else if (repeated.length) watch = `${join(repeated.map(makeSquare))} - their pieces keep aiming there.`;
  else if (threat.threatSan) {
    watch = `No immediate danger. ${themName}'s most useful idea is ${threat.threatSan}, so keep it in mind when choosing your move.`;
  } else watch = "No immediate danger.";

  const positionNotes = [
    ...kingNotes(position, you, you),
    ...kingNotes(position, opposite(you), you),
    ...dangerNotes(position, you),
    ...stuckPieceNotes(position, you),
    ...pawnNotes(position, you),
    ...fileNotes(position, you),
    ...extra,
  ];

  const lines = [
    "The ideas in this position",
    `You are ${colourName(you)}. Stockfish: ${verdictWords(plan.score)} (${formatScore(plan.score)}).`,
    "",
    `Watch for: ${watch}`,
    "",
    "Your opponent's ideas",
  ];
  if (threat.threatSan && threat.serious) lines.push(`• Their threat right now: ${threat.threatSan} (see the orange arrow).`);
  lines.push(...theirIdeas.map((idea) => `• ${idea}`));
  if (lines[lines.length - 1] === "Your opponent's ideas") {
    lines.push("• No tactics in their moves in Stockfish's line: a quiet, positional sequence.");
  }

  lines.push("", "Your ideas");
  lines.push(...yourIdeas.map((idea) => `• ${idea}`));
  if (lines[lines.length - 1] === "Your ideas") {
    lines.push("• No tactics in your moves in Stockfish's line: improve your pieces and keep everything protected.");
  }

  lines.push("", "About the position");
  lines.push(...positionNotes.map((note) => `• ${note}`));
  if (lines[lines.length - 1] === "About the position") {
    lines.push("• Nothing unusual: both kings are safe and the pawns are healthy.");
  }
  lines.push("", "Move numbers match the numbered arrows from Plan ahead.");
  return lines.join("\n");
}
