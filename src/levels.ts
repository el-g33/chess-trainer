// Practice match levels, the same as the desktop app (chess_trainer_app.py).
// skill: Stockfish "Skill Level" from 0 to 20; depth: how many moves deep it
// may look (undefined means no limit); seconds: how long it may think.

export interface Level {
  name: string;
  skill: number;
  depth?: number;
  seconds: number;
}

export const LEVELS: Level[] = [
  { name: "1 - Beginner", skill: 0, depth: 1, seconds: 0.05 },
  { name: "2 - Novice", skill: 2, depth: 2, seconds: 0.05 },
  { name: "3 - Casual", skill: 4, depth: 4, seconds: 0.1 },
  { name: "4 - Club player", skill: 7, depth: 6, seconds: 0.1 },
  { name: "5 - Strong club player", skill: 10, depth: 8, seconds: 0.2 },
  { name: "6 - Expert", skill: 13, depth: 12, seconds: 0.3 },
  { name: "7 - Master", skill: 17, depth: 16, seconds: 0.5 },
  { name: "8 - Maximum strength", skill: 20, depth: undefined, seconds: 1.0 },
];

export const DEFAULT_LEVEL = 2; // "3 - Casual" (counting from 0)

// Stockfish never replies faster than this, so its moves don't feel abrupt.
export const OPPONENT_MIN_DELAY = 0.6;

/** "Casual" from "3 - Casual" */
export function shortName(level: Level): string {
  return level.name.split(" - ").pop()!;
}
