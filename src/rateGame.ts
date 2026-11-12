// Rating a whole game without showing it: the way a review rates it (a quick
// look everywhere, then a second, longer look behind each harsh rating and
// each Miss), for checking many games in the background (the lesson plan's
// "Check my games") and for the batch tools.

import type { Chess } from "chessops/chess";
import type { NormalMove } from "chessops/types";

import { winPercent } from "./accuracy";
import type { Analyser } from "./analyser";
import { brilliantCandidates } from "./brilliant";
import type { Score } from "./coach";
import type { Game } from "./game";
import { type Review, addMisses, fenOf, isDrawnPosition, isSacrifice, reviewMove } from "./review";

const HARSH = new Set(["Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"]);
const BIG_DROP = 8;

/** Wait until Stockfish has finished all it was asked (or `stop` says to give up). */
export async function settle(analyser: Analyser, stop: () => boolean = () => false): Promise<boolean> {
  for (;;) {
    if (stop()) return false;
    const { done, total } = analyser.progress();
    if (done >= total) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Every move's rating, as a review would give it. `rounds` second looks at
 *  most (the batch tools use 4; a background check can use fewer). Undefined
 *  when stopped part-way. */
export async function rateGame(game: Game, analyser: Analyser, rounds = 4, stop: () => boolean = () => false): Promise<(Review | undefined)[] | undefined> {
  const all = Array.from({ length: game.length + 1 }, (_, i) => game.positionAt(i));
  analyser.request([...all, ...brilliantCandidates(all.slice(0, -1), analyser.evals)]);
  if (!(await settle(analyser, stop))) return undefined;
  let reviews: (Review | undefined)[] = [];
  for (let round = 0; round <= rounds; round++) {
    const deepMoves: { before: Chess; move: NormalMove; after: Chess; offered?: number }[] = [];
    const deepNeeded: Chess[] = [];
    const score = (position: Chess): Score | undefined =>
      position.isCheckmate() ? { mate: position.turn === "black" ? 1 : -1 } : isDrawnPosition(position) ? { cp: 0 } : analyser.evals.get(fenOf(position))?.score;
    const rated = game.moves.map((played, i) => {
      const before = all[i];
      const after = all[i + 1];
      const move = played.move as NormalMove;
      const review = reviewMove(before, move, analyser.evals, analyser.isPoisoned(before, move));
      if (!review) return undefined;
      const checked = (analyser.isDeep(before) && analyser.isDeep(after)) || after.isEnd() || isDrawnPosition(after);
      const offered = isSacrifice(before, move, after);
      const a = score(before);
      const b = score(after);
      const drop = a && b ? (before.turn === "white" ? 1 : -1) * (winPercent(a) - winPercent(b)) : 0;
      if ((HARSH.has(review.rating) || drop >= BIG_DROP || offered !== undefined) && !checked) deepMoves.push({ before, move, after, offered });
      if (HARSH.has(review.rating) && i > 0 && !analyser.isDeep(all[i - 1])) deepNeeded.push(all[i - 1]);
      return review;
    });
    reviews = addMisses(rated);
    reviews.forEach((review, i) => {
      if (review?.rating === "Miss" && !(analyser.isDeep(all[i]) && analyser.isDeep(all[i + 1]))) deepNeeded.push(all[i], all[i + 1]);
    });
    if (round === rounds || (!deepMoves.length && !deepNeeded.length)) break;
    analyser.requestDeepMoves(deepMoves);
    analyser.requestDeep(deepNeeded);
    if (!(await settle(analyser, stop))) return undefined;
  }
  return reviews;
}
