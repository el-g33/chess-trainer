// Ratings and opening information

import { Chess } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { makeUci } from "chessops/util";

import { winPercent } from "../accuracy";
import { brilliantCandidates } from "../brilliant";
import { type Score, afterMove as positionAfter } from "../coach";
import { analyser, currentPly, evalOn, gameMoves, ratingsOn, reviewCache, shown } from "../main";
import { type OpeningInfo, isStartPosition } from "../openings";
import { type Review, addMisses, fenOf, isDrawnPosition, isSacrifice, reviewMove } from "../review";

import {
  analysis, book, deepMoves, deepNeeded, game, match, mode, openingCache, preview, set, showReply, viewPly,
} from "./state";

/** For each move: is it a book move, the opening name so far, and notes. */
export function openingInfo(): OpeningInfo[] {
  if (!book || mode !== "practice" || !isStartPosition(game.positionAt(0))) {
    return game.moves.map(() => ({ book: false, opening: null, notes: [] }));
  }
  // Only worked out again when the moves change
  const key = game.moves.map((m) => makeUci(m.move)).join(" ");
  if (openingCache.key !== key || openingCache.info.length !== game.length) {
    set.openingCache({ key, info: book.gameOpenings(Chess.default(), gameMoves()) });
  }
  return openingCache.info;
}

// Ratings this harsh get a second, longer look by Stockfish before they're final
export const HARSH = new Set(["Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"]);

// A drop in the mover's winning chance this big (lichess's measure) also gets the second look
export const BIG_DROP = 8;

export function rateMove(before: Chess, move: NormalMove): Review | undefined {
  const key = `${fenOf(before)} ${makeUci(move)}`;
  let review = reviewCache.get(key);
  if (!review) {
    review = reviewMove(before, move, analyser.evals, analyser.isPoisoned(before, move));
    if (!review) return undefined;
    const after = positionAfter(before, move);
    // (a move that ends the game needs no second look: the analyser skips those)
    const checked = (analyser.isDeep(before) && analyser.isDeep(after)) || after.isEnd() || isDrawnPosition(after);
    // a piece offered up may be a brilliant sacrifice the quick look misjudged
    const offered = isSacrifice(before, move, after);
    const suspicious = HARSH.has(review.rating) || bigDrop(before, after) || offered !== undefined;
    if (!suspicious || checked) reviewCache.set(key, review);
    else deepMoves.push({ before, move, after, offered });
  }
  return review;
}

/** Did the mover's winning chance drop sharply between these positions? */
export function bigDrop(before: Chess, after: Chess): boolean {
  const score = (position: Chess): Score | undefined => {
    if (position.isCheckmate()) return { mate: position.turn === "black" ? 1 : -1 };
    if (isDrawnPosition(position)) return { cp: 0 };
    return analyser.evals.get(fenOf(position))?.score;
  };
  const a = score(before);
  const b = score(after);
  if (!a || !b) return false;
  const sign = before.turn === "white" ? 1 : -1;
  const drop = sign * (winPercent(a) - winPercent(b));
  return drop >= BIG_DROP;
}

/** A rating for every move of the game (undefined while Stockfish hasn't
 *  finished, and when ratings are off). */
export function moveReviews(): (Review | undefined)[] {
  set.deepNeeded([]);
  set.deepMoves([]);
  if (!ratingsOn()) return game.moves.map(() => undefined);
  const rated = game.moves.map((played, i) => rateMove(game.positionAt(i), played.move));
  // A slip gets a deeper look at the move before it too: if that was really a
  // mistake, the slip is a Miss (the quick look can take a mistake for a small slip)
  // (the slip's own second look covers the position after that move)
  rated.forEach((review, i) => {
    if (i === 0 || !review || !HARSH.has(review.rating)) return;
    const before = game.positionAt(i - 1);
    if (analyser.isDeep(before)) return;
    reviewCache.delete(`${fenOf(before)} ${makeUci(game.moves[i - 1].move)}`); // rated again once it's in
    if (!deepNeeded.some((p) => fenOf(p) === fenOf(before))) deepNeeded.push(before);
  });
  const reviews = addMisses(rated);
  // A Miss is decided after the ratings, so make sure its positions get the second look too
  reviews.forEach((review, i) => {
    if (review?.rating === "Miss" && !(analyser.isDeep(game.positionAt(i)) && analyser.isDeep(game.positionAt(i + 1)))) {
      deepNeeded.push(game.positionAt(i), game.positionAt(i + 1));
    }
  });
  return reviews;
}

/** The rating of the last analysis move (undefined until Stockfish has looked). */
export function analysisReview(): Review | undefined {
  if (!analysis || !analysis.line.length) return undefined;
  const line = analysis.line;
  return rateMove(line.positionAt(line.length - 1), line.moves[line.length - 1].move);
}

/** Which move the review (and the rating icon) is about: normally the move on
 *  screen. In a match, while you're looking at the live game, it stays on YOUR
 *  last move until you click "See Stockfish's reply". */
export function reviewPly(): number {
  const current = currentPly();
  if (match && viewPly === null && !preview && !showReply) {
    for (let ply = current; ply > 0; ply--) if (game.moverOf(ply) === match.user) return ply;
  }
  return current;
}

/** Ask the background scorer for the positions that still need a score: the
 *  position on screen first (for the eval bar), then the analysis line, then
 *  every position of the game (so each move can be rated). */
export function requestEval() {
  const wanted: Chess[] = [];
  if (evalOn()) wanted.push(shown());
  if (ratingsOn()) {
    if (analysis) wanted.push(...Array.from({ length: analysis.line.length + 1 }, (_, i) => analysis!.line.positionAt(i)));
    const ply = reviewPly();
    if (ply > 0) wanted.push(game.positionAt(ply - 1), game.positionAt(ply));
    const all = Array.from({ length: game.length + 1 }, (_, i) => game.positionAt(i));
    wanted.push(...all);
    wanted.push(...brilliantCandidates(all.slice(0, -1), analyser.evals));
    analyser.requestDeep(deepNeeded);
    analyser.requestDeepMoves(deepMoves);
  }
  analyser.request(wanted);
}
