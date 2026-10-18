// The coach's words: a short, natural sentence for a move (for stepping
// through a line one move at a time), and a one-line verdict on a move you
// played. The board shows WHICH move; these say what it means, so they never
// name the move itself.
import { Chess } from "chessops/chess";
import { attacks } from "chessops/attacks";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

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
  const to = makeSquare(move.to);
  if (after.isCheckmate()) return victim ? `${subject} takes on ${to}. Checkmate!` : `${subject} goes to ${to}. Checkmate!`;
  const castles = piece.role === "king" && Math.abs((move.to & 7) - (move.from & 7)) > 1 ||
    (piece.role === "king" && victim?.role === "rook" && victim.color === piece.color);
  if (castles) return `${cap(mover === "your" ? "you castle" : mover === "their" ? "they castle" : `${mover.replace("'s", "")} castles`)}: the king is tucked away safely.`;
  if (move.promotion) return `The pawn reaches the last rank and becomes a ${NAMES[move.promotion]}!`;

  const check = after.isCheck();
  const hits = targets(after, castles ? move.from : move.to);
  const fork = hits.length >= 2;
  const victimOwner = victim ? owner(victim.color, listener) : "";
  let text: string;
  if (victim) text = `${subject} takes ${victimOwner} ${NAMES[victim.role]}`;
  else if (piece.role === "pawn") text = `${subject} moves up to ${to}`;
  else if ((piece.color === "white" ? move.from >> 3 === 0 : move.from >> 3 === 7) && piece.role !== "rook" && piece.role !== "queen")
    text = `${subject} comes out to ${to}`;
  else text = `${subject} goes to ${to}`;

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
  Best: ["That's exactly what Stockfish would play.", "Spot on, the best move.", "Perfect, that's the top choice."],
  Excellent: ["Very nice, almost the best move.", "Excellent, that keeps things going your way."],
  Good: ["Good, solid move.", "That's a sensible choice.", "Fine move, nothing wrong with that."],
  Book: ["Straight out of the opening book.", "Good theory: that's a known move.", "Right on track with the opening."],
  Forced: ["That was the only move.", "No choice there, and you found it."],
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
    return mine ? line : line.replace("Stockfish would play", "Stockfish wanted").replace(/^Spot on, /, "They found ");
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
