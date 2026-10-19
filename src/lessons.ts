// Lessons on middlegame and endgame principles: each is a few short steps,
// a position with arrows and highlighted squares, and a sentence or two.
// Every position is checked with Stockfish before it goes in (see
// tests/lessons in the scratchpad notes). "themes" picks the "Try it"
// puzzles from public/puzzles/<phase>.json.

export interface LessonStep {
  fen: string;
  text: string;
  arrows?: [from: string, to: string, kind?: "good" | "bad" | "plan"][];
  squares?: [square: string, kind?: "good" | "bad" | "plan"][];
}

export interface Lesson {
  title: string;
  summary: string;
  themes: string[]; // lichess puzzle themes for "Try it"
  steps: LessonStep[];
}

export type TrainPhase = "middlegame" | "endgame";

export const LESSONS: Record<TrainPhase, Lesson[]> = {
  middlegame: [],
  endgame: [],
};
