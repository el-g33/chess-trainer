// Rates the moves in review-cases.json (made by make_review_cases.py) with
// the web version's review.ts and compares every rating and text with what
// the desktop app's move_review.py said. Open http://localhost:5173/tests/
import { normalizeMove } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import type { Score } from "../src/coach";
import { Game } from "../src/game";
import { addMisses, reviewMove, type Evaluation } from "../src/review";
import cases from "./review-cases.json";

interface CaseEval {
  score: Score;
  best?: string;
  second?: string;
  secondScore?: Score;
}

const summary = document.getElementById("summary")!;
const details = document.getElementById("details")!;
let checked = 0;
const failures: string[] = [];

for (const [gameIndex, data] of cases.games.entries()) {
  const game = new Game();
  // Each move in UCI, normalized for chessops (castling e1g1 -> e1h1)
  for (const uci of data.moves) game.play(parseUci(uci) as NormalMove);

  // Stockfish's results with the moves turned into chessops moves
  const evals = new Map<string, Evaluation>();
  for (let ply = 0; ply <= game.length; ply++) {
    const position = game.positionAt(ply);
    const fen = game.fenAt(ply);
    const raw = (cases.evals as Record<string, CaseEval>)[fen];
    if (!raw) continue;
    const move = (uci?: string) => (uci ? (normalizeMove(position, parseUci(uci)!) as NormalMove) : undefined);
    evals.set(fen, { score: raw.score, best: move(raw.best), second: move(raw.second), secondScore: raw.secondScore });
  }

  const reviews = addMisses(game.moves.map((played, i) => reviewMove(game.positionAt(i), played.move, evals)));
  reviews.forEach((web, i) => {
    const desktop = data.reviews[i];
    checked++;
    const same =
      (web === undefined && desktop === null) ||
      (web !== undefined && desktop !== null && web.rating === desktop.rating && web.symbol === desktop.symbol && web.text === desktop.text);
    if (!same) {
      failures.push(
        `Game ${gameIndex + 1}, move ${i + 1} (${game.moves[i].san}):\n` +
          `DESKTOP: ${desktop ? `[${desktop.rating}] ${desktop.text}` : "none"}\n` +
          `WEB:     ${web ? `[${web.rating}] ${web.text}` : "none"}`,
      );
    }
  });
}

summary.textContent = `${checked} moves checked, ${checked - failures.length} identical, ${failures.length} different.`;
for (const failure of failures.slice(0, 40)) {
  const pre = document.createElement("pre");
  pre.textContent = failure;
  details.append(pre);
}
(window as unknown as { reviewCheck: unknown }).reviewCheck = { checked, failures };
