// The coach's words: a short, natural sentence for a move (for stepping
// through a line one move at a time), and a one-line verdict on a move you
// played. The board shows WHICH move; these say what it means, so they never
// name the move itself.
import { Chess } from "chessops/chess";
import { attacks } from "chessops/attacks";
import type { Color, NormalMove, Role } from "chessops/types";
import { opposite } from "chessops/util";

import { PIECE_VALUES } from "./coach";
import type { Evaluation, Review } from "./review";

const NAMES: Record<Role, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };

/** Whose piece, from the listener's point of view: "your" / "their", or the colour. */
function owner(colour: Color, listener: Color | null): string {
  if (!listener) return colour === "white" ? "White's" : "Black's";
  return colour === listener ? "your" : "their";
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Enemy pieces the piece on `square` attacks that are worth mentioning:
 *  undefended ones, or ones worth more than the attacker. */
function targets(position: Chess, square: number): Role[] {
  return [...new Set(targetsOf(position, square).map((s) => position.board.get(s)!.role))];
}

/** The squares of enemy pieces worth mentioning that the piece on `square` attacks. */
export function targetsOf(position: Chess, square: number): number[] {
  const piece = position.board.get(square);
  if (!piece) return [];
  const hit = attacks(piece, square, position.board.occupied).intersect(position.board[opposite(piece.color)]);
  const found: number[] = [];
  for (const target of hit) {
    const victim = position.board.get(target)!;
    if (victim.role === "king") continue;
    // kingAttackers(square, colour) lists colour's pieces that attack the square:
    // for the victim's own colour, those are its defenders
    const defended = position.kingAttackers(target, victim.color, position.board.occupied).nonEmpty();
    if (PIECE_VALUES[victim.role] > PIECE_VALUES[piece.role] || !defended) found.push(target);
  }
  const value = (square: number) => PIECE_VALUES[position.board.get(square)!.role];
  return found.sort((a, b) => value(b) - value(a));
}

/** One short sentence for a move: "Their knight comes out and hits your queen." */
export function narrateMove(before: Chess, move: NormalMove, listener: Color | null): string {
  const piece = before.board.get(move.from);
  if (!piece) return "";
  const mover = owner(piece.color, listener);
  const victim = before.board.get(move.to);
  const after = before.clone();
  after.play(move);
  const name = NAMES[piece.role];
  const subject = cap(`${mover} ${name}`);
  // The board shows where: the words say what (no squares, no notation)
  if (after.isCheckmate()) return victim ? `${subject} takes ${owner(victim.color, listener)} ${NAMES[victim.role]}. Checkmate!` : `${subject} moves in. Checkmate!`;
  const castles = piece.role === "king" && Math.abs((move.to & 7) - (move.from & 7)) > 1 ||
    (piece.role === "king" && victim?.role === "rook" && victim.color === piece.color);
  if (castles) return `${cap(mover === "your" ? "you castle" : mover === "their" ? "they castle" : `${mover.replace("'s", "")} castles`)}, tucking the king away safely.`;
  if (move.promotion) return `The pawn reaches the last rank and becomes a ${NAMES[move.promotion]}!`;

  const check = after.isCheck();
  const hits = targets(after, castles ? move.from : move.to);
  const fork = hits.length >= 2;
  const victimOwner = victim ? owner(victim.color, listener) : "";
  let text: string;
  if (victim) text = `${subject} takes ${victimOwner} ${NAMES[victim.role]}`;
  else if (piece.role === "pawn") text = `${subject} moves up`;
  else if ((piece.color === "white" ? move.from >> 3 === 0 : move.from >> 3 === 7) && piece.role !== "rook" && piece.role !== "queen")
    text = `${subject} comes out`;
  else text = `${subject} moves`;

  const target = (role: Role) => `${owner(opposite(piece.color), listener)} ${NAMES[role]}`;
  if (check && hits.length) text += `, with check, and also hits ${target(hits[0])}`;
  else if (check) text += ", with check";
  else if (fork) text += ` and attacks ${target(hits[0])} and ${target(hits[1])} at once: a fork!`;
  else if (hits.length) text += ` and hits ${target(hits[0])}`;
  if (!fork) text += ".";
  return text;
}

// ---------------------------------------------------------------------------
// The coach's one-line verdict on a move
// ---------------------------------------------------------------------------

const PRAISE: Record<string, string[]> = {
  Brilliant: ["Brilliant! A sacrifice that really works.", "Wow, what a move! That sacrifice is spot on."],
  Great: ["Great find! That was the move to play.", "Great move: you found the strong one."],
  Best: ["That's the best move.", "Spot on, the top engine move.", "Perfect, that's the best move."],
  Excellent: ["Very nice, almost the best move.", "Excellent, that keeps things going your way."],
  Good: ["Good, solid move.", "That's a sensible choice.", "Fine move, nothing wrong with that."],
  Book: ["Straight out of the opening book.", "Good theory: that's a known move.", "Right on track with the opening."],
  Forced: ["That was the only move.", "No choice there, and you found it."],
};

// The same, said about your opponent's move
const THEIR_PRAISE: Record<string, string> = {
  Brilliant: "A brilliant sacrifice from them.",
  Great: "A great move by them.",
  Best: "They found the best move.",
  Excellent: "A strong move: almost their best.",
  Good: "A solid move from them.",
  Book: "A known opening move.",
  Forced: "That was their only move.",
};

/** Pick one of the phrasings, the same one each time for the same move. */
function pick(options: string[], seed: number): string {
  return options[Math.abs(seed) % options.length];
}

/** The coach's verdict, in plain words, on the move that led from `before`
 *  to `after` (played by `mover`; the listener is `you`, or null for neither). */
export function verdict(review: Review, before: Chess, after: Chess,
  afterEval: Evaluation | undefined, you: Color | null, seed: number): string {
  const mover = before.turn;
  const mine = !you || you === mover;
  const them = !you ? (mover === "white" ? "Black" : "White") : mine ? "them" : "you";
  if (PRAISE[review.rating]) {
    const line = pick(PRAISE[review.rating], seed);
    if (mine) return line;
    return you ? THEIR_PRAISE[review.rating] : line.replace("you found", "they found");
  }
  if (review.rating === "Missed Win") return mine ? "You had a winning move there!" : "They missed a winning move there.";
  if (review.rating === "Miss") return mine ? "You missed a chance to win material." : "They missed a chance to win material.";

  // What the opponent can do now: Stockfish's best reply
  const reply = afterEval?.best;
  const score = afterEval?.score;
  if (score?.mate !== undefined && (mover === "white" ? score.mate < 0 : score.mate > 0)) {
    return mine ? "Careful: that walks into a checkmate." : "That lets you go for checkmate!";
  }
  if (reply) {
    const victim = after.board.get(reply.to);
    const piece = after.board.get(reply.from);
    if (victim && victim.color === mover && PIECE_VALUES[victim.role] >= 3) {
      return mine ? pick([`Careful: that drops your ${NAMES[victim.role]}.`, `Oops, that lets ${them} win your ${NAMES[victim.role]}.`], seed)
        : `That lets you win their ${NAMES[victim.role]}!`;
    }
    const replyAfter = after.clone();
    replyAfter.play(reply);
    if (replyAfter.isCheck()) return mine ? `That lets ${them} hit back with a check.` : "That lets you hit back with a check.";
    const hits = targets(replyAfter, reply.to);
    if (piece && piece.role !== "pawn" && hits.length && !victim) {
      const developing = (piece.color === "white" ? reply.from >> 3 === 0 : reply.from >> 3 === 7);
      if (developing) return mine ? `You've let ${them} develop with tempo.` : "You can develop with tempo now.";
      if (hits.length >= 2) return mine ? `That allows a fork.` : "You've got a fork now!";
      return mine ? `That lets ${them} attack your ${NAMES[hits[0]]}.` : `Now you can attack their ${NAMES[hits[0]]}.`;
    }
    if (victim && victim.color === mover) return mine ? `That gives ${them} a free ${NAMES[victim.role]}.` : `That gives you a free ${NAMES[victim.role]}.`;
  }
  const generic: Record<string, string[]> = {
    Inaccuracy: ["Not bad, but there was something stronger.", "Playable, but there was a better move."],
    Mistake: ["Hmm, that hands over the advantage.", "That's a mistake: there was a much better move."],
    Blunder: ["Ouch, that's a big mistake.", "That one really hurts, I'm afraid."],
  };
  const line = pick(generic[review.rating] ?? ["Interesting choice."], seed);
  return mine ? line : line.replace("I'm afraid", "for them");
}

// ---------------------------------------------------------------------------
// Why a move is good, and what it controls (for "Tell me more")
// ---------------------------------------------------------------------------

const CENTRE = ["d4", "e4", "d5", "e5"].map((name) => ["a", "b", "c", "d", "e", "f", "g", "h"].indexOf(name[0]) + 8 * (Number(name[1]) - 1));

/** The squares worth pointing at that the piece on `square` controls: the
 *  centre, and enemy pieces it attacks. */
export function controlledSquares(position: Chess, square: number): number[] {
  const piece = position.board.get(square);
  if (!piece || piece.role === "king") return [];
  const reach = attacks(piece, square, position.board.occupied);
  const centre = CENTRE.filter((s) => reach.has(s) && s !== square);
  return [...new Set([...centre, ...targetsOf(position, square)])];
}

/** Why a move is good, in a short clause: "it develops your knight and controls the centre". */
export function whyMove(before: Chess, move: NormalMove, listener: Color | null): string {
  const piece = before.board.get(move.from);
  if (!piece) return "";
  const after = before.clone();
  after.play(move);
  const victim = before.board.get(move.to);
  const name = NAMES[piece.role];
  const yours = owner(piece.color, listener);
  const theirs = owner(opposite(piece.color), listener);
  if (after.isCheckmate()) return "it's checkmate";
  const castles = piece.role === "king" && (Math.abs((move.to & 7) - (move.from & 7)) > 1 || victim?.color === piece.color);
  if (castles) return "it gets the king safe and brings the rook into play";
  const parts: string[] = [];
  // Taking something smaller where it can be taken back is a sacrifice
  const sacrifice = victim && victim.color !== piece.color && PIECE_VALUES[victim.role] < PIECE_VALUES[piece.role]
    && after.kingAttackers(move.to, opposite(piece.color), after.board.occupied).nonEmpty();
  if (sacrifice) {
    const king = after.board.kingOf(opposite(piece.color));
    const near = king !== undefined && Math.abs((king & 7) - (move.to & 7)) <= 2 && Math.abs((king >> 3) - (move.to >> 3)) <= 2;
    return `it gives up ${yours} ${name} for a ${NAMES[victim.role]}${near ? " to break open the king" : ""}`;
  }
  if (victim && victim.color !== piece.color) parts.push(`it wins ${theirs} ${NAMES[victim.role]}`);
  else if (after.isCheck()) parts.push("it gives check");
  else if (piece.role !== "pawn" && (piece.color === "white" ? move.from >> 3 === 0 : move.from >> 3 === 7)) parts.push(`it develops ${yours} ${name}`);
  else if (piece.role === "pawn" && CENTRE.includes(move.to)) parts.push("it takes space in the centre");
  const centre = CENTRE.filter((s) => attacks(piece, move.to, after.board.occupied).has(s));
  const hits = targets(after, move.to);
  if (hits.length && !victim) parts.push(`attacks ${theirs} ${NAMES[hits[0]]}`);
  else if (centre.length && !(piece.role === "pawn" && CENTRE.includes(move.to))) parts.push("controls the centre");
  if (!parts.length) return quietIdea(before, move, listener)?.clause ?? "it's a useful waiting move";
  if (parts.length === 1 && !parts[0].startsWith("it ")) return `it ${parts[0]}`;
  return parts.join(" and ");
}

/** What a quiet move is for, with the squares worth highlighting: it takes a
 *  square from an enemy piece, builds a pawn chain, makes room for the king,
 *  puts a rook on an open file, or gives a piece more scope. */
export function quietIdea(before: Chess, move: NormalMove, listener: Color | null): { clause: string; squares: number[] } | null {
  const piece = before.board.get(move.from);
  if (!piece) return null;
  const after = before.clone();
  after.play(move);
  const them = opposite(piece.color);
  const theirs = owner(them, listener);
  const forward = piece.color === "white" ? 8 : -8;
  // A square it now covers that an enemy piece wanted (e.g. h3 stops ...Ng4 and ...Bg4)
  const was = attacks(piece, move.from, before.board.occupied);
  const now = attacks(piece, move.to, after.board.occupied);
  let best: { square: number; roles: Role[] } | null = null;
  for (const square of now) {
    if (was.has(square) || after.board.get(square)) continue;
    const roles: Role[] = [];
    for (const from of after.board[them]) {
      const enemy = after.board.get(from)!;
      if (enemy.role === "pawn" || enemy.role === "king") continue;
      if (attacks(enemy, from, after.board.occupied).has(square) && PIECE_VALUES[enemy.role] >= PIECE_VALUES[piece.role]) roles.push(enemy.role);
    }
    // only squares on their opponent's half, where a piece would be annoying
    const rank = square >> 3;
    const advanced = piece.color === "white" ? rank >= 2 && rank <= 4 : rank >= 3 && rank <= 5;
    if (roles.length && advanced && (!best || roles.length > best.roles.length)) best = { square, roles };
  }
  if (piece.role === "pawn") {
    // A pawn chain: a pawn of yours diagonally behind it
    const behind = [move.to - forward - 1, move.to - forward + 1].filter((sq) => sq >= 0 && sq < 64 && Math.abs((sq & 7) - (move.to & 7)) === 1);
    const chain = behind.filter((sq) => {
      const other = after.board.get(sq);
      return other?.role === "pawn" && other.color === piece.color;
    });
    if (best) {
      const names = [...new Set(best.roles)].map((r) => NAMES[r]);
      return { clause: `it takes a key square away from ${theirs} ${names.join(" and ")}`, squares: [best.square] };
    }
    if (chain.length) return { clause: "it builds a pawn chain, each pawn guarding the next", squares: [chain[0], move.to] };
    // Room for the king: a pawn in front of your castled king
    const king = after.board.kingOf(piece.color);
    if (king !== undefined && Math.abs((king & 7) - (move.from & 7)) <= 1 && Math.abs((king >> 3) - (move.from >> 3)) === 1) {
      return { clause: "it gives your king an escape square", squares: [move.from] };
    }
    return null;
  }
  if (best) {
    const names = [...new Set(best.roles)].map((r) => NAMES[r]);
    return { clause: `it covers a key square, keeping ${theirs} ${names.join(" and ")} out`, squares: [best.square] };
  }
  if (piece.role === "rook" && (move.to & 7) !== (move.from & 7)) {
    const file = move.to & 7;
    let ownPawns = 0;
    for (let rank = 0; rank < 8; rank++) {
      const other = after.board.get(rank * 8 + file);
      if (other?.role === "pawn" && other.color === piece.color) ownPawns++;
    }
    if (!ownPawns) return { clause: `it puts the ${NAMES.rook} on an open file`, squares: [] };
  }
  if (now.size() > was.size() + 1) return { clause: `it gives the ${NAMES[piece.role]} more room to work`, squares: [] };
  return null;
}

/** A move said as a whole sentence, then why it's good: "Your knight takes
 *  their pawn." or "Your pawn moves up. It takes a key square away from their
 *  bishop." (the "why" is left out when it only repeats the words). */
export function moveInWords(before: Chess, move: NormalMove, listener: Color | null): string {
  const said = narrateMove(before, move, listener);
  const why = whyMove(before, move, listener);
  const repeats = (before.board.get(move.to) && why.startsWith("it wins")) || (said.includes("check") && why === "it gives check")
    || said.includes("castle") || said.includes("Checkmate") || why === "it's a useful waiting move";
  return repeats || !why ? said : `${said} ${cap(why)}.`;
}

/** "an inaccuracy", "the best move", ... for "Your move was ..." */
export function ratingWords(rating: string): string {
  const words: Record<string, string> = {
    Brilliant: "brilliant", Great: "a great move", Best: "the best move", Excellent: "excellent", Good: "good",
    Book: "a known opening move", Forced: "the only move", Inaccuracy: "an inaccuracy", Mistake: "a mistake",
    Miss: "a missed chance", "Missed Win": "a missed win", Blunder: "a blunder",
  };
  return words[rating] ?? rating.toLowerCase();
}

/** How dangerous a move was, judged by what Stockfish's reply can win:
 *  red = the queen (or mate), orange = a piece, amber = a pawn, yellow = the centre. */
export type Danger = { level: "red" | "orange" | "amber" | "yellow"; text: string };

export function dangerAfter(review: Review, before: Chess, after: Chess, beforeEval: Evaluation | undefined,
  afterEval: Evaluation | undefined, inBook: boolean): Danger | null {
  if (!["Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"].includes(review.rating)) return null;
  const mover = before.turn;
  const pawns = (e: Evaluation | undefined) => {
    if (!e) return undefined;
    const score = e.score;
    const cp = score.mate !== undefined ? (score.mate > 0 ? 2000 : -2000) : score.cp;
    return (mover === "white" ? cp : -cp) / 100;
  };
  const was = pawns(beforeEval);
  const now = pawns(afterEval);
  const loss = was !== undefined && now !== undefined ? Math.max(0, was - now) : 0;
  const reply = afterEval?.best;
  const victim = reply ? after.board.get(reply.to) : undefined;
  const lost = victim && victim.color === mover ? victim.role : undefined;
  const mate = afterEval?.score.mate !== undefined && (mover === "white" ? afterEval.score.mate < 0 : afterEval.score.mate > 0);
  if (mate) return { level: "red", text: "There's a checkmate coming." };
  // What their best reply takes decides the colour first...
  if (lost === "queen") return { level: "red", text: "They can win your queen." };
  if (lost && PIECE_VALUES[lost] >= 3) return { level: "orange", text: `Your ${NAMES[lost]} can be taken.` };
  if (lost === "pawn") return { level: "amber", text: "You can lose a pawn here." };
  // ...otherwise how much the score dropped (the loss comes a little later)
  if (loss >= 6) return { level: "red", text: "This is about to cost you a lot." };
  if (loss >= 2.5) return { level: "orange", text: "You can lose a piece here." };
  if (loss >= 0.8) return { level: "amber", text: "You can lose a pawn here." };
  // A small slip: only worth a warning if they take over the centre
  if (!inBook && reply && CENTRE.includes(reply.to)) return { level: "yellow", text: "They can take over the centre." };
  return null;
}
