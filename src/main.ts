// The Chess Trainer page, following the desktop app (chess_trainer_app.py):
//   Play mode     - just chess against Stockfish, then "Review this game"
//   Practice mode - eval bar, live move ratings, opening coaching, Undo, FEN
//                   positions, a free board, "what if" analysis moves and the
//                   strategy coach (threat check, plan ahead, quiz, ideas)
// This file holds the board, the shared types and the start-up; each part of
// the page is a module in src/app (the shared state is src/app/state.ts).
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { DrawShape } from "@lichess-org/chessground/draw";
import { Chess, normalizeMove } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import "@fontsource/permanent-marker/latin-400.css";
import {
  coachEngine, mode, game, match, viewPly, analysis, preview, clock, clockTimes, demo, reviewing, quiz, puzzle,
  explore, editor, drill, stepper, checkingUpdates, set,
} from "./app/state";
import "@lichess-org/chessground/assets/chessground.base.css";
import "./style.css";
import "./themes.css";
import "./layout.css";
import { Analyser, lineMove, lineScore } from "./analyser";
import { afterMove as positionAfter, standardUci } from "./coach";
import { Engine } from "./engine";
import { Game } from "./game";
import { OpeningBook, type Opening, type OpeningEngine } from "./openings";
import { loadPieces } from "./pieces";
import type { Brilliant } from "./brilliant";
import type { Score } from "./coach";
import type { GuessExplanation } from "./quizExplain";
import { DEMOS, demoSteps, type Demo, type DemoStep } from "./demos";
import { whatYouGet } from "./outlook";
import { fenOf, type Review } from "./review";
import type { CoachEngine, Plan, Threat } from "./strategy";
import { $, arrowStyleBox, engineStatus, evalCheck, rateMovesBox } from "./app/dom";
import { message } from "./app/popups";
import { showTour } from "./app/featureTour";
import { gameScores } from "./app/playerBars";
import { answerQuiz, startTask } from "./app/strategyCoach";
import { startDemo, startDrill } from "./app/openingDemos";
import { editorTap, startEditor, startLesson, startPuzzles } from "./app/train";
import { refresh } from "./app/draw";
import { installed } from "./app/coach";
import { buildMenu, showMenu } from "./app/startMenu";
import { onBoardMove, onUndo } from "./app/moves";
import { wireButtons } from "./app/buttons";
import { setupWhatsNew } from "./app/whatsNewCard";

// The styles are in (imports run first), so the page can show; the theme's
// stand-in background (see index.html) gives way to the real one
document.documentElement.classList.add("styled");
document.documentElement.style.background = "";

// Opening choices in the start menu (the openings themselves are in openings.ts)
export const STOCKFISH_DECIDES = "None (plays normally for its level)";
export const NO_OPENING = "None";
declare const __BUILD__: string; // the commit and day this was built (see vite.config.ts)
export const SUGGESTED = "Suggested for this level";

// Arrow colours (as the desktop app)
export const YOUR_ARROW = "#2E7D32"; // your moves in Stockfish's line
export const OPPONENT_ARROW = "#C62828"; // your opponent's moves in the line
export const THREAT_ARROW = "#E67E22"; // your opponent's threat (dashed)
export const GUESS_ARROW = "#1565C0"; // your quiz guess
export const DEVIATE_ARROW = "#C9A227"; // leaving your opening plan
export const BRILLIANT_ARROW = "#7C4DFF"; // the masterstroke, once shown
const BEST_ARROW = "#5E6B73"; // Stockfish's own choice where your opening plan differs (dashed)
export const ARROWS_AT_ONCE = 4; // how many moves of Stockfish's line are drawn at a time

export const HINT_TEXT =
  "Strategy coach\n" +
  "Nothing is shown until you ask, so you can do your own thinking first.\n\n" +
  "• What's the threat? - what your opponent wants to do next.\n" +
  "• Plan ahead - Stockfish's next few moves for both sides, drawn as numbered arrows you can step through.\n" +
  "• Spot their idea - a quiz: guess your opponent's threat before you see it.\n" +
  "• Explain the ideas - the tactics (forks, pins, attacks), targets and weaknesses hidden in Stockfish's line, for both sides.\n\n" +
  'Tip: in a practice match, try the quiz before each of your moves. It trains the habit of asking "what does my opponent want?"';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Mode = "play" | "practice";

