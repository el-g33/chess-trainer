// The coach's words: a short, natural sentence for a move (for stepping
// through a line one move at a time), and a one-line verdict on a move you
// played. The board shows WHICH move; these say what it means, so they never
// name the move itself.
import { Chess } from "chessops/chess";
import { attacks, between } from "chessops/attacks";
import { parseSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, makeUci, opposite } from "chessops/util";

import { PIECE_VALUES } from "./coach";
import { positionalReason, reasonWords } from "./reasons";
import { exchangeGain, forkOf, freeTake, materialWon, movePhrase, pieceAt, type Taken, type Won, pinWins, playLine, replyWins } from "./tactics";
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

/** A take that's only a trade: the taker is worth at least as much, and it
 *  can be taken back (so nothing is won by it). */
export function isTrade(position: Chess, take: NormalMove | undefined): boolean {
  if (!take) return false;
  const piece = position.board.get(take.from);
  const victim = position.board.get(take.to);
  if (!piece || !victim || victim.color === piece.color || PIECE_VALUES[piece.role] < PIECE_VALUES[victim.role]) return false;
  const after = position.clone();
  after.play(take);
  return after.kingAttackers(take.to, victim.color, after.board.occupied).nonEmpty();
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
  else if (piece.role === "pawn") text = `${subject} pushes forward`;
  else if (piece.role === "king") text = `${subject} steps ${before.isCheck() ? "out of check" : "aside"}`;
  else if ((piece.color === "white" ? move.from >> 3 === 0 : move.from >> 3 === 7) && piece.role !== "rook" && piece.role !== "queen")
    text = `${subject} comes out`;
  else if (piece.role === "knight" && (piece.color === "white" ? move.to >> 3 < move.from >> 3 : move.to >> 3 > move.from >> 3)) {
    // back towards its own side: making way for a pawn behind it, or just stepping back
    const behind = move.from + (piece.color === "white" ? -8 : 8);
    const pawn = behind >= 0 && behind < 64 ? before.board.get(behind) : undefined;
    text = pawn?.role === "pawn" && pawn.color === piece.color ? `${subject} steps back, making way for ${mover} ${"abcdefgh"[behind & 7]}-pawn` : `${subject} steps back`;
  } else text = piece.role === "knight" ? `${subject} jumps in` : `${subject} moves`;

  const target = (role: Role) => `${owner(opposite(piece.color), listener)} ${NAMES[role]}`;
  // A pin: the piece it hits can't move, because their king stands behind it
  const pinned = pinnedBy(after, move.to);
  if (pinned !== undefined && !check) {
    text = victim ? `${text}, pinning ${target(after.board.get(pinned)!.role)} to the king.` : `${subject} pins ${target(after.board.get(pinned)!.role)} to the king.`;
    return text;
  }
  // ...or it can't move without leaving their queen to be taken
  const toQueen = pinnedTo(after, move.to, "queen");
  if (toQueen !== undefined && !check) {
    text = victim ? `${text}, pinning ${target(after.board.get(toQueen)!.role)} to the queen.` : `${subject} pins ${target(after.board.get(toQueen)!.role)} to the queen.`;
    return text;
  }
  // A pawn on the march: towards their king, and what it will attack next
  if (piece.role === "pawn" && !victim && !check && !hits.length) {
    const king = after.board.kingOf(opposite(piece.color));
    const step = piece.color === "white" ? 8 : -8;
    const ahead = move.to + step;
    const storm = king !== undefined && Math.abs((king & 7) - (move.to & 7)) <= 2 &&
      (piece.color === "white" ? (move.to >> 3) >= 3 : (move.to >> 3) <= 4);
    const next = ahead >= 0 && ahead < 64 && !after.board.occupied.has(ahead)
      ? [...attacks(piece, ahead, after.board.occupied).intersect(after.board[opposite(piece.color)])]
        .map((sq) => after.board.get(sq)!.role).filter((role) => role !== "king")
      : [];
    if (storm) text = `${subject} advances towards ${owner(opposite(piece.color), listener)} king`;
    if (next.length) text += `, getting ready to attack ${next.slice(0, 2).map(target).join(" and ")}`;
  }
  // A piece that joins the attack: it now eyes two or more squares next to their king
  if (!victim && !check && !hits.length && piece.role !== "pawn" && piece.role !== "king") {
    const king = after.board.kingOf(opposite(piece.color));
    if (king !== undefined) {
      const zone = attacks({ role: "king", color: opposite(piece.color) }, king, after.board.occupied);
      const was = attacks(piece, move.from, before.board.occupied).intersect(zone);
      const now = [...attacks(piece, move.to, after.board.occupied).intersect(zone)].filter((square) => !was.has(square));
      if (now.length >= 2 && was.isEmpty()) {
        return `${subject} joins the attack, eyeing ${makeSquare(now[0])} and ${makeSquare(now[1])} next to ${owner(opposite(piece.color), listener)} king.`;
      }
    }
  }
  // A quiet move that eyes a piece (even one that's defended): say what it aims at
  if (!victim && !check && !hits.length && piece.role !== "pawn" && piece.role !== "king") {
    const eyed = [...attacks(piece, move.to, after.board.occupied).intersect(after.board[opposite(piece.color)])]
      .map((square) => after.board.get(square)!.role).filter((role) => role !== "pawn" && role !== "king");
    if (eyed.length) return `${text}, eyeing ${target(eyed[0])}.`;
  }
  if (check && hits.length) text += `, with check, and also hits ${target(hits[0])}`;
  else if (check) text += ", with check";
  else if (fork) text += ` and attacks ${target(hits[0])} and ${target(hits[1])} at once: a fork!`;
  else if (hits.length) text += ` and hits ${target(hits[0])}`;
  if (!fork) text += ".";
  return text;
}

