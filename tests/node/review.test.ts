// Move ratings: every move of the recorded games (tests/review-cases.json,
// with Stockfish's results stored) rated by src/review.ts, compared with the
// known-good ratings and texts in tests/golden/review.json.
import { readFile, writeFile } from "node:fs/promises";

import { normalizeMove } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import type { Score } from "../../src/coach";
import { Game } from "../../src/game";
import { addMisses, reviewMove, type Evaluation } from "../../src/review";
import cases from "../review-cases.json";

interface CaseEval {
  score: Score;
  best?: string;
  second?: string;
  secondScore?: Score;
}

const GOLDEN = new URL("../golden/review.json", import.meta.url);

export default async function run({ update }: { update: boolean }) {
  const now: string[][] = [];
  for (const data of cases.games) {
    const game = new Game();
    for (const uci of data.moves) game.play(parseUci(uci) as NormalMove);
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
    now.push(reviews.map((r, i) => `${game.moves[i].san}: ${r ? `[${r.rating}] ${r.text}` : "none"}`));
  }
  if (update) await writeFile(GOLDEN, JSON.stringify(now, null, 1));
  const golden: string[][] = JSON.parse(await readFile(GOLDEN, "utf-8"));
  const failures: string[] = [];
  let checks = 0;
  now.forEach((moves, g) => moves.forEach((line, m) => {
    checks++;
    const want = golden[g]?.[m];
    if (line !== want) failures.push(`Game ${g + 1}, move ${m + 1}:\nWANT: ${want}\nGOT:  ${line}`);
  }));
  return { name: "Move ratings (known-good)", checks, failures };
}