export interface Match {
  id: number;
  user: Color; // the side you play
  level: number; // index into LEVELS
  sfOpening: Opening | null; // the opening Stockfish plays
  sfActive: boolean; // ...still following it
  sfMisses: number; // times in a row it had to leave its plan
  myOpening: Opening | null; // the opening you practise
  myActive: boolean;
}

/** "What if" moves from a position of the game: the game itself never changes. */
export interface Analysis {
  fromPly: number;
  line: Game; // starts at the game position, holds the analysis moves
  ahead: NormalMove[]; // moves stepped back over (forward replays them)
}

export interface Insight {
  brilliant?: Brilliant;
  threat?: Threat;
  plan?: Plan;
  ideas?: string;
}

export interface Quiz {
  fen: string;
  threat?: Threat;
  answered: boolean;
  guess?: NormalMove;
  result?: [boolean, string];
  explanation?: GuessExplanation; // for a wrong guess: what would really happen
  explaining?: boolean;
  lineStep?: number; // stepping through the guess played out (0 = not)
}

// Three separate copies of Stockfish, so they never get in each other's way:
// one to play against you, one for the eval bar and move ratings (in the
// Analyser), and one for the strategy coach (started when first needed).
export const engine = new Engine();

// An opening demo: Stockfish plays a line, pausing at the notes
export interface DemoState {
  demo: Demo;
  line: number;
  steps: DemoStep[];
  playing: boolean;
  interrupted: boolean; // stopped by you (Back/Next), not by a note
  intro: boolean; // before play: the finished setup on the board, the coach introduces it
  timer?: number;
}

// Strategy coach
export const insights = new Map<string, Insight>(); // keyed by position
export const quizScore = [0, 0]; // [right, asked]
export const brilliantShown = new Set<string>(); // positions where you asked to see the brilliant move

// Ratings and the eval bar
export const reviewCache = new Map<string, Review>(); // finished ratings never change
export const analyser = new Analyser(() => refresh());

// Openings: the database loads in the background
export const bookReady = OpeningBook.load().then(
  (loaded) => {
    set.book(loaded);
    refresh();
  },
  (error) => void message("Openings", `The opening database couldn't be loaded: ${error}`),
);

// Stockfish (the opponent's copy, at full strength) for choosing opening moves
export const openingEngine: OpeningEngine = {
  async lines(position, seconds, count) {
    const lines = await engine.analyse(fenOf(position), seconds * 1000, count);
    return lines.map((line) => ({ move: lineMove(position, line), score: lineScore(position, line) }));
  },
  async moveScore(position, move, seconds) {
    const [line] = await engine.analyse(fenOf(position), seconds * 1000, 1, [standardUci(position, move)]);
    return lineScore(position, line);
  },
};

// The coach's Stockfish: lines turned into chessops moves
export const coachAnalysis: CoachEngine = {
  async analyse(position, seconds, lines = 1) {
    const engine = coachEngine ?? set.coachEngine(new Engine())!;
    const found = await engine.analyse(fenOf(position), seconds * 1000, lines);
    return found.map((line) => {
      let walk = position;
      const pv: NormalMove[] = [];
      for (const uci of line.pv) {
        const parsed = parseUci(uci);
        if (!parsed || !("from" in parsed)) break;
        const move = normalizeMove(walk, parsed) as NormalMove;
        if (!walk.isLegal(move)) break;
        pv.push(move);
        walk = positionAfter(walk, move);
      }
      return { score: lineScore(position, line), pv };
    });
  },
  async moveScore(position, move, seconds) {
    const engine = coachEngine ?? set.coachEngine(new Engine())!;
    const [line] = await engine.analyse(fenOf(position), seconds * 1000, 1, [standardUci(position, move)]);
    return lineScore(position, line);
  },
};

