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
  // A pin: the piece it hits can't move, because their king stands behind it
  const pinned = pinnedBy(after, move.to);
  if (pinned !== undefined && !check) {
    text += `${victim ? "," : " and"} pins ${target(after.board.get(pinned)!.role)} to the king.`;
    return text;
  }
  if (check && hits.length) text += `, with check, and also hits ${target(hits[0])}`;
  else if (check) text += ", with check";
  else if (fork) text += ` and attacks ${target(hits[0])} and ${target(hits[1])} at once: a fork!`;
  else if (hits.length) text += ` and hits ${target(hits[0])}`;
  if (!fork) text += ".";
  return text;
}

/** An enemy piece the slider on `square` pins to its king (one in between, the king behind). */
export function pinnedBy(position: Chess, square: number): number | undefined {
  const piece = position.board.get(square);
  if (!piece || !["bishop", "rook", "queen"].includes(piece.role)) return undefined;
  const king = position.board.kingOf(opposite(piece.color));
  if (king === undefined) return undefined;
  const occupied = position.board.occupied;
  for (const hit of attacks(piece, square, occupied).intersect(position.board[opposite(piece.color)])) {
    const role = position.board.get(hit)!.role;
    if (role === "king" || role === "pawn") continue;
    if (attacks(piece, square, occupied.without(hit)).has(king)) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The coach's one-line verdict on a move
// ---------------------------------------------------------------------------

const PRAISE: Record<string, string[]> = {
  Brilliant: ["A masterstroke! A sacrifice that really works.", "Wow, what a move! That sacrifice is spot on."],
  Great: ["The key move! That was the one to play.", "Key move: you found the one that holds."],
  Best: ["That's the best move.", "Spot on, that's the move.", "Perfect, that's the best move."],
  Excellent: ["Very nice, almost the best move.", "Strong, that keeps things going your way."],
  Good: ["Good, solid move.", "That's a sensible choice.", "Fine move, nothing wrong with that."],
  Book: ["Straight out of the opening book.", "Good theory: that's a known move.", "Right on track with the opening."],
  Forced: ["That was the only move.", "No choice there, and you found it."],
};

// The same, said about your opponent's move
const THEIR_PRAISE: Record<string, string> = {
  Brilliant: "A masterstroke from them: a sacrifice that works.",
  Great: "The key move from them.",
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
  afterEval: Evaluation | undefined, you: Color | null, seed: number, neutral = false): string {
  const mover = before.turn;
  if (neutral) return neutralVerdict(review, after, afterEval, mover, seed);
  const mine = !you || you === mover;
  const them = !you ? (mover === "white" ? "Black" : "White") : mine ? "them" : "you";
  if (PRAISE[review.rating]) {
    const line = pick(PRAISE[review.rating], seed);
    if (mine) return line;
    return you ? THEIR_PRAISE[review.rating] : line.replace("you found", "they found");
  }
  if (review.rating === "Missed Win") return mine ? "You had a winning move there!" : pick(THEY_MISSED, seed);
  if (review.rating === "Miss") return mine ? "You missed a chance to win material." : pick(THEY_MISSED, seed);

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
  if (!mine) return pick(THEIR_SLIP[review.rating] ?? ["Not their best move."], seed);
  return pick(generic[review.rating] ?? ["Interesting choice."], seed);
}

/** Their slip, said from your side of the board: how bad it was for them. */
const THEIR_SLIP: Record<string, string[]> = {
  Inaccuracy: ["A small slip from them.", "Not their best: there was something stronger.", "A loose move. Can you make it count?"],
  Mistake: ["That's a mistake by them.", "Not a good move: that gives you the upper hand.", "They've slipped up. Your chance to take over."],
  Blunder: ["A big mistake by them!", "That's a blunder: it could hand you the game.", "Ouch, for them. Can you see why?"],
};

/** They missed a chance against you: you got lucky. */
const THEY_MISSED = ["Lucky you: they missed a strong move.", "They let you off the hook there.", "You got away with one."];

/** The verdict for someone watching (no "you"): "White has allowed Black to win the rook." */
function neutralVerdict(review: Review, after: Chess, afterEval: Evaluation | undefined, mover: Color, seed: number): string {
  const me = mover === "white" ? "White" : "Black";
  const other = mover === "white" ? "Black" : "White";
  const praise: Record<string, string> = {
    Brilliant: `A masterstroke by ${me}!`, Great: `The key move by ${me}.`, Best: `${me} found the best move.`,
    Excellent: `A strong move by ${me}.`, Good: `A solid move by ${me}.`, Book: "A known opening move.", Forced: `That was ${me}'s only move.`,
  };
  if (praise[review.rating]) return praise[review.rating];
  if (review.rating === "Missed Win" || review.rating === "Miss") {
    return pick([`${me} missed a strong move there.`, `${other} got away with one: ${me} missed a chance.`], seed);
  }
  const reply = afterEval?.best;
  const score = afterEval?.score;
  if (score?.mate !== undefined && (mover === "white" ? score.mate < 0 : score.mate > 0)) return `${me} walks into a checkmate.`;
  if (reply) {
    const victim = after.board.get(reply.to);
    const piece = after.board.get(reply.from);
    if (victim && victim.color === mover && PIECE_VALUES[victim.role] >= 3) return `${me} lets ${other} win the ${NAMES[victim.role]}.`;
    const replyAfter = after.clone();
    replyAfter.play(reply);
    if (replyAfter.isCheck()) return `${me} lets ${other} hit back with a check.`;
    const hits = targets(replyAfter, reply.to);
    if (piece && piece.role !== "pawn" && hits.length && !victim) {
      const developing = (piece.color === "white" ? reply.from >> 3 === 0 : reply.from >> 3 === 7);
      if (developing) return `${me} lets ${other} develop with tempo.`;
      if (hits.length >= 2) return `${me} walks into a fork.`;
      return `${me} lets ${other} attack the ${NAMES[hits[0]]}.`;
    }
    if (victim && victim.color === mover) return `${me} gives ${other} a free ${NAMES[victim.role]}.`;
  }
  // how bad it was, said from the outside, by the colour of the pieces
  const generic: Record<string, string[]> = {
    Inaccuracy: [`A small slip by ${me}.`, `Not ${me}'s best: there was something stronger.`, `A loose move by ${me}.`],
    Mistake: [`That's a mistake by ${me}.`, `Not a good move by ${me}: ${other} takes over.`, `${me} slips up here.`],
    Blunder: [`A big mistake by ${me}!`, `That's a blunder by ${me}.`, `Ouch, a costly move by ${me}.`],
  };
  return pick(generic[review.rating] ?? ["Interesting choice."], seed);
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

/** What a piece covers, for a picture - kept to what matters: the central
 *  squares it now controls (c3 to f6, not ones your own pieces stand on), as
 *  dots; a bishop instead shows its forward diagonals, as thin lines to
 *  their far ends (two squares or more), since its reach is what it's for. */
export function pieceReach(position: Chess, square: number): { dots: number[]; lines: number[] } {
  const piece = position.board.get(square);
  if (!piece || piece.role === "king") return { dots: [], lines: [] };
  if (piece.role !== "bishop") {
    const reach = attacks(piece, square, position.board.occupied).diff(position.board[piece.color]);
    return { dots: [...reach].filter((s) => (s & 7) >= 2 && (s & 7) <= 5 && s >> 3 >= 2 && s >> 3 <= 5), lines: [] };
  }
  const lines: number[] = [];
  // (its forward diagonals: what it's eyeing, not the way back home)
  const ahead = piece.color === "white" ? 1 : -1;
  for (const [df, dr] of [[1, ahead], [-1, ahead]]) {
    let [f, r, steps, end] = [square & 7, square >> 3, 0, -1];
    for (;;) {
      f += df;
      r += dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      end = r * 8 + f;
      steps++;
      if (position.board.occupied.has(end)) break;
    }
    if (steps >= 2) lines.push(end);
  }
  return { dots: [], lines };
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
  const them = opposite(piece.color);
  const home = piece.color === "white" ? 0 : 7;
  // The king: out of check, or (with the queens gone) into play
  if (piece.role === "king") {
    if (before.isCheck()) return "it gets the king out of check";
    const queens = before.board.pieces("white", "queen").size() + before.board.pieces("black", "queen").size();
    return queens ? "it moves the king to a safer square" : "it brings the king into the game";
  }
  if (victim && victim.color !== piece.color) {
    // can they take back?
    const retaken = after.kingAttackers(move.to, them, after.board.occupied).nonEmpty();
    const defended = after.kingAttackers(move.to, piece.color, after.board.occupied).nonEmpty();
    // Taking something smaller where it can be taken back, with nothing to take back in turn, is a sacrifice
    if (retaken && !defended && PIECE_VALUES[victim.role] < PIECE_VALUES[piece.role]) {
      const king = after.board.kingOf(them);
      const near = king !== undefined && Math.abs((king & 7) - (move.to & 7)) <= 2 && Math.abs((king >> 3) - (move.to >> 3)) <= 2;
      return `it gives up ${yours} ${name} for a ${NAMES[victim.role]}${near ? " to break open the king" : ""}`;
    }
    const check = after.isCheck() ? ", with check" : "";
    // a free piece (or a bigger one) is won; otherwise it's a trade
    if (!retaken || PIECE_VALUES[victim.role] > PIECE_VALUES[piece.role]) return `it wins ${theirs} ${NAMES[victim.role]}${check}`;
    return `it takes ${theirs} ${NAMES[victim.role]}${check}`;
  }
  if (after.isCheck()) {
    const hits = targets(after, move.to);
    return hits.length ? `it gives check and attacks ${theirs} ${NAMES[hits[0]]}` : "it gives check";
  }
  const parts: string[] = [];
  const minor = piece.role === "knight" || piece.role === "bishop";
  if (minor && move.from >> 3 === home) parts.push(`it develops ${yours} ${name}`);
  else if (piece.role === "rook" && move.from >> 3 === home && move.to >> 3 === home) parts.push("it brings the rook into play");
  else if (piece.role === "pawn" && CENTRE.includes(move.to)) parts.push("it takes space in the centre");
  const hits = targets(after, move.to);
  if (hits.length) parts.push(`${parts.length ? "" : "it "}attacks ${theirs} ${NAMES[hits[0]]}`);
  // pressure on something they have to keep defending
  const reach = attacks(piece, move.to, after.board.occupied);
  const pressed = [...reach.intersect(after.board[them])].map((sq) => after.board.get(sq)!.role)
    .filter((role) => role !== "king").sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a])[0];
  if (!hits.length && pressed && !parts.length) parts.push(`it puts pressure on ${theirs} ${NAMES[pressed]}`);
  // the centre: only for a knight or bishop that now eyes two centre squares
  const centre = CENTRE.filter((s) => reach.has(s));
  if (!hits.length && !pressed && minor && centre.length >= 2) parts.push(`${parts.length ? "" : "it "}controls the centre`);
  if (!parts.length) {
    return quietIdea(before, move, listener)?.clause
      ?? (piece.role === "pawn" ? "it makes room for the pieces behind it" : `it puts ${yours} ${name} on a better square`);
  }
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
  const repeats = (before.board.get(move.to) && (why.startsWith("it wins") || why.startsWith("it takes"))) || (said.includes("check") && why === "it gives check")
    || said.includes("castle") || said.includes("Checkmate") || why === "it's a useful waiting move";
  return repeats || !why ? said : `${said} ${cap(why)}.`;
}

/** "an inaccuracy", "the best move", ... for "Your move was ..." */
export function ratingWords(rating: string): string {
  const words: Record<string, string> = {
    Brilliant: "a masterstroke", Great: "a key move", Best: "the top move", Excellent: "strong", Good: "solid",
    Book: "a known opening move", Forced: "the only move", Inaccuracy: "imprecise", Mistake: "a mistake",
    Miss: "a missed chance", "Missed Win": "a missed win", Blunder: "a blunder",
  };
  return words[rating] ?? rating.toLowerCase();
}

/** How dangerous a move was, judged by what Stockfish's reply can win:
 *  red = the queen (or mate), orange = a piece, amber = a pawn, yellow = the centre. */
export type Danger = { level: "red" | "orange" | "amber" | "yellow"; text: string };

export function dangerAfter(review: Review, before: Chess, after: Chess, beforeEval: Evaluation | undefined,
  afterEval: Evaluation | undefined, inBook: boolean, viewer: Color | null = null): Danger | null {
  const danger = rawDanger(review, before, after, beforeEval, afterEval, inBook);
  if (!danger || viewer === null || viewer === before.turn) return danger;
  // Their slip: say it as the chance it gives you
  const SAID: Record<string, string> = {
    "There's a checkmate coming.": "You have a checkmate coming.",
    "They can win your queen.": "You can win their queen.",
    "You can lose a pawn here.": "You can win a pawn here.",
    "This is about to cost you a lot.": "This is about to cost them a lot.",
    "You can lose a piece here.": "You can win a piece here.",
    "They can take over the centre.": "You can take over the centre.",
  };
  const text = SAID[danger.text] ?? danger.text.replace(/^Your (\w+) can be taken\.$/, "You can take their $1.");
  return { ...danger, text };
}

function rawDanger(review: Review, before: Chess, after: Chess, beforeEval: Evaluation | undefined,
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