/** An enemy piece the slider on `square` pins to their `role` behind it (one in
 *  between, worth less than what's behind it). */
export function pinnedTo(position: Chess, square: number, role: Role): number | undefined {
  const piece = position.board.get(square);
  if (!piece || !["bishop", "rook", "queen"].includes(piece.role) || piece.role === role) return undefined;
  const occupied = position.board.occupied;
  const theirs = position.board[opposite(piece.color)];
  for (const hit of attacks(piece, square, occupied).intersect(theirs)) {
    const hitRole = position.board.get(hit)!.role;
    if (hitRole === role || hitRole === "king" || PIECE_VALUES[hitRole] >= PIECE_VALUES[role]) continue;
    for (const behind of attacks(piece, square, occupied.without(hit)).intersect(theirs)) {
      if (position.board.get(behind)?.role === role && !attacks(piece, square, occupied).has(behind)) return hit;
    }
  }
  return undefined;
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

/** A threat they already had before the move and still have after it: their
 *  best reply takes a piece of the mover's that stood on that square before,
 *  with the same piece, and it was already worth taking then (nothing guarded
 *  it, or the taker is worth less), and still is. The move didn't deal with it. `fresh` when
 *  their last move made the threat (the taker moved there, or moved out of
 *  its way). */
export interface IgnoredThreat { move: NormalMove; victim: Role; taker: Role; fresh: boolean }

export function ignoredThreat(before: Chess, after: Chess, reply: NormalMove | undefined, lastMove?: NormalMove): IgnoredThreat | null {
  if (!reply || before.isCheck() || after.isEnd()) return null;
  const mover = before.turn;
  const victim = after.board.get(reply.to);
  const taker = after.board.get(reply.from);
  if (!victim || !taker || victim.color !== mover || taker.color === mover || victim.role === "king") return null;
  // (a move that takes something - taking back, say - didn't ignore the threat: it was busy with a trade)
  if (after.board[opposite(mover)].size() < before.board[opposite(mover)].size()) return null;
  const was = before.board.get(reply.to);
  const wasTaker = before.board.get(reply.from);
  if (was?.role !== victim.role || was.color !== mover || wasTaker?.role !== taker.role || wasTaker.color !== taker.color) return null;
  // (as if the mover had passed: their take was there to play)
  const passed = before.clone();
  passed.turn = opposite(mover);
  passed.epSquare = undefined;
  if (!passed.isLegal(reply)) return null;
  // worth taking before the move, and still after it (a guard added since is a different story)
  const cheaper = PIECE_VALUES[taker.role] < PIECE_VALUES[victim.role];
  const guarded = (position: Chess) => position.kingAttackers(reply.to, mover, position.board.occupied).nonEmpty();
  if (!cheaper && (guarded(before) || guarded(after))) return null;
  const fresh = !!lastMove && (lastMove.to === reply.from || between(reply.from, reply.to).has(lastMove.from));
  return { move: reply, victim: victim.role, taker: taker.role, fresh };
}

/** The weakness a slip made (that the better move doesn't), for a slip
 *  that loses nothing you can see, when the better move was a quiet one too. */
export function quietReason(review: Review, before: Chess, after: Chess, beforeEval?: Evaluation, afterEval?: Evaluation) {
  // (a blunder, or a better move that takes or checks, is about tactics, not the pawns;
  // so is a move that loses something concrete)
  if (!["Inaccuracy", "Mistake"].includes(review.rating) || !review.bestSan || /[x+#]/.test(review.bestSan)) return undefined;
  if (afterEval && dangerAfter(review, before, after, beforeEval, afterEval, true)) return undefined;
  const best = parseSan(before, review.bestSan) as NormalMove | undefined;
  const played = moveBetween(before, after);
  return played ? positionalReason(before, played, best) : undefined;
}

/** The move from one position to the next (undefined when they aren't one move apart). */
function moveBetween(before: Chess, after: Chess): NormalMove | undefined {
  for (const [from, dests] of before.allDests()) {
    for (const to of dests) {
      const promotion = before.board.get(from)?.role === "pawn" && (to >> 3 === 0 || to >> 3 === 7) ? "queen" as const : undefined;
      const tried = before.clone();
      tried.play({ from, to, promotion });
      if (tried.board.occupied.equals(after.board.occupied) && tried.board.white.equals(after.board.white) && tried.turn === after.turn
        && [...after.board.occupied].every((sq) => tried.board.get(sq)?.role === after.board.get(sq)?.role)) return { from, to, promotion };
    }
  }
  return undefined;
}

/** The coach's verdict, in plain words, on the move that led from `before`
 *  to `after` (played by `mover`; the listener is `you`, or null for neither). */
export function verdict(review: Review, before: Chess, after: Chess,
  afterEval: Evaluation | undefined, you: Color | null, seed: number, neutral = false, beforeEval?: Evaluation): string {
  const mover = before.turn;
  if (neutral) return neutralVerdict(review, before, after, afterEval, mover, seed, beforeEval);
  const mine = !you || you === mover;
  const them = !you ? (mover === "white" ? "Black" : "White") : mine ? "them" : "you";
  // a good move that let a checkmate slip by: say so, it's the one thing worth knowing
  const mateWas = beforeEval?.score.mate;
  const mateKept = afterEval?.score.mate;
  const mating = (m: number | undefined) => m !== undefined && (mover === "white" ? m > 0 : m < 0);
  const best = beforeEval?.best;
  const mateIn = (n: number) => (n === 1 ? "checkmate" : `the start of a checkmate in ${COUNT[n] ?? n}`);
  if (["Good", "Excellent"].includes(review.rating) && mating(mateWas) && Math.abs(mateWas!) <= 3 && !mating(mateKept)) {
    if (best) return mine ? `Good, but ${movePhrase(before, best, "your")} was ${mateIn(Math.abs(mateWas!))}!` : `Good for them, but ${movePhrase(before, best, "their")} was ${mateIn(Math.abs(mateWas!))}.`;
    return mine ? "Good, but you had a checkmate there!" : "Good for them, but they had a checkmate there.";
  }
  if (PRAISE[review.rating]) {
    const line = pick(PRAISE[review.rating], seed);
    if (mine) return line;
    return you ? THEIR_PRAISE[review.rating] : line.replace("you found", "they found");
  }
  // A threat they already had, not dealt with (said first: it matters more than what you missed)
  const ignored = ignoredThreat(before, after, afterEval?.best);
  if (ignored && (mine || !["Miss", "Missed Win"].includes(review.rating))) {
    const what = ignored.victim === "pawn" ? `${makeSquare(ignored.move.to)} pawn` : NAMES[ignored.victim];
    return mine ? `You left your ${what} hanging.` : `They left their ${what} hanging!`;
  }
  const played = moveBetween(before, after);
  // What the opponent can do now: Stockfish's best reply
  const reply = afterEval?.best;
  const score = afterEval?.score;
  if (score?.mate !== undefined && (mover === "white" ? score.mate < 0 : score.mate > 0)) {
    const n = Math.abs(score.mate);
    if (reply && n === 1) {
      // ("their rook to c1" / "taking on c1": the piece isn't there yet)
      return mine ? `Careful: that lets them checkmate you: ${movePhrase(after, reply, "their")}.` : `Now ${movePhrase(after, reply, "your")} is checkmate!`;
    }
    if (reply && n <= 5) return mine ? `Careful: that walks into a checkmate in ${COUNT[n]}, starting with ${movePhrase(after, reply, "their")}.`
      : `That lets you checkmate in ${COUNT[n]}, starting with ${movePhrase(after, reply, "your")}!`;
    return mine ? "Careful: that walks into a checkmate." : "That lets you go for checkmate!";
  }
  // a checkmate you had, and missed
  if (best && mating(mateWas) && Math.abs(mateWas!) <= 5 && !mating(mateKept)) {
    const n = Math.abs(mateWas!);
    return mine ? (n === 1 ? `${cap(movePhrase(before, best, "your"))} was checkmate!` : `You had a checkmate in ${COUNT[n]}, starting with ${movePhrase(before, best, "your")}.`)
      : `Lucky you: they had a checkmate there.`;
  }
  // What the move allows, and what the better move would have won: whichever is worth
  // more is said (a dropped pawn matters less than a missed free bishop). Captures are
  // worked out with every take played out, so a trade is never called a loss.
  const said: { value: number; text: string; best?: boolean }[] = [];
  const victim = reply ? after.board.get(reply.to) : undefined;
  const lost = reply && played ? replyWins(before, played, after, reply) : 0;
  if (reply && victim && victim.color === mover && lost >= Math.min(3, PIECE_VALUES[victim.role])) {
    if (lost >= PIECE_VALUES[victim.role] && PIECE_VALUES[victim.role] >= 3) {
      said.push({ value: lost, text: mine ? pick([`Careful: that drops your ${NAMES[victim.role]}.`, `Oops, that lets ${them} win your ${NAMES[victim.role]}.`], seed)
        : `That lets you win their ${NAMES[victim.role]}!` });
    } else if (lost >= 2) said.push({ value: lost, text: mine ? `That lets ${them} win material.` : "That lets you win material!" });
    else if (victim.role === "pawn") said.push({ value: lost, text: mine ? `That gives ${them} a free pawn.` : "That gives you a free pawn." });
  }
  // a pin that wins a piece
  const pin = reply ? pinWins(after, reply) : undefined;
  if (pin) said.push({ value: PIECE_VALUES[pin.role], text: mine ? `That lets ${them} pin your ${NAMES[pin.role]} to your king and win it.` : `Now you can pin their ${NAMES[pin.role]} to their king and win it!` });
  // the better move: a piece free to take, or a fork
  const tookToo = played ? Math.max(0, exchangeGain(before, played)) : 0;
  const free = best && (!played || best.to !== played.to) ? freeTake(before, best) : undefined;
  const fork = best ? forkOf(before, best) : undefined;
  const forkValue = fork ? Math.max(...fork.hits.map((h) => PIECE_VALUES[h.role]), fork.check ? 0 : 0) : 0;
  if (fork && forkValue > (free ? PIECE_VALUES[free.victim] : 0)) {
    // "checks their king and hits the rook on h1" / "takes on e5 and hits the bishop on d6 and the knight on f6"
    const hit = fork.hits.map((h) => `the ${pieceAt(h.role, h.square)}`).join(" and ");
    const capture = !!before.board.get(best!.to);
    const how = capture ? `takes on ${makeSquare(fork.to)}${fork.check ? " with check" : ""} and hits ${hit}`
      : `to ${makeSquare(fork.to)} ${fork.check ? `checks their king and hits ${hit}` : `hits ${hit}`}`;
    said.push({ value: forkValue, best: true, text: mine ? `You missed a fork: your ${NAMES[fork.piece]} ${how}.`
      : `They missed a fork on ${makeSquare(fork.to)}.` });
  } else if (free && exchangeGain(before, best!) > tookToo) {
    const what = pieceAt(free.victim, free.square);
    said.push({ value: exchangeGain(before, best!), best: true, text: mine ? (free.free ? `Their ${what} was free: your ${NAMES[free.taker]} could take it.` : `Your ${NAMES[free.taker]} could win their ${what}.`)
      : `They missed that your ${what} was ${free.free ? "free" : "loose"}.` });
  }
  // (what you allowed comes first when it's worth as much - unless the piece they
  // take was already under attack: then both sides had a piece to take, and taking first was the point)
  // Further ahead: what Stockfish's lines win or lose a few moves on (a check
  // first, then a fork, say), when that's clearly more than one move shows
  // (a free piece or a fork the better move wins is said as that: it's the same move, put more simply)
  const ahead = lineWords(before, after, played, beforeEval, afterEval, mine);
  const top = said.length ? Math.max(...said.map((s) => s.value)) : 0;
  const sameMove = ahead?.kind === "gain" && said.some((s) => s.best);
  if (ahead && !sameMove && (ahead.value >= top + 2 || (!said.length && ahead.value >= 1))) said.push(ahead);
  const already = reply && victim ? before.kingAttackers(reply.to, opposite(mover), before.board.occupied).nonEmpty() && reply.to !== played?.to : false;
  if (said.length) return said.reduce((a, b) => (b.value > a.value || (already && b.value === a.value) ? b : a)).text;
  if (review.rating === "Missed Win") return mine ? "You had a winning move there!" : pick(THEY_MISSED, seed);
  if (review.rating === "Miss") {
    if (mine && best) return `Their last move was a slip: ${movePhrase(before, best, "your")} was the way to punish it.`;
    return mine ? "Their last move was a slip, and you missed the strongest answer." : pick(THEY_MISSED, seed);
  }

  if (reply) {
    const piece = after.board.get(reply.from);
    const replyAfter = after.clone();
    replyAfter.play(reply);
    // (a check that only trades pieces off says nothing about the check)
    const capture = !!after.board.get(reply.to);
    if (replyAfter.isCheck() && !capture) return mine ? `That lets ${them} hit back with a check.` : "That lets you hit back with a check.";
    const hits = targets(replyAfter, reply.to);
    if (piece && piece.role !== "pawn" && hits.length && !capture) {
      const developing = (piece.color === "white" ? reply.from >> 3 === 0 : reply.from >> 3 === 7);
      if (developing) return mine ? `You've let ${them} develop with tempo.` : "You can develop with tempo now.";
      if (hits.length >= 2) return mine ? `That allows a fork.` : "You've got a fork now!";
      return mine ? `That lets ${them} attack your ${NAMES[hits[0]]}.` : `Now you can attack their ${NAMES[hits[0]]}.`;
    }
  }
  // A castle next to one of its own pushed pawns: a weakened wing, a target for their pawns
  const wing = weakenedWing(before, after, mover);
  if (wing) return mine ? `You've castled into a weakened ${wing}.` : `They've castled into a weakened ${wing}: go after it!`;
  // A quiet slip: the weakness it made that the better move doesn't
  const reason = quietReason(review, before, after, beforeEval, afterEval);
  if (reason) return reasonWords(reason, mover, you);
  const generic: Record<string, string[]> = {
    Inaccuracy: ["Not bad, but there was something stronger.", "Playable, but there was a better move."],
    Mistake: ["Hmm, that hands over the advantage.", "That's a mistake: there was a much better move."],
    Blunder: ["Ouch, that's a big mistake.", "That one really hurts, I'm afraid."],
  };
  if (!mine) return pick(THEIR_SLIP[review.rating] ?? ["Not their best move."], seed);
  return pick(generic[review.rating] ?? ["Interesting choice."], seed);
}

const COUNT: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

/** What the engine's lines show a few moves on: the material the move played
 *  loses, or the better move would have won, compared with each other (so a
 *  position that was lost anyway isn't blamed on this move). */
function lineWords(before: Chess, after: Chess, played: NormalMove | undefined, beforeEval: Evaluation | undefined,
  afterEval: Evaluation | undefined, mine: boolean): { value: number; text: string; kind: "loss" | "gain" } | undefined {
  const mover = before.turn;
  const best = beforeEval?.best;
  if (!played || !best || after.isEnd() || !afterEval?.line || !beforeEval?.line) return undefined;
  const playedLine = playLine(before, `${makeUci(played)} ${afterEval.line}`, mover);
  const bestLine = playLine(before, beforeEval.line, mover);
  if (!playedLine || !bestLine || playedLine.moves.length < 2) return undefined;
  const missed = bestLine.net - playedLine.net;
  if (missed < 1) return undefined;
  // (the scores must agree: a line that seems to win a rook while the score barely
  // moves has been misread, or the material comes back later)
  const pawns = (e: Evaluation) => (e.score.mate !== undefined ? Math.sign(e.score.mate) * 10 : Math.max(-10, Math.min(10, (e.score.cp ?? 0) / 100)));
  const swing = (mover === "white" ? 1 : -1) * (pawns(beforeEval) - pawns(afterEval));
  if (swing < 0.6 * Math.min(missed, 5)) return undefined;
  const checks = (position: Chess, move: NormalMove) => { const t = position.clone(); t.play(move); return t.isCheck(); };
  if (playedLine.net <= -1 && -playedLine.net >= bestLine.net) {
    // the move loses something: name it, and the move it starts with
    const reply = playedLine.moves[1];
    const lost = materialWon(playedLine.lost, playedLine.won, -playedLine.net);
    const value = lost.role ? PIECE_VALUES[lost.role] : lost.exchange ? 2 : lost.piece ? 3 : lost.pawns ?? missed;
    if (mine && lost.role && reply.to === lost.square && playedLine.lost[0]?.square === reply.to) {
      // (taken straight away)
      const taker = after.board.get(reply.from)!;
      return { kind: "loss", value, text: `That just loses your ${NAMES[lost.role]}: their ${NAMES[taker.role]} takes it on ${makeSquare(reply.to)}.` };
    }
    const start = `${movePhrase(after, reply, mine ? "their" : "your")}${checks(after, reply) ? " with check" : ""}`;
    // (where their first move is a quiet one, "it starts with castling" says little: name the piece that falls,
    // where it stands now, when it's a single piece or pawn)
    const quiet = !checks(after, reply) && !after.board.get(reply.to) && !(after.board.get(reply.from)?.role === "pawn" && (reply.from & 7) !== (reply.to & 7));
    const role = lost.role ?? (lost.pawns === 1 ? "pawn" : undefined);
    const falls = quiet && role ? playedLine.lost.find((t) => t.role === role && (lost.square === undefined || t.square === lost.square) && !retaken(t, playedLine.won)) : undefined;
    const stands = falls && after.board.get(falls.square);
    if (falls && stands && stands.role === role && stands.color === mover && !playedLine.promoted.length) {
      const where = `${NAMES[role!]} on ${makeSquare(falls.square)}`;
      return { kind: "loss", value, text: mine ? `That costs your ${where} a few moves on.` : `That lets you win their ${where} a few moves on.` };
    }
    // (a pawn of theirs that gets through to promote is the story, not the pieces lost on the way)
    const queening = playedLine.promoted.find((p) => p.side !== mover);
    if (queening) {
      // (named by where it promotes: a pawn that takes on the way changes file)
      const on = makeSquare(queening.square);
      const runs = after.board.get(reply.from)?.role === "pawn" && Math.abs((reply.to & 7) - (queening.square & 7)) <= 1;
      if (runs) return { kind: "loss", value, text: mine ? `That lets their pawn run through to promote on ${on}.` : `That lets your pawn run through to promote on ${on}.` };
      return { kind: "loss", value, text: mine ? `That lets their pawn through to promote on ${on}: it starts with ${start}.`
        : `That lets your pawn through to promote on ${on}: start with ${start}.` };
    }
    return { kind: "loss", value, text: mine ? `That costs ${wonWords(lost, "your")} a few moves on: it starts with ${start}.`
      : `That lets you win ${wonWords(lost, "their")}: start with ${start}.` };
  }
  if (bestLine.net >= 1) {
    // the better move wins something: name it
    const won = materialWon(bestLine.won, bestLine.lost, bestLine.net);
    const value = won.role ? PIECE_VALUES[won.role] : won.exchange ? 2 : won.piece ? 3 : won.pawns ?? missed;
    const how = `${movePhrase(before, best, mine ? "your" : "their")}${checks(before, best) ? ", with check," : ""}`;
    // (a quiet first move, like castling, doesn't win anything itself: say what falls, and where, then how it starts)
    const quiet = !checks(before, best) && !before.board.get(best.to) && !(before.board.get(best.from)?.role === "pawn" && (best.from & 7) !== (best.to & 7));
    const role = won.role ?? (won.pawns === 1 ? "pawn" : undefined);
    const falls = quiet && role ? bestLine.won.find((t) => t.role === role && (won.square === undefined || t.square === won.square) && !retaken(t, bestLine.lost)) : undefined;
    const stands = falls && before.board.get(falls.square);
    if (quiet && !bestLine.promoted.length) {
      const where = falls && stands && stands.role === role && stands.color !== mover ? `${mine ? "their" : "your"} ${NAMES[role!]} on ${makeSquare(falls.square)}`
        : wonWords(won, mine ? "their" : "your");
      const first = movePhrase(before, best, mine ? "your" : "their");
      return { kind: "gain", value, text: mine ? `You could have won ${where}, starting with ${first}.`
        : `They missed a way to win ${where}, starting with ${first}.` };
    }
    return { kind: "gain", value, text: mine ? `${cap(how)} would have won ${wonWords(won, "their")}.` : `They missed that ${how} wins ${wonWords(won, "your")}.` };
  }
  return undefined;
}

/** A piece taken and straight away taken back on the same square, for one of the same kind: a trade, not a loss. */
function retaken(taken: Taken, other: Taken[]): boolean {
  return other.some((t) => t.square === taken.square && t.ply === taken.ply + 1 && t.role === taken.role);
}

/** "their knight", "two pawns", "the exchange", "material". */
function wonWords(won: Won, whose: string): string {
  if (won.role) return `${whose} ${NAMES[won.role]}`;
  if (won.exchange) return "the exchange";
  if (won.pawns) return won.pawns === 1 ? "a pawn" : `${COUNT[won.pawns] ?? won.pawns} pawns`;
  if (won.piece) return "a piece";
  return won.lots ? "a lot of material" : "material";
}

/** "queenside" or "kingside" when the move was a castle that put the king
 *  beside one of the mover's own pushed pawns (a target for the other side's
 *  pawns), else "". */
export function weakenedWing(before: Chess, after: Chess, mover: Color): string {
  const from = before.board.kingOf(mover);
  const to = after.board.kingOf(mover);
  if (from === undefined || to === undefined || from >> 3 !== to >> 3 || Math.abs((to & 7) - (from & 7)) < 2) return "";
  const home = mover === "white" ? 1 : 6;
  const queenside = (to & 7) <= 2;
  const pushed = [...after.board.pieces(mover, "pawn")].some((square) => {
    const file = square & 7;
    return (queenside ? file <= 2 : file >= 5) && Math.abs(file - (to & 7)) <= 2 && square >> 3 !== home;
  });
  return pushed ? (queenside ? "queenside" : "kingside") : "";
}

/** Their slip, said from your side of the board: how bad it was for them. */
const THEIR_SLIP: Record<string, string[]> = {
  Inaccuracy: ["A small slip from them.", "Not their best: there was something stronger.", "A loose move. Can you make it count?"],
  Mistake: ["That's a mistake by them: they had a much stronger move.", "Not their best: they missed a much stronger move.", "They've slipped up: there was a much better move."],
  Blunder: ["A big mistake by them!", "That's a blunder: it could hand you the game.", "Ouch, for them. Can you see why?"],
};

/** They missed a chance against you: you got lucky. */
const THEY_MISSED = ["Lucky you: they missed a strong move.", "They let you off the hook there.", "You got away with one."];

/** The verdict for someone watching (no "you"): "White has allowed Black to win the rook." */
function neutralVerdict(review: Review, before: Chess, after: Chess, afterEval: Evaluation | undefined, mover: Color, seed: number, beforeEval?: Evaluation): string {
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
  const ignored = ignoredThreat(before, after, reply);
  if (ignored) {
    const what = ignored.victim === "pawn" ? `${makeSquare(reply!.to)} pawn` : NAMES[ignored.victim];
    return `${me} left the ${what} hanging.`;
  }
  if (reply) {
    const played = moveBetween(before, after);
    const lost = played ? replyWins(before, played, after, reply) : 0;
    const victim = lost >= 1 ? after.board.get(reply.to) : undefined;
    const piece = after.board.get(reply.from);
    if (victim && victim.color === mover && PIECE_VALUES[victim.role] >= 3 && lost >= PIECE_VALUES[victim.role]) return `${me} lets ${other} win the ${NAMES[victim.role]}.`;
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
  const wing = weakenedWing(before, after, mover);
  if (wing) return `${me} has castled into a weakened ${wing}.`;
  const reason = quietReason(review, before, after, beforeEval, afterEval);
  if (reason) return reasonWords(reason, mover, null);
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
 *  squares it now controls (c3 to f6, not ones its own side stands on), drawn
 *  as small arrows (a knight's bent, the way it jumps); a bishop instead
 *  shows its forward diagonals, as thin lines to their far ends (two squares
 *  or more), since its reach is what it's for. A pawn: nothing here (its
 *  chain and the pieces it attacks tell its story). */
export function pieceReach(position: Chess, square: number): { centre: number[]; lines: number[] } {
  const piece = position.board.get(square);
  if (!piece || piece.role === "king" || piece.role === "pawn") return { centre: [], lines: [] };
  if (piece.role !== "bishop") {
    const reach = attacks(piece, square, position.board.occupied).diff(position.board[piece.color]);
    return { centre: [...reach].filter((s) => (s & 7) >= 2 && (s & 7) <= 5 && s >> 3 >= 2 && s >> 3 <= 5), lines: [] };
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
  return { centre: [], lines };
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
  // One sentence, never two: a move that does something (takes, hits, checks,
  // castles...) says that; a quiet one says what it's for ("Develops your
  // knight and controls the centre.") - the arrow on the board shows which piece
  const said = narrateMove(before, move, listener);
  const plain = /^\S+ \S+ (moves|pushes forward|comes out|jumps in)\.$/.test(said);
  const why = whyMove(before, move, listener);
  if (!plain || !why || why === "it's a useful waiting move") return said;
  return `${cap(why.replace(/^it /, ""))}.`;
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
  // (worked out with every capture played out: taking back is only a trade)
  const played = moveBetween(before, after);
  const net = reply && played ? replyWins(before, played, after, reply) : 0;
  const lost = victim && victim.color === mover && net >= Math.min(3, PIECE_VALUES[victim.role]) ? victim.role : undefined;
  const mate = afterEval?.score.mate !== undefined && (mover === "white" ? afterEval.score.mate < 0 : afterEval.score.mate > 0);
  if (mate) return { level: "red", text: "There's a checkmate coming." };
  // What their best reply takes decides the colour first...
  if (lost === "queen") return { level: "red", text: "They can win your queen." };
  if (lost && PIECE_VALUES[lost] >= 3) return { level: "orange", text: `Your ${NAMES[lost]} can be taken.` };
  if (lost === "pawn") return { level: "amber", text: "You can lose a pawn here." };
  // ...otherwise how much the score dropped (the loss comes a little later)
  if (loss >= 6) return { level: "red", text: "This is about to cost you a lot." };
  if (loss >= 2.5) return { level: "orange", text: "You can lose a piece here." };
  // (a smaller drop with nothing to take is about where the pieces stand - a
  // better move existed - not something that can be won from you: no warning)
  // A small slip: only worth a warning if they take over the centre
  if (!inBook && reply && CENTRE.includes(reply.to)) return { level: "yellow", text: "They can take over the centre." };
  return null;
}

/** "it brings the rook into play" as "bringing the rook into play" (each verb that starts a part). */
export function asGerund(clause: string): string {
  const ing = (verb: string) => {
    let stem = /(sh|ch|ss|x)es$/.test(verb) ? verb.slice(0, -2) : verb.endsWith("s") ? verb.slice(0, -1) : verb;
    if (/[^e]e$/.test(stem)) stem = stem.slice(0, -1);
    else if (/^[^aeiou]*[aeiou][bdgklmnprt]$/.test(stem)) stem += stem.slice(-1);
    return `${stem}ing`;
  };
  return clause.replace(/^it /, "").replace(/^(\w+)/, (verb) => ing(verb)).replace(/ and (\w+s)\b/g, (_all, verb: string) => ` and ${ing(verb)}`);
}

/** A pawn move that stops one of their pawns coming forward to chase a piece:
 *  before it, their pawn could step to a square where it hits a piece of the
 *  mover's and no pawn of the mover's could take it; after it, a pawn could.
 *  "stops their b-pawn coming to b5 to chase your bishop". */
export function stopsPawn(before: Chess, move: NormalMove, listener: Color | null): string | undefined {
  const piece = before.board.get(move.from);
  if (piece?.role !== "pawn") return undefined;
  const side = piece.color;
  const them = opposite(side);
  const after = before.clone();
  after.play(move);
  const step = them === "white" ? 8 : -8;
  const guardedByPawn = (position: Chess, square: number) =>
    attacks({ role: "pawn", color: them }, square, position.board.occupied).intersects(position.board.pieces(side, "pawn"));
  for (const pawn of before.board.pieces(them, "pawn")) {
    const home = them === "white" ? 1 : 6;
    const tries = [pawn + step, ...((pawn >> 3) === home ? [pawn + 2 * step] : [])];
    for (const to of tries) {
      if (to < 0 || to > 63 || before.board.occupied.has(to) || (to !== pawn + step && before.board.occupied.has(pawn + step))) continue;
      const hit = [...attacks({ role: "pawn", color: them }, to, before.board.occupied).intersect(before.board[side])]
        .map((square) => before.board.get(square)!.role).filter((role) => role !== "pawn" && role !== "king");
      if (!hit.length || guardedByPawn(before, to) || !guardedByPawn(after, to)) continue;
      return `stops ${owner(them, listener)} ${"abcdefgh"[pawn & 7]}-pawn coming to ${makeSquare(to)} to chase ${owner(side, listener)} ${NAMES[hit[0]]}`;
    }
  }
  return undefined;
}
