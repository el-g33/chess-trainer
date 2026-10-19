// Your position: the moves an opponent of a given strength would likely play.
// There's no lichess data by rating without a login, so the chances come from
// Stockfish's top moves: the bigger a move's loss, the less likely it is, and
// stronger players spread their choices less.

import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { NormalMove } from "chessops/types";
import type { CoachEngine } from "./strategy";
import { winningChance } from "./review";

export type Band = "beginner" | "club" | "advanced" | "expert" | "master";

export interface BandInfo {
  name: string;
  who: string; // "a club player"
  ratings: string;
  stockfish: string; // the practice match levels it's like
  spread: number; // how far (in winning chances) their choices stray from the best
  candidates: number; // how many of Stockfish's top moves they might pick from
}

export const BANDS: Record<Band, BandInfo> = {
  beginner: { name: "Beginner", who: "a beginner", ratings: "under 1200", stockfish: "Stockfish levels 1-2", spread: 12, candidates: 8 },
  club: { name: "Club", who: "a club player", ratings: "1200-1600", stockfish: "Stockfish levels 3-4", spread: 7, candidates: 6 },
  advanced: { name: "Advanced", who: "an advanced player", ratings: "1600-1900", stockfish: "Stockfish level 5", spread: 4.5, candidates: 5 },
  expert: { name: "Expert", who: "an expert", ratings: "1900-2200", stockfish: "Stockfish level 6", spread: 2.5, candidates: 5 },
  master: { name: "Master", who: "a master", ratings: "2200+", stockfish: "Stockfish level 7", spread: 1.2, candidates: 4 },
};

export interface LikelyMove {
  move: NormalMove;
  san: string;
  weight: number; // 0-1, all candidates together make 1
  chance: number; // the weight as a rounded percentage, for showing
}

const THINK_SECONDS = 0.8;

/** The moves a player of this band would likely choose here, most likely first. */
export async function likelyMoves(engine: CoachEngine, position: Chess, band: Band): Promise<LikelyMove[]> {
  // (Stockfish can report the same move on two lines: keep its first, best one)
  const seen = new Set<string>();
  const lines = (await engine.analyse(position, THINK_SECONDS, BANDS[band].candidates)).filter((line) => {
    const first = line.pv[0];
    if (!first) return false;
    const key = `${first.from}-${first.to}-${first.promotion ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!lines.length) return [];
  const mover = position.turn;
  const chances = lines.map((line) => winningChance(line.score, mover));
  const best = Math.max(...chances);
  const raw = chances.map((c) => Math.exp(-(best - c) / BANDS[band].spread));
  const total = raw.reduce((a, b) => a + b, 0);
  return lines
    .map((line, i) => {
      const weight = raw[i] / total;
      return { move: line.pv[0], san: makeSan(position, line.pv[0]), weight, chance: Math.round((weight * 100) / 5) * 5 };
    })
    .sort((a, b) => b.weight - a.weight);
}

/** One of the likely moves, picked at random by how likely it is. */
export function pickLikely(moves: LikelyMove[]): LikelyMove | undefined {
  let roll = Math.random();
  for (const move of moves) {
    roll -= move.weight;
    if (roll <= 0) return move;
  }
  return moves[0];
}