/** The coach's best line starting with one of these moves (all moves if none given). */
export async function coachLine(position: Chess, seconds: number, first: NormalMove[] = []): Promise<{ score: Score; pv: NormalMove[] } | undefined> {
  const engine = coachEngine ?? set.coachEngine(new Engine())!;
  const [line] = await engine.analyse(fenOf(position), seconds * 1000, 1, first.map((m) => standardUci(position, m)));
  if (!line) return undefined;
  let walk = position;
  const pv: NormalMove[] = [];
  for (const uci of line.pv) {
    const parsed = parseUci(uci);
    if (!parsed || !("from" in parsed)) break;
    const move = normalizeMove(walk, parsed) as NormalMove;
    if (!walk.isLegal(move)) break;
    pv.push(move);
    walk = positionAfter(walk, move);
  }
  return { score: lineScore(position, line), pv };
}

export const ground: Api = Chessground($("board"), {
  coordinates: true,
  animation: { enabled: true, duration: 220 },
  highlight: { lastMove: true, check: true },
  premovable: { enabled: false },
  draggable: { showGhost: true },
  drawable: { enabled: false }, // arrows come from the coach, not from right-dragging
  // movable.events.after fires only for moves you make on the board
  movable: { free: false, showDests: true, events: { after: (from, to) => onBoardMove(from, to) } },
});
// The coach's arrow colours, next to the board's own
// Chessground remembers where the board is on the page. When the layout moves
// the board (a card opens or closes, the editor goes away) without a resize or
// scroll, that memory goes stale and touches land on the wrong squares - so
// forget it at the start of every touch or click, before chessground reads it.
for (const kind of ["mousedown", "touchstart"]) {
  $("board").addEventListener(kind, () => ground.state.dom.bounds.clear(), { capture: true, passive: true });
}

/** Arrow style: standard colours, or colour-blind friendly - blue for your
 *  ideas, dashed orange with a "!" for their threats (the shape says it too). */
const CB_YOURS = "#1F5FA8";
const CB_THEIRS = "#B26B00";

export function applyArrowStyle() {
  const blind = arrowStyleBox.value === "colourblind";
  document.body.classList.toggle("cb-arrows", blind);
  const brushes = ground.state.drawable.brushes;
  brushes.you.color = blind ? CB_YOURS : YOUR_ARROW;
  brushes.control.color = blind ? CB_YOURS : YOUR_ARROW;
  brushes.them.color = blind ? CB_THEIRS : OPPONENT_ARROW;
  brushes.controlThem.color = blind ? CB_THEIRS : OPPONENT_ARROW;
}

/** Colour-blind friendly: a "!" on the square a threat arrow points at. */
export function markThreats(shapes: DrawShape[]): DrawShape[] {
  if (arrowStyleBox.value !== "colourblind") return shapes;
  const marks: DrawShape[] = shapes
    .filter((s) => s.dest && (s.brush === "them" || s.brush === "threat"))
    .map((s) => ({
      orig: s.dest!,
      customSvg: { html: `<circle cx="80" cy="20" r="15" fill="${CB_THEIRS}"/><text x="80" y="27" text-anchor="middle" font-size="22" font-weight="700" fill="#fff">!</text>` },
    }));
  return [...shapes, ...marks];
}

/** Knight moves drawn as an L - two squares, then one, the way the knight goes -
 *  instead of a straight line (the board draws only straight arrows, so these
 *  are drawn as a shape of their own, in the arrow's colour). */
