// The better move, in words: what the coach says when your move was fine but
// there was something better (the See the best move card), and the better
// option on a slip card. Kept apart from the app so the batch reviewer says
// exactly what the app says.

import { type Chess, normalizeMove } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare, makeUci, opposite } from "chessops/util";

import { colourName, afterMove as positionAfter } from "./coach";
import { asGerund, stopsPawn, targetsOf, whyMove } from "./narrate";
import { recaptureReason } from "./reasons";
import { type Evaluation, type Review, winningChance } from "./review";
import { movePhrase, playLine } from "./tactics";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const VALUE: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

/** A move's idea in a few words, straight in: "Brings the knight out and
 *  eyes the centre." (no "Their idea:" - the arrows show whose move it is) */
export function ideaWords(before: Chess, move: NormalMove, viewer: Color | null): string {
  return `${cap(whyMove(before, move, viewer).replace(/^it /, ""))}.`;
}

/** The better move in one coach's line: "Your better option was bringing the
 *  rook into play." A pawn move that stops their pawn chasing a piece says so. */
export function betterWords(before: Chess, after: Chess, best: NormalMove, reply: NormalMove | undefined, viewer: Color | null, mine: boolean,
  known: Evaluation | undefined): string {
  const lead = viewer === null ? "The better move was" : mine ? "Your better option was" : "Their better option was";
  const clause = stopsPawn(before, best, viewer) ?? whyMove(before, best, viewer).replace(/^it /, "");
  let also = whyBetter(before, after, best, reply, viewer).endsWith("It also stops the reply you just saw.") ? " It also stops the reply you just saw." : "";
  // (the only good move: the next best was much worse)
  if (known?.secondScore && winningChance(known.score, before.turn) - winningChance(known.secondScore, before.turn) >= 25) also += " It was the only good move here.";
  // (a clause that isn't a verb, like "it's checkmate", is said as it is)
  if (/^(it's|it is)/.test(clause)) return `${lead} there: ${clause}.${also}`;
  return `${lead} ${asGerund(clause)}.${also}`;
}

/** The better move in a sentence or two, straight in: what it does, and
 *  whether it takes away the reply your move allowed. (Not what your move
 *  cost: the Why pages have just shown that.) */
export function whyBetter(before: Chess, after: Chess, best: NormalMove, reply: NormalMove | undefined, viewer: Color | null): string {
  let text = ideaWords(before, best, viewer);
  if (reply && stopsReply(before, after, best, reply)) text += " It also stops the reply you just saw.";
  return text;
}

/** Taking back with the better piece, in words: "Your better option was taking
 *  back with the knight. It frees your bishop on c8, and your queen stays at
 *  home, where it can't be chased." */
export function recaptureWords(choice: NonNullable<ReturnType<typeof recaptureReason>>, mover: Color, viewer: Color | null): string {
  const mine = viewer === null || viewer === mover;
  const lead = viewer === null ? "The better move was" : mine ? "Your better option was" : "Their better option was";
  const your = viewer === null ? `${colourName(mover)}'s` : mine ? "your" : "their";
  const parts: string[] = [];
  if (choice.develops) parts.push("brings out a new piece");
  if (choice.frees) parts.push(`frees ${your} ${choice.frees.role} on ${makeSquare(choice.frees.square)}`);
  let why = parts.length ? `It ${parts.join(" and ")}` : "";
  if (choice.queenHome) why += why ? `, and ${your} queen stays at home, where it can't be chased` : `${cap(your)} queen stays at home, where it can't be chased`;
  return `${lead} taking back with the ${choice.role}. ${why}.`;
}


/** What the See the best move card opens with: taking back with the better
 *  piece, or the better move and why. */
export function bestMoveWords(before: Chess, played: NormalMove, best: NormalMove, known: Evaluation | undefined, viewer: Color | null): string {
  const mover = before.turn;
  const mine = viewer === null || mover === viewer;
  const choice = recaptureReason(before, played, best);
  return choice ? recaptureWords(choice, mover, viewer) : betterWords(before, positionAfter(before, played), best, undefined, viewer, mine, known);
}

/** Their answer to the move played (`reply`): after `best` instead, is it gone,
 *  or would it now lose them the piece that plays it? */
export function stopsReply(before: Chess, after: Chess, best: NormalMove, reply: NormalMove): boolean {
  const instead = positionAfter(before, best);
  const same = normalizeMove(instead, reply) as NormalMove;
  if (!instead.isLegal(same) || instead.board.get(same.to)?.role !== after.board.get(reply.to)?.role) return true;
  const then = positionAfter(instead, same);
  const piece = instead.board.get(same.from);
  const taken = instead.board.get(same.to);
  return !!piece && then.kingAttackers(same.to, opposite(instead.turn), then.board.occupied).nonEmpty() && VALUE[piece.role] > (taken ? VALUE[taken.role] : 0);
}

/** A good move with a better one, close enough not to be worth a card: the
 *  better move kept no more than 1% more of the winning chances. */
export function justAsGood(review: Review): boolean {
  return review.chanceBefore - review.chanceAfter <= 1;
}

/** What a move is for, in rough kinds: two moves of the same kind ("develops
 *  your bishop", "develops your knight") can't be told apart by what they do. */
function kindOf(clause: string): string {
  if (/checkmate/.test(clause)) return "mate";
  if (/wins |takes their|taking their/.test(clause)) return "material";
  if (/check/.test(clause)) return "check";
  if (/attacks|pressure/.test(clause)) return "attack";
  if (/develops|into the game|into play|better square|room/.test(clause)) return "development";
  if (/centre|space|key square|covers/.test(clause)) return "space";
  if (/chain/.test(clause)) return "pawns";
  return clause;
}

export interface BetterPage {
  text: string;
  show: "reply" | "best"; // the board: after your move and their answer, or after the better move
}

/** The See the best move card, for a good move that wasn't the best, in the
 *  way a coach compares them:
 *  - "allowed": what your move let them do (their answer, played on), then the
 *    better move, which takes that answer away;
 *  - "order": both moves do the same job, but the better one comes first (a
 *    new piece out while your king is still in the centre);
 *  - "reason": the better move does something yours doesn't, and yours did
 *    nothing that looks stronger;
 *  - "plain": no reason that holds up: it was just a little more accurate.
 *  Taking back with the better piece, or stopping their pawn, keeps its own words. */
export function betterCard(before: Chess, played: NormalMove, best: NormalMove, beforeEval: Evaluation | undefined,
  afterEval: Evaluation | undefined, viewer: Color | null): { tier: string; pages: BetterPage[] } {
  const mover = before.turn;
  const mine = viewer === null || mover === viewer;
  const after = positionAfter(before, played);
  const lead = viewer === null ? "The better move was" : mine ? "Your better option was" : "Their better option was";
  const you = viewer === null ? `${colourName(mover)}'s` : mine ? "your" : "their";
  const them = viewer === null ? `${colourName(opposite(mover))}'s` : mine ? "their" : "your";
  const only = beforeEval?.secondScore && winningChance(beforeEval.score, mover) - winningChance(beforeEval.secondScore, mover) >= 25 ? " It was the only good move here." : "";
  const plain = (text: string) => ({ tier: "plain", pages: [{ text: `${text}${only}`, show: "best" as const }] });
  const choice = recaptureReason(before, played, best);
  if (choice) return { tier: "recapture", pages: [{ text: recaptureWords(choice, mover, viewer), show: "best" }] };
  const stops = stopsPawn(before, best, viewer);
  if (stops) return { tier: "reason", pages: [{ text: `${lead} ${asGerund(stops)}.${only}`, show: "best" }] };
  const bestClause = whyMove(before, best, viewer).replace(/^it /, "");
  const playedClause = whyMove(before, played, viewer).replace(/^it /, "");
  const bestMove = movePhrase(before, best, you);
  const accurate = `${cap(bestMove)} was a little more accurate here.`;
  // what your move let them do, when the better move takes it away
  const reply = afterEval?.best;
  if (reply && !after.isEnd() && stopsReply(before, after, best, reply)) {
    const answered = positionAfter(after, reply);
    const check = answered.isCheck() ? ", with check" : "";
    const taker = after.board.get(reply.from)!;
    const victim = after.board.get(reply.to);
    const hits = targetsOf(answered, reply.to).filter((square) => answered.board.get(square)?.color === mover);
    const same = kindOf(bestClause) === kindOf(playedClause);
    const second = { text: `${cap(bestMove)} first takes that answer away${same ? "" : `, and it ${bestClause}`}.${only}`, show: "best" as const };
    const square = makeSquare(reply.to);
    // (taking back on the square you just took on: a trade, unless what you gave is worth more)
    const tookThere = played.to === reply.to && !!before.board.get(played.to);
    if (victim && tookThere) {
      const got = before.board.get(played.to)!;
      if (VALUE[victim.role] > VALUE[got.role]) {
        return { tier: "allowed", pages: [{ text: `That gives up ${you} ${victim.role} for ${them} ${got.role}: ${them} ${taker.role} takes back on ${square}${check}.`, show: "reply" }, second] };
      }
    } else if (victim && (playLine(before, `${makeUci(played)} ${afterEval!.line ?? ""}`, mover)?.net ?? 0) <= -1) {
      // (only when it stays lost: a piece taken and won back is part of a sequence, not a gift)
      return { tier: "allowed", pages: [{ text: `That lets ${them} ${taker.role} take ${you} ${victim.role === "pawn" ? `${square} pawn` : `${victim.role} on ${square}`}${check}.`, show: "reply" }, second] };
    } else if ((check || hits.length) && !after.isCheck()) {
      // (not the answer to your own check: that one is forced)
      const what = whyMove(after, reply, viewer).replace(/^it /, "").replace(/^gives check(, and | and |$)/, "");
      return { tier: "allowed", pages: [{ text: `That lets them answer with ${movePhrase(after, reply, them)}${check}${what ? `: it ${what}` : ""}.`, show: "reply" }, second] };
    }
  }
  const kind = kindOf(bestClause);
  if (kind === kindOf(playedClause)) {
    // the same job, in a better order: a new piece out first while the king is still in the centre
    const piece = before.board.get(best.from);
    const home = mover === "white" ? 0 : 7;
    const kingHome = before.board.kingOf(mover) === home * 8 + 4 && before.castles.castlingRights.intersect(before.board[mover]).nonEmpty();
    const newPiece = !!piece && ["knight", "bishop"].includes(piece.role) && best.from >> 3 === home;
    const movedPiece = before.board.get(played.from);
    const playedNew = !!movedPiece && ["knight", "bishop"].includes(movedPiece.role) && played.from >> 3 === home;
    const quiet = !before.board.get(best.to) && !before.board.get(played.to);
    if (kingHome && quiet && newPiece && !playedNew && movedPiece && movedPiece.role !== "king") {
      // (ready to castle: nothing left between the king and a rook on its side)
      const ready = positionAfter(before, best);
      const clear = (files: number[]) => files.every((file) => !ready.board.get(home * 8 + file));
      const castle = clear([5, 6]) || clear([1, 2, 3]);
      return { tier: "order", pages: [{ text: `${cap(you)} king is still in the centre, so ${bestMove} comes first: it ${castle ? "gets you ready to castle" : "brings a new piece out"}. ${cap(movePhrase(before, played, you))} can wait.${only}`, show: "best" }] };
    }
    return plain(accurate);
  }
  // the better move's point, unless yours looks the stronger of the two (winning something, a check),
  // or the point is only a pawn being eyed
  const strong = ["mate", "material", "check"];
  if (strong.includes(kindOf(playedClause)) && !strong.includes(kind) || kind === "attack" && /pawn$/.test(bestClause)) return plain(accurate);
  if (/^(it's|it is)/.test(bestClause)) return { tier: "reason", pages: [{ text: `${lead} there: ${bestClause}.${only}`, show: "best" }] };
  return { tier: "reason", pages: [{ text: `${lead} ${asGerund(bestClause)}.${only}`, show: "best" }] };
}