export function bendKnightArrows(shapes: DrawShape[]): DrawShape[] {
  return shapes.map((shape) => {
    const brush = shape.brush ? ground.state.drawable.brushes[shape.brush] : undefined;
    if (!shape.dest || !brush || shape.customSvg) return shape;
    const dx = shape.dest.charCodeAt(0) - shape.orig.charCodeAt(0);
    const dy = Number(shape.dest[1]) - Number(shape.orig[1]);
    if (!((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return shape;
    // In the shape's own units: a square is 100, x to the right and y down as seen
    const flip = ground.state.orientation === "white" ? 1 : -1;
    const [ex, ey] = [dx * 100 * flip, -dy * 100 * flip];
    const corner: [number, number] = Math.abs(dx) === 2 ? [ex, 0] : [0, ey];
    const width = ((brush.lineWidth || 10) / 64) * 100;
    // As the board's own arrows: the tip stops short of the square's middle, and the head is 3 widths long
    const [ux, uy] = [Math.sign(ex - corner[0]), Math.sign(ey - corner[1])];
    const tip: [number, number] = [ex - ux * (15.6 - 0.95 * width), ey - uy * (15.6 - 0.95 * width)];
    const base: [number, number] = [tip[0] - ux * 3 * width, tip[1] - uy * 3 * width];
    const side: [number, number] = [-uy * 2 * width, ux * 2 * width];
    const dashed = brush.color === THREAT_ARROW || brush.color === CB_THEIRS ? ' stroke-dasharray="18 11"'
      : brush.color === BEST_ARROW ? ' stroke-dasharray="14 10"' : "";
    // The shape's (0, 0) is the knight's square's top-left corner: move to its middle
    const html =
      // as see-through as the board's own arrows (their layer is drawn at 60%)
      `<g transform="translate(50 50)" opacity="${(brush.opacity * 0.6).toFixed(2)}"><path d="M0 0 L${corner[0]} ${corner[1]} L${base[0] + ux} ${base[1] + uy}" ` +
      `fill="none" stroke="${brush.color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed}/>` +
      `<path d="M${tip[0]} ${tip[1]} L${base[0] + side[0]} ${base[1] + side[1]} L${base[0] - side[0]} ${base[1] - side[1]} Z" fill="${brush.color}"/></g>` +
      `<g transform="translate(50 50)">` +
      // a numbered arrow (a line of moves): its number on the bend, as the board draws them
      (shape.label
        ? `<circle cx="${corner[0]}" cy="${corner[1]}" r="20" fill="${shape.label.fill ?? brush.color}" fill-opacity="0.9" stroke="#fff" stroke-width="3"/>` +
          `<text x="${corner[0]}" y="${corner[1] + 10}" font-size="${30 * 0.75 ** shape.label.text.length + 6}" font-family="Noto Sans, sans-serif" text-anchor="middle" fill="#fff">${shape.label.text}</text>`
        : "") +
      "</g>";
    return { orig: shape.orig, customSvg: { html } };
  });
}

Object.assign(ground.state.drawable.brushes, {
  you: { key: "you", color: YOUR_ARROW, opacity: 0.85, lineWidth: 10 },
  them: { key: "them", color: OPPONENT_ARROW, opacity: 0.85, lineWidth: 10 },
  threat: { key: "threat", color: THREAT_ARROW, opacity: 0.9, lineWidth: 10 },
  guess: { key: "guess", color: GUESS_ARROW, opacity: 0.85, lineWidth: 10 },
  deviate: { key: "deviate", color: DEVIATE_ARROW, opacity: 0.9, lineWidth: 10 },
  best: { key: "best", color: BEST_ARROW, opacity: 0.55, lineWidth: 7 },
  brilliant: { key: "brilliant", color: BRILLIANT_ARROW, opacity: 0.9, lineWidth: 10 },
  control: { key: "control", color: YOUR_ARROW, opacity: 0.4, lineWidth: 6 },
  controlThem: { key: "controlThem", color: OPPONENT_ARROW, opacity: 0.4, lineWidth: 6 },
});

// ---------------------------------------------------------------------------
// What's on screen
// ---------------------------------------------------------------------------

export const ratingsOn = () => mode === "practice" && rateMovesBox.checked;
export const evalOn = () => mode === "practice" && evalCheck.checked && !editor;
export const currentPly = () => viewPly ?? game.length;
export const gameMoves = () => game.moves.map((m) => m.move);

/** The real position being looked at (in analysis, the "what if" position). */
export function base(): Chess {
  return analysis ? analysis.line.position : game.positionAt(currentPly());
}

/** What the board draws: a position of Stockfish's line during a preview. */
export function shown(): Chess {
  if (editor) {
    // the setup may not be legal yet (no kings...), but it still has to be drawn
    const drawn = Chess.default();
    drawn.board = editor.board.clone();
    drawn.turn = editor.turn;
    return drawn;
  }
  if (stepper?.frames) return stepper.frames[stepper.step - 1].position;
  if (stepper) return stepper.positions[stepper.step];
  const line = quizLinePositions();
  if (line && quiz?.lineStep) return line[quiz.lineStep];
  const plan = previewPlan();
  return plan && preview ? plan.positions[preview.step] : base();
}

/** The positions along a wrong guess played out (your move skipped, their guess, your answer...). */
export function quizLinePositions(): Chess[] | undefined {
  const explanation = quiz?.explanation;
  if (!explanation) return undefined;
  const positions = [explanation.start];
  for (const move of explanation.line) positions.push(positionAfter(positions[positions.length - 1], move));
  return positions;
}

export function previewPlan(): Plan | undefined {
  return preview ? insights.get(preview.baseFen)?.plan : undefined;
}

/** Would a move on the board be a "what if" move rather than a real one? Yes
 *  in Practice mode when looking back, when reviewing a finished game, or once
 *  analysis has started. */
export function analysing(): boolean {
  return mode === "practice" && (analysis !== null || viewPly !== null || (reviewing && match === null));
}

/** An empty board to explore, where you move both sides (not a loaded game). */
export function freeBoard(): boolean {
  return mode === "practice" && match === null && !reviewing && !explore && !editor && !puzzle && !demo && !drill;
}

/** True while a quiz question is on screen and not yet answered. */
export function quizWaiting(): boolean {
  return !!(quiz && quiz.threat && !quiz.answered);
}

/** Keep the preview and quiz only while their position is on screen. */
export function tidyState() {
  if (viewPly !== null && viewPly >= game.length) set.viewPly(null);
  const fen = fenOf(base());
  if (preview && preview.baseFen !== fen) set.preview(null);
  if (quiz && quiz.fen !== fen) set.quiz(null);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// For testing in development only (not in the published site)
if (import.meta.env.DEV) {
  (window as unknown as { trainer: unknown }).trainer = {
    analyser, ground, bendKnightArrows, game: () => game, gameScores, answerQuiz, startTask, quiz: () => quiz, parseUci, normalizeMove, base,
    boardMove: onBoardMove, clock: () => clock, clockTimes: () => clockTimes, onUndo,
    demo: () => demo, startDemo, DEMOS, demoSteps, showTour, drill: () => drill, startDrill,
    puzzle: () => puzzle, editor: () => editor, startPuzzles, startEditor, startLesson, editorTap,
    outlook: (fen: string, you: Color) => whatYouGet(coachAnalysis, new Game(fen).position, you),
  };
}

buildMenu();
wireButtons();
refresh();
showMenu();
setupWhatsNew(); // after an update: what's new
void loadPieces().then(refresh);
// The built site keeps a copy of itself, so it works offline (see vite.config.ts).
// A new version downloads in the background; when it's in, a notice offers to restart into it.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const updating = navigator.serviceWorker.controller !== null; // (the very first copy isn't an update)
  navigator.serviceWorker.register("./sw.js").then((registration) => {
    registration.addEventListener("updatefound", () => {
      const incoming = registration.installing;
      if (!updating || !incoming) return;
      void installed(incoming).then((ok) => {
        if (ok && !checkingUpdates) $("update-toast").hidden = false;
      });
    });
  }).catch(() => {
    // not possible here (e.g. not https): the site still works online
  });
}
// Load the marker font now, so the first ?! mark doesn't appear in a plain font
void document.fonts?.load('bold 20px "Permanent Marker"').catch(() => {});
engine.ready.then(
  () => {
    engineStatus.textContent = "";
    engineStatus.hidden = true;
  },
  () => (engineStatus.textContent = "Stockfish couldn't start in this browser."),
);
