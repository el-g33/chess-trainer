// The Chess Trainer page, following the desktop app (chess_trainer_app.py):
//   Play mode     - just chess against Stockfish, then "Review this game"
//   Practice mode - eval bar, live move ratings, opening coaching, Undo, FEN
//                   positions, a free board, "what if" analysis moves and the
//                   strategy coach (threat check, plan ahead, quiz, ideas)
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess, normalizeMove } from "chessops/chess";
import { chessgroundDests } from "chessops/compat";
import { parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare, makeUci, opposite, parseSquare, parseUci } from "chessops/util";

import "@fontsource/permanent-marker/latin-400.css";
import "@lichess-org/chessground/assets/chessground.base.css";
import "./style.css";
import { Analyser, lineMove, lineScore } from "./analyser";
import { badgeSvg } from "./badge";
import { afterMove as positionAfter, colourName, isCastling, standardUci, variationSan } from "./coach";
import { Engine } from "./engine";
import { Game, type Outcome } from "./game";
import { explainIdeas } from "./ideas";
import { middlegameNotes } from "./middlegame";
import { DEFAULT_LEVEL, LEVELS, OPPONENT_MIN_DELAY, shortName } from "./levels";
import {
  OpeningBook,
  REPERTOIRE,
  chooseOpeningMove,
  coachOpeningMove,
  firstMoveOf,
  goalWords,
  isStartPosition,
  mainFamily,
  menuName,
  setupProgress,
  suggestedFor,
  systemFor,
  type Opening,
  type OpeningEngine,
  type OpeningInfo,
} from "./openings";
import { openingPlanAhead, reviewOpeningChoice, type OpeningPlan, type PlanMode } from "./openingPlan";
import { FALL_ANGLES, fallenKing, loadPieces } from "./pieces";
import { play, setSound, soundForMove, unlockSounds } from "./sounds";
import { brilliantCandidates, findBrilliant, missedBrilliant, type Brilliant } from "./brilliant";
import { readPgn, saveFile, today, writePgn, type Headers, type PgnGame } from "./pgn";
import { addMisses, fenOf, formatScore, isDrawnPosition, reviewMove, type Review } from "./review";
import { gradeGuess, planAhead, threatCheck, type CoachEngine, type Plan, type Threat } from "./strategy";

// Opening choices in the start menu (the openings themselves are in openings.ts)
const STOCKFISH_DECIDES = "None (plays normally for its level)";
const NO_OPENING = "None";
const SUGGESTED = "Suggested for this level";

// Arrow colours (as the desktop app)
const YOUR_ARROW = "#2E7D32"; // your moves in Stockfish's line
const OPPONENT_ARROW = "#C62828"; // your opponent's moves in the line
const THREAT_ARROW = "#E67E22"; // your opponent's threat (dashed)
const GUESS_ARROW = "#1565C0"; // your quiz guess
const DEVIATE_ARROW = "#C9A227"; // leaving your opening plan
const BRILLIANT_ARROW = "#26C2A3"; // the brilliant move, once shown
const BEST_ARROW = "#5E6B73"; // Stockfish's own choice where your opening plan differs (dashed)
const ARROWS_AT_ONCE = 4; // how many moves of Stockfish's line are drawn at a time

const HINT_TEXT =
  "Strategy coach\n" +
  "Nothing is shown until you ask, so you can do your own thinking first.\n\n" +
  "• What's the threat? - what your opponent wants to do next.\n" +
  "• Plan ahead - Stockfish's next few moves for both sides, drawn as numbered arrows you can step through.\n" +
  "• Spot their idea - a quiz: guess your opponent's threat before you see it.\n" +
  "• Explain the ideas - the tactics (forks, pins, attacks), targets and weaknesses hidden in Stockfish's line, for both sides.\n\n" +
  'Tip: in a practice match, try the quiz before each of your moves. It trains the habit of asking "what does my opponent want?"';

// ---------------------------------------------------------------------------
// Page elements
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const menu = $("menu");
const menuCard = $<HTMLFormElement>("menu-card");
const opponentBox = $<HTMLSelectElement>("opponent");
const levelBox = $<HTMLSelectElement>("level");
const colourBox = $<HTMLSelectElement>("colour");
const sfOpeningBox = $<HTMLSelectElement>("sf-opening");
const myOpeningBox = $<HTMLSelectElement>("my-opening");
const startButton = $<HTMLButtonElement>("start");
const engineStatus = $("engine-status");
const backButton = $<HTMLButtonElement>("back-to-game");
const moveList = $("move-list");
const viewLabel = $("view-label");
const openingLabel = $("opening-label");
const repertoireLabel = $("repertoire-label");
const turnLabel = $("turn");
const gameInfo = $("game-info");
const resignButton = $<HTMLButtonElement>("resign");
const reviewButton = $<HTMLButtonElement>("review-game");
const exitAnalysisButton = $<HTMLButtonElement>("exit-analysis");
const reviewArea = $("review-area");
const reviewBox = $("review");
const reviewProgress = $("review-progress");
const rateMovesBox = $<HTMLInputElement>("rate-moves");
const replyButton = $<HTMLButtonElement>("reply-button");
const modeTitle = $("mode-title");
const evalBar = $("eval-bar");
const evalCheck = $<HTMLInputElement>("eval-check");
const coachPanel = $("coach");
const coachText = $("coach-text");
const coachStatus = $("coach-status");
const quizScoreLabel = $("quiz-score");
const toolButtons = {
  threat: $<HTMLButtonElement>("threat-button"),
  plan: $<HTMLButtonElement>("plan-button"),
  quiz: $<HTMLButtonElement>("quiz-button"),
  ideas: $<HTMLButtonElement>("ideas-button"),
  brilliant: $<HTMLButtonElement>("brilliant-button"),
};
const lineBack = $<HTMLButtonElement>("line-back");
const lineForward = $<HTMLButtonElement>("line-forward");
const lineExit = $<HTMLButtonElement>("line-exit");
const undoButton = $<HTMLButtonElement>("undo");
const newButton = $<HTMLButtonElement>("new-game");
const fenRow = $<HTMLFormElement>("fen-row");
const fenInput = $<HTMLInputElement>("fen");
const loadButton = $<HTMLButtonElement>("load-fen");
const themeBox = $<HTMLSelectElement>("board-theme");
const soundOn = $<HTMLInputElement>("sound-on");
const soundVolume = $<HTMLInputElement>("sound-volume");
const planModeBox = $<HTMLSelectElement>("plan-mode");
const planModeRow = $("plan-mode-row");
// « ‹ › » - above the move list, and (on phones) right under the board
const navButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-nav]")];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Mode = "play" | "practice";

interface Match {
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
interface Analysis {
  fromPly: number;
  line: Game; // starts at the game position, holds the analysis moves
}

interface Insight {
  brilliant?: Brilliant;
  threat?: Threat;
  plan?: Plan;
  ideas?: string;
}

interface Quiz {
  fen: string;
  threat?: Threat;
  answered: boolean;
  guess?: NormalMove;
  result?: [boolean, string];
}

// Three separate copies of Stockfish, so they never get in each other's way:
// one to play against you, one for the eval bar and move ratings (in the
// Analyser), and one for the strategy coach (started when first needed).
const engine = new Engine();
let coachEngine: Engine | null = null;

let mode: Mode = "practice";
let game = new Game();
let match: Match | null = null; // the game against Stockfish, while it goes on
let matchCounter = 0;
let viewPly: number | null = null; // looking back at this move; null = the live position
let analysis: Analysis | null = null;
let preview: { baseFen: string; step: number } | null = null; // stepping through Stockfish's line
let orientation: Color = "white";
let thinking = false; // Stockfish is choosing its move
let result = ""; // how the last match ended, e.g. "You resigned - Stockfish wins"
let menuOpen = true;
let canReview = false; // a finished Play game can be reviewed in Practice mode
let reviewing = false; // reviewing a Play game in Practice mode
let reviewTitle = ""; // for a game opened from PGN, e.g. "Reviewing: Carlsen - Nakamura (1-0)"
let showReply = false; // in a match, the review shows Stockfish's reply instead of your move
let plyNotes = new Map<number, string[]>(); // opening notes for a move (1 = the first)
let gameHeaders: Headers = {}; // the game's PGN headers: who played, when, the result

// Strategy coach
const insights = new Map<string, Insight>(); // keyed by position
let quiz: Quiz | null = null;
const quizScore = [0, 0]; // [right, asked]
const brilliantShown = new Set<string>(); // positions where you asked to see the brilliant move
let busy = false;
let busySince = 0;
let statusMessage = "";
let errorText = "";

// Ratings and the eval bar
const reviewCache = new Map<string, Review>(); // finished ratings never change
const analyser = new Analyser(() => refresh());
let lastFraction = 0.5; // eval bar position shown while waiting

// Openings: the database loads in the background
let book: OpeningBook | null = null;
let openingCache: { key: string; info: OpeningInfo[] } = { key: "", info: [] };
const bookReady = OpeningBook.load().then(
  (loaded) => {
    book = loaded;
    refresh();
  },
  (error) => void message("Openings", `The opening database couldn't be loaded: ${error}`),
);

// Stockfish (the opponent's copy, at full strength) for choosing opening moves
const openingEngine: OpeningEngine = {
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
const coachAnalysis: CoachEngine = {
  async analyse(position, seconds, lines = 1) {
    coachEngine ??= new Engine();
    const found = await coachEngine.analyse(fenOf(position), seconds * 1000, lines);
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
    coachEngine ??= new Engine();
    const [line] = await coachEngine.analyse(fenOf(position), seconds * 1000, 1, [standardUci(position, move)]);
    return lineScore(position, line);
  },
};

const ground: Api = Chessground($("board"), {
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
Object.assign(ground.state.drawable.brushes, {
  you: { key: "you", color: YOUR_ARROW, opacity: 0.85, lineWidth: 10 },
  them: { key: "them", color: OPPONENT_ARROW, opacity: 0.85, lineWidth: 10 },
  threat: { key: "threat", color: THREAT_ARROW, opacity: 0.9, lineWidth: 10 },
  guess: { key: "guess", color: GUESS_ARROW, opacity: 0.85, lineWidth: 10 },
  deviate: { key: "deviate", color: DEVIATE_ARROW, opacity: 0.9, lineWidth: 10 },
  best: { key: "best", color: BEST_ARROW, opacity: 0.55, lineWidth: 7 },
  brilliant: { key: "brilliant", color: BRILLIANT_ARROW, opacity: 0.9, lineWidth: 10 },
});

// ---------------------------------------------------------------------------
// What's on screen
// ---------------------------------------------------------------------------

const ratingsOn = () => mode === "practice" && rateMovesBox.checked;
const evalOn = () => mode === "practice" && evalCheck.checked;
const currentPly = () => viewPly ?? game.length;
const gameMoves = () => game.moves.map((m) => m.move);

/** The real position being looked at (in analysis, the "what if" position). */
function base(): Chess {
  return analysis ? analysis.line.position : game.positionAt(currentPly());
}

/** What the board draws: a position of Stockfish's line during a preview. */
function shown(): Chess {
  const plan = previewPlan();
  return plan && preview ? plan.positions[preview.step] : base();
}

function previewPlan(): Plan | undefined {
  return preview ? insights.get(preview.baseFen)?.plan : undefined;
}

/** Would a move on the board be a "what if" move rather than a real one? Yes
 *  in Practice mode when looking back, when reviewing a finished game, or once
 *  analysis has started. */
function analysing(): boolean {
  return mode === "practice" && (analysis !== null || viewPly !== null || (reviewing && match === null));
}

/** True while a quiz question is on screen and not yet answered. */
function quizWaiting(): boolean {
  return !!(quiz && quiz.threat && !quiz.answered);
}

/** Keep the preview and quiz only while their position is on screen. */
function tidyState() {
  if (viewPly !== null && viewPly >= game.length) viewPly = null;
  const fen = fenOf(base());
  if (preview && preview.baseFen !== fen) preview = null;
  if (quiz && quiz.fen !== fen) quiz = null;
}

// ---------------------------------------------------------------------------
// Settings remembered between visits (only on this device)
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "chess-trainer-settings";

interface Settings {
  mode?: Mode;
  opponent?: number;
  level?: number;
  colour?: string;
  sfOpening?: string;
  myOpening?: string;
  rateMoves?: boolean;
  evalBar?: boolean;
  boardTheme?: string;
  planMode?: string;
  soundOn?: boolean;
  soundVolume?: number;
}

function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveSettings() {
  const settings: Settings = {
    mode: menuMode(),
    opponent: opponentBox.selectedIndex,
    level: levelBox.selectedIndex,
    colour: colourBox.value,
    sfOpening: sfOpeningBox.value,
    myOpening: myOpeningBox.value,
    rateMoves: rateMovesBox.checked,
    evalBar: evalCheck.checked,
    boardTheme: themeBox.value,
    planMode: planModeBox.value,
    soundOn: soundOn.checked,
    soundVolume: Number(soundVolume.value),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // private browsing or storage blocked: the choices just aren't remembered
  }
}

// ---------------------------------------------------------------------------
// The start menu
// ---------------------------------------------------------------------------

const menuMode = (): Mode =>
  (menuCard.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value as Mode) ?? "play";

function buildMenu() {
  for (const level of LEVELS) levelBox.add(new Option(level.name));
  const openingNames = REPERTOIRE.map(menuName);
  for (const name of [STOCKFISH_DECIDES, SUGGESTED, ...openingNames]) sfOpeningBox.add(new Option(name));
  for (const name of [NO_OPENING, SUGGESTED, ...openingNames]) myOpeningBox.add(new Option(name));

  const saved = loadSettings();
  if (saved.mode) {
    const radio = menuCard.querySelector<HTMLInputElement>(`input[name="mode"][value="${saved.mode}"]`);
    if (radio) radio.checked = true;
  }
  if (saved.opponent !== undefined && opponentBox.options[saved.opponent]) opponentBox.selectedIndex = saved.opponent;
  levelBox.selectedIndex = saved.level !== undefined && LEVELS[saved.level] ? saved.level : DEFAULT_LEVEL;
  if (saved.colour) colourBox.value = saved.colour;
  // (A saved name that no longer exists leaves the box on its first choice)
  if (saved.sfOpening) sfOpeningBox.value = saved.sfOpening;
  if (saved.myOpening) myOpeningBox.value = saved.myOpening;
  for (const box of [colourBox, sfOpeningBox, myOpeningBox]) if (box.selectedIndex < 0) box.selectedIndex = 0;
  if (saved.rateMoves !== undefined) rateMovesBox.checked = saved.rateMoves;
  if (saved.evalBar !== undefined) evalCheck.checked = saved.evalBar;
  if (saved.boardTheme) themeBox.value = saved.boardTheme;
  if (saved.planMode) planModeBox.value = saved.planMode;
  if (planModeBox.selectedIndex < 0) planModeBox.selectedIndex = 0;
  if (saved.soundOn !== undefined) soundOn.checked = saved.soundOn;
  if (saved.soundVolume !== undefined) soundVolume.value = String(saved.soundVolume);
  applySound();
  if (themeBox.selectedIndex < 0) themeBox.selectedIndex = 0;
  applyTheme();

  menuCard.addEventListener("change", updateMenu);
  menuCard.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
    onStartGame();
  });
  backButton.addEventListener("click", hideMenu);
  updateMenu();
}

/** Sound effects on or off, and how loud. */
function applySound() {
  setSound(soundOn.checked, Number(soundVolume.value) / 100);
  soundVolume.disabled = !soundOn.checked;
}

/** The board theme: "wood" or "grey" (a class on the board). */
function applyTheme() {
  const board = $("board");
  for (const option of themeBox.options) board.classList.toggle(option.value, option.value === themeBox.value);
}

/** Grey out the options that don't apply to the chosen mode. */
function updateMenu() {
  const practice = menuMode() === "practice";
  const againstStockfish = !practice || opponentBox.selectedIndex === 0;
  const usable: [HTMLSelectElement, boolean][] = [
    [opponentBox, practice],
    [levelBox, againstStockfish],
    [colourBox, againstStockfish],
    [sfOpeningBox, againstStockfish],
    [myOpeningBox, practice && againstStockfish],
  ];
  for (const [box, on] of usable) {
    box.disabled = !on;
    box.previousElementSibling?.classList.toggle("disabled", !on);
  }
  startButton.textContent = practice ? "Start practice" : "Start game";
}

function showMenu() {
  menuOpen = true;
  backButton.disabled = game.length === 0 && match === null;
  updateMenu();
  menu.hidden = false;
  startButton.focus();
}

function hideMenu() {
  menuOpen = false;
  menu.hidden = true;
  // The board may have changed size while hidden
  requestAnimationFrame(() => {
    ground.redrawAll();
    refresh();
  });
}

function onStartGame() {
  mode = menuMode();
  canReview = false;
  reviewing = false;
  if (mode === "practice" && opponentBox.selectedIndex === 1) {
    resetBoard(new Game()); // a free board: you move both sides
    orientation = "white";
  } else {
    startMatch();
  }
  hideMenu();
  refresh();
  void maybeOpponentMove(); // if you're Black, Stockfish moves first
}

/** A fresh game from a position, with nothing else going on. */
function resetBoard(newGame: Game, headers: Headers = { White: "?", Black: "?", Date: today() }) {
  gameHeaders = { ...headers };
  match = null;
  analysis = null;
  viewPly = null;
  preview = null;
  quiz = null;
  thinking = false;
  result = "";
  showReply = false;
  plyNotes = new Map();
  game = newGame;
}

// ---------------------------------------------------------------------------
// Matches against Stockfish
// ---------------------------------------------------------------------------

function startMatch() {
  let colour = colourBox.value;
  if (colour === "Random") colour = Math.random() < 0.5 ? "White" : "Black";
  const user: Color = colour === "White" ? "white" : "black";
  resetBoard(new Game());
  const level = levelBox.selectedIndex;
  const sfOpening = pickOpening(sfOpeningBox.value, opposite(user), level);
  const myOpening = pickOpening(myOpeningBox.value, user, level);
  match = {
    id: ++matchCounter, user, level,
    sfOpening, sfActive: sfOpening !== null, sfMisses: 0,
    // Opening coaching is a training tool, so Play mode doesn't have it
    myOpening: mode === "practice" ? myOpening : null,
    myActive: mode === "practice" && myOpening !== null,
  };
  const stockfish = `Stockfish (${shortName(LEVELS[level])})`;
  gameHeaders = { White: user === "white" ? "You" : stockfish, Black: user === "white" ? stockfish : "You", Date: today() };
  orientation = user; // your pieces at the bottom
  void engine.newGame();
}

/** Turn a choice from an opening box into an opening for this colour (or null). */
function pickOpening(choice: string, colour: Color, level: number): Opening | null {
  if (choice === STOCKFISH_DECIDES || choice === NO_OPENING || !choice) return null;
  let chosen = REPERTOIRE.find((o) => menuName(o) === choice);
  if (!chosen || chosen.colour !== colour) {
    // "Suggested", or an opening for the other colour (e.g. after a random
    // colour): pick one suited to this level instead.
    const suited = suggestedFor(colour, level);
    chosen = suited[Math.floor(Math.random() * suited.length)];
  }
  return chosen;
}

/** Before your move is played: note how it fits the opening you're practising. */
function coachMyOpening(move: NormalMove) {
  if (!match?.myActive || !match.myOpening || !book) return;
  const first = firstMoveOf(game.positionAt(0), gameMoves());
  const note = coachOpeningMove(game.position, move, match.myOpening, book, first);
  if (note === undefined) match.myActive = false; // the opening phase is over
  else plyNotes.set(game.length + 1, [`Your opening: ${note}`]);
}

/** Called after every move of the game, yours or Stockfish's. */
function afterMove() {
  const last = game.moves[game.length - 1];
  if (last) void play(soundForMove(last.san));
  if (!match && game.outcome()) setTimeout(() => void play("gameover"), 350);
  viewPly = null;
  preview = null;
  analysis = null;
  showReply = false; // the review goes back to your move
  refresh();
  if (!match) return;
  if (game.outcome()) {
    // A short wait first, so the last move can be seen before the message
    const id = match.id;
    setTimeout(() => match?.id === id && finishMatch(), 900);
  } else {
    void maybeOpponentMove();
  }
}

async function maybeOpponentMove() {
  if (!match || thinking || game.position.turn === match.user || game.outcome()) return;
  const { id, level: levelIndex } = match;
  const level = LEVELS[levelIndex];
  thinking = true;
  refresh();
  const started = performance.now();
  try {
    // While it follows an opening, Stockfish plays book moves or builds the
    // opening's setup in a sensible order - unless that would be a real
    // mistake, in which case it plays what the position needs.
    let move: NormalMove | undefined;
    let note: string | undefined;
    let openingOver = false;
    let misses = match.sfMisses;
    const position = game.position;
    if (match.sfActive && match.sfOpening) {
      await bookReady;
      if (book) {
        const first = firstMoveOf(game.positionAt(0), gameMoves());
        const choice = await chooseOpeningMove(openingEngine, position, match.sfOpening, book, levelIndex, first);
        ({ move, note } = choice);
        if (move === undefined) {
          // Finished with the opening, or had to drop the plan twice in a row
          misses += 1;
          openingOver = choice.finished || misses >= 2;
        } else {
          misses = 0;
        }
      }
    }
    if (move === undefined) {
      const uci = await engine.bestMove(fenOf(position), {
        skill: level.skill,
        depth: level.depth,
        movetime: level.seconds * 1000,
      });
      const parsed = parseUci(uci);
      if (!parsed || !("from" in parsed)) throw new Error(`unexpected answer "${uci}"`);
      move = parsed;
    }
    const wait = OPPONENT_MIN_DELAY * 1000 - (performance.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    // Ignore a move meant for a match that has since been stopped or changed (Undo)
    if (match?.id !== id || fenOf(game.position) !== fenOf(position)) {
      thinking = false;
      refresh();
      void maybeOpponentMove();
      return;
    }
    thinking = false;
    match.sfMisses = misses;
    if (openingOver) match.sfActive = false;
    if (note) plyNotes.set(game.length + 1, [`Stockfish's opening: ${note}`]);
    game.play(move);
    afterMove();
  } catch (error) {
    if (match?.id !== id) return;
    thinking = false;
    match = null;
    errorText = `Stockfish couldn't make its move: ${error}`;
    refresh();
  }
}

function finishMatch() {
  const outcome = game.outcome() as Outcome;
  let text: string;
  gameHeaders.Result = !outcome.winner ? "1/2-1/2" : outcome.winner === "white" ? "1-0" : "0-1";
  if (!outcome.winner) text = `It's a draw (${outcome.reason}).`;
  else if (outcome.winner === match!.user) text = "You won! Well played.";
  else text = "Stockfish won this time.";
  endMatch(text);
}

/** The match is over: Play games can then be reviewed in Practice mode. */
function endMatch(text: string) {
  void play("gameover");
  match = null;
  thinking = false;
  canReview = mode === "play" && game.length > 0;
  refresh();
  const hint =
    mode === "play"
      ? canReview ? '\n\nClick "Review this game" to see how every move rated.' : ""
      : "\n\nStep back through the moves to see where the game turned - the Move review rates every move.";
  void message("Match over", text + hint);
}

/** After a Play game: switch to Practice to see the ratings and the coach. */
function onReviewGame() {
  reviewTitle = "";
  mode = "practice";
  canReview = false;
  reviewing = true;
  refresh();
}

async function onResign() {
  if (!match) return;
  if (!(await message("Resign", "Resign this game? Stockfish will win the match.", true))) return;
  result = "You resigned - Stockfish wins";
  gameHeaders.Result = match.user === "white" ? "0-1" : "1-0";
  gameHeaders.Termination = `${match.user === "white" ? "White" : "Black"} resigns`;
  endMatch("You resigned.");
}

// ---------------------------------------------------------------------------
// Moves on the board
// ---------------------------------------------------------------------------

/** The position your moves are made in: in a quiz, your opponent's turn (your
 *  move skipped); in analysis, the position on screen; otherwise the game. */
function clickPosition(): Chess {
  if (quizWaiting()) return quiz!.threat!.passed!;
  return analysing() ? base() : game.position;
}

/** Can pieces be moved right now, and which side's? */
function movableColour(): Color | undefined {
  if (busy || thinking || preview || menuOpen) return undefined;
  if (quizWaiting()) return quiz!.threat!.them;
  if (analysing()) return base().turn;
  if (viewPly !== null) return undefined; // looking back in Play mode
  if (match) return game.position.turn === match.user ? match.user : undefined;
  return game.outcome() ? undefined : game.position.turn; // a free board
}

function onBoardMove(from: Key, to: Key) {
  const position = clickPosition();
  const given: NormalMove = { from: parseSquare(from)!, to: parseSquare(to)! };
  // Pawns reaching the last rank always become queens (as in the desktop app)
  if (position.board.get(given.from)?.role === "pawn" && (to[1] === "8" || to[1] === "1")) given.promotion = "queen";
  const move = normalizeMove(position, given) as NormalMove;
  if (quizWaiting()) {
    answerQuiz(move);
  } else if (analysing()) {
    analysisMove(given);
  } else {
    coachMyOpening(move);
    game.play(given);
    afterMove();
  }
}

// -- Analysis: "what if I'd moved differently?" -----------------------------

function analysisMove(move: NormalMove) {
  if (!analysis) {
    analysis = { fromPly: currentPly(), line: new Game(fenOf(base())) };
    quiz = null;
  }
  const played = analysis.line.play(move);
  void play(soundForMove(played.san));
  preview = null;
  refresh();
}

/** The analysis moves so far, e.g. "14. Nf3 Bg4 15. h3". */
function analysisLineText(): string {
  if (!analysis || !analysis.line.length) return "";
  return variationSan(analysis.line.positionAt(0), analysis.line.moves.map((m) => m.move));
}

/** Take back the last analysis move; with none left, leave analysis. */
function analysisTakeBack() {
  if (analysis && analysis.line.length) {
    analysis.line.undo();
    if (!analysis.line.length) analysis = null;
    refresh();
  } else {
    exitAnalysis();
  }
}

function exitAnalysis() {
  if (!analysis) return;
  analysis = null;
  preview = null;
  refresh();
}

// -- Stepping through the game ------------------------------------------------

function goTo(ply: number) {
  ply = Math.max(0, Math.min(ply, game.length));
  if (ply === currentPly() + 1 && !analysis) void play(soundForMove(game.moves[ply - 1].san));
  analysis = null; // moving through the game leaves any analysis line
  viewPly = ply === game.length ? null : ply;
  refresh();
}

function onUndo() {
  if (!game.length) return;
  game.undo();
  // In a match, take back Stockfish's reply too, so it's your turn again.
  if (match && game.position.turn !== match.user && game.length) game.undo();
  for (const ply of [...plyNotes.keys()]) if (ply > game.length) plyNotes.delete(ply);
  viewPly = null;
  refresh();
  if (match) void maybeOpponentMove();
}

async function onLoadFen(event: Event) {
  event.preventDefault();
  const fen = fenInput.value.trim();
  if (!fen) return;
  let loaded: Game;
  try {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    loaded = new Game(fenOf(position));
  } catch {
    await message("Chess Trainer", "That doesn't look like a valid FEN position.");
    return;
  }
  fenInput.value = "";
  resetBoard(loaded);
  canReview = false;
  reviewing = false;
  refresh();
}

// ---------------------------------------------------------------------------
// The strategy coach
// ---------------------------------------------------------------------------

type Task = "threat" | "plan" | "quiz" | "ideas" | "brilliant";

async function startTask(kind: Task) {
  preview = null;
  errorText = "";
  const position = base();
  const fen = fenOf(position);
  const insight = insights.get(fen) ?? {};
  const needThreat = kind !== "plan" && kind !== "brilliant" && !insight.threat;
  const needBrilliant = kind === "brilliant" && !insight.brilliant;
  const planMode = currentPlanMode(position);
  // A plan made in the other mode is made again (Explain the ideas uses whichever is there)
  const needPlan = (kind === "plan" && (!insight.plan || planModeOf(insight.plan) !== planMode)) ||
    (kind === "ideas" && !insight.plan);
  const needIdeas = kind === "ideas" && !insight.ideas;

  if (kind === "quiz") {
    if (position.isCheck()) {
      errorText = "You're in check, so your opponent's idea is obvious: deal with the check first!";
      refresh();
      return;
    }
    quiz = { fen, threat: insight.threat, answered: false };
    checkQuizReady();
  }

  if (!(needThreat || needPlan || needIdeas || needBrilliant)) {
    refresh();
    return;
  }
  setBusy(true, "Stockfish is thinking...");
  try {
    const found: Insight = { ...insight };
    if (needBrilliant) {
      statusMessage = "Stockfish is looking for a sacrifice that works...";
      found.brilliant = await findBrilliant(coachAnalysis, position);
      saveInsight(fen, found);
    }
    if (needThreat) {
      statusMessage = "Stockfish is looking for threats...";
      found.threat = await threatCheck(coachAnalysis, position);
      saveInsight(fen, found);
      if (quiz && quiz.fen === fen) {
        quiz.threat = found.threat;
        checkQuizReady();
      }
      refresh();
    }
    if (needPlan) {
      if (planMode === "best") {
        statusMessage = "Stockfish is working out the next few moves...";
        found.plan = await planAhead(coachAnalysis, position);
      } else {
        statusMessage = "Stockfish is checking your opening's moves...";
        const first = firstMoveOf(game.positionAt(0), gameMoves());
        found.plan = await openingPlanAhead(coachAnalysis, position, match!.myOpening!, book!, first, planMode);
      }
      saveInsight(fen, found);
      refresh();
    }
    if (needIdeas) {
      found.ideas = explainIdeas(position, found.threat!, found.plan!, middlegameNotes(position, position.turn));
      saveInsight(fen, found);
    }
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
  } finally {
    if (quiz && !quiz.threat) quiz = null; // the threat search failed
    setBusy(false);
    refresh();
  }
}

/** Which Plan ahead to make here: following your opening (if you're
 *  practising one, it's your move and the switch is on), or Stockfish's best. */
function currentPlanMode(position: Chess): PlanMode {
  const chosen = planModeBox.value as PlanMode;
  if (chosen === "best" || !match?.myOpening || !book || position.turn !== match.user) return "best";
  return chosen;
}

const planModeOf = (plan: Plan): PlanMode => ("mode" in plan ? (plan as OpeningPlan).mode : "best");

function saveInsight(fen: string, found: Insight) {
  insights.set(fen, { ...(insights.get(fen) ?? {}), ...found });
}

let busyTimer: number | undefined;

function setBusy(on: boolean, text = "") {
  busy = on;
  busySince = performance.now();
  statusMessage = text;
  clearInterval(busyTimer);
  if (on) busyTimer = window.setInterval(drawStatus, 250);
  drawStatus();
}

function drawStatus() {
  const seconds = Math.round((performance.now() - busySince) / 1000);
  coachStatus.textContent = busy ? `${statusMessage}  (${seconds}s)` : "";
}

/** Once the threat is known: if there's nothing to find, there's no question. */
function checkQuizReady() {
  if (quiz?.threat && !quiz.threat.threatMove) quiz = null; // the threat text explains
}

function onQuizButton() {
  if (quizWaiting()) {
    // Give up: reveal the answer
    quizScore[1] += 1;
    const answer = quiz!.threat!.threatSan;
    quiz!.answered = true;
    quiz!.guess = undefined;
    quiz!.result = [false, `The idea Stockfish found is ${answer} (orange arrow).`];
    refresh();
  } else {
    void startTask("quiz");
  }
}

function answerQuiz(guess: NormalMove) {
  const [correct, text] = gradeGuess(quiz!.threat!, guess);
  quizScore[1] += 1;
  if (correct) quizScore[0] += 1;
  void play(correct ? "right" : "wrong");
  quiz!.answered = true;
  quiz!.guess = guess;
  quiz!.result = [correct, text];
  refresh();
}

function stepPreview(direction: number) {
  const plan = insights.get(fenOf(base()))?.plan;
  if (!plan || busy) return;
  const step = Math.max(0, Math.min((preview?.step ?? 0) + direction, plan.steps.length));
  preview = step === 0 ? null : { baseFen: fenOf(base()), step };
  refresh();
}

function exitPreview() {
  preview = null;
  refresh();
}

// ---------------------------------------------------------------------------
// Ratings and opening information
// ---------------------------------------------------------------------------

/** For each move: is it a book move, the opening name so far, and notes. */
function openingInfo(): OpeningInfo[] {
  if (!book || mode !== "practice" || !isStartPosition(game.positionAt(0))) {
    return game.moves.map(() => ({ book: false, opening: null, notes: [] }));
  }
  // Only worked out again when the moves change
  const key = game.moves.map((m) => makeUci(m.move)).join(" ");
  if (openingCache.key !== key || openingCache.info.length !== game.length) {
    openingCache = { key, info: book.gameOpenings(Chess.default(), gameMoves()) };
  }
  return openingCache.info;
}

function rateMove(before: Chess, move: NormalMove): Review | undefined {
  const key = `${fenOf(before)} ${makeUci(move)}`;
  let review = reviewCache.get(key);
  if (!review) {
    review = reviewMove(before, move, analyser.evals);
    if (review) reviewCache.set(key, review);
  }
  return review;
}

/** A rating for every move of the game (undefined while Stockfish hasn't
 *  finished, and when ratings are off). */
function moveReviews(): (Review | undefined)[] {
  if (!ratingsOn()) return game.moves.map(() => undefined);
  return addMisses(game.moves.map((played, i) => rateMove(game.positionAt(i), played.move)));
}

/** The rating of the last analysis move (undefined until Stockfish has looked). */
function analysisReview(): Review | undefined {
  if (!analysis || !analysis.line.length) return undefined;
  const line = analysis.line;
  return rateMove(line.positionAt(line.length - 1), line.moves[line.length - 1].move);
}

/** Which move the review (and the rating icon) is about: normally the move on
 *  screen. In a match, while you're looking at the live game, it stays on YOUR
 *  last move until you click "See Stockfish's reply". */
function reviewPly(): number {
  const current = currentPly();
  if (match && viewPly === null && !preview && !showReply) {
    for (let ply = current; ply > 0; ply--) if (game.moverOf(ply) === match.user) return ply;
  }
  return current;
}

/** Ask the background scorer for the positions that still need a score: the
 *  position on screen first (for the eval bar), then the analysis line, then
 *  every position of the game (so each move can be rated). */
function requestEval() {
  const wanted: Chess[] = [];
  if (evalOn()) wanted.push(shown());
  if (ratingsOn()) {
    if (analysis) wanted.push(...Array.from({ length: analysis.line.length + 1 }, (_, i) => analysis!.line.positionAt(i)));
    const ply = reviewPly();
    if (ply > 0) wanted.push(game.positionAt(ply - 1), game.positionAt(ply));
    const all = Array.from({ length: game.length + 1 }, (_, i) => game.positionAt(i));
    wanted.push(...all);
    wanted.push(...brilliantCandidates(all.slice(0, -1), analyser.evals));
  }
  analyser.request(wanted);
}

// ---------------------------------------------------------------------------
// Drawing everything
// ---------------------------------------------------------------------------

function refresh() {
  tidyState();
  const reviews = moveReviews();
  const info = openingInfo();
  applyMode();
  drawBoard(reviews, info);
  drawEvalBar();
  drawMoveList(reviews, info);
  drawReview(reviews, info);
  drawTurn();
  drawButtons();
  drawCoach();
  requestEval();
}

/** Show the parts of the page that belong to the current mode. */
function applyMode() {
  const practice = mode === "practice";
  document.body.classList.toggle("practice", practice);
  modeTitle.textContent = practice ? "Practice" : "Play";
  for (const element of [coachPanel, reviewArea, fenRow, undoButton]) element.hidden = !practice;
  planModeRow.hidden = !(practice && match?.myOpening);
  $("eval-check-label").hidden = !practice;
  evalBar.hidden = !evalOn();
}

/** Where an arrow for a move ends: for castling, on the king's square. */
function arrowEnd(position: Chess, move: NormalMove): Key {
  if (isCastling(position, move)) return makeSquare((move.from & ~7) + (move.to > move.from ? 6 : 2)) as Key;
  return makeSquare(move.to) as Key;
}

/** The coach's arrows: Stockfish's line (numbered), the threat, your quiz guess. */
function arrowShapes(): DrawShape[] {
  const insight = insights.get(fenOf(base())) ?? {};
  const hidden = quiz !== null && !quiz.answered; // no spoilers
  const shapes: DrawShape[] = [];
  if (insight.plan && !hidden) {
    // The next few moves of the line from where you are in it
    const first = preview?.step ?? 0;
    const you = base().turn;
    const choices = planModeOf(insight.plan) === "best" ? [] : (insight.plan as OpeningPlan).choices;
    insight.plan.steps.slice(first, first + ARROWS_AT_ONCE).forEach((step, i) => {
      const before = insight.plan!.positions[first + i];
      const choice = choices[first + i];
      const deviating = step.side === you && choice?.kind === "deviate";
      const brush = step.side !== you ? "them" : deviating ? "deviate" : "you";
      const fill = step.side !== you ? OPPONENT_ARROW : deviating ? DEVIATE_ARROW : YOUR_ARROW;
      shapes.push({
        orig: makeSquare(step.move.from) as Key,
        dest: arrowEnd(before, step.move),
        brush,
        label: { text: String(step.number), fill },
      });
      // Your next move: where the opening plan differs from Stockfish's own choice, show that too
      if (i === 0 && step.side === you && choice && makeUci(choice.best) !== makeUci(step.move)) {
        shapes.push({ orig: makeSquare(choice.best.from) as Key, dest: arrowEnd(before, choice.best), brush: "best" });
      }
    });
  }
  if (insight.brilliant?.found && insight.brilliant.move && brilliantShown.has(fenOf(base())) && !hidden && !preview) {
    shapes.push({
      orig: makeSquare(insight.brilliant.move.from) as Key,
      dest: arrowEnd(base(), insight.brilliant.move),
      brush: "brilliant",
      label: { text: "!!", fill: BRILLIANT_ARROW },
    });
  }
  const threat = insight.threat;
  if (threat?.threatMove && threat.passed && !hidden && !preview) {
    shapes.push({
      orig: makeSquare(threat.threatMove.from) as Key,
      dest: arrowEnd(threat.passed, threat.threatMove),
      brush: "threat",
      label: { text: "!", fill: THREAT_ARROW },
    });
  }
  if (quiz?.answered && quiz.guess && quiz.threat?.passed && makeUci(quiz.guess) !== makeUci(quiz.threat.threatMove!)) {
    shapes.push({
      orig: makeSquare(quiz.guess.from) as Key,
      dest: arrowEnd(quiz.threat.passed, quiz.guess),
      brush: "guess",
      label: { text: "?", fill: GUESS_ARROW },
    });
  }
  return shapes;
}

/** The rating badge on the piece that made the move being reviewed. */
function badgeShapes(reviews: (Review | undefined)[], info: OpeningInfo[]): DrawShape[] {
  if (preview || !ratingsOn()) return [];
  let rating: string;
  let square: string;
  if (analysis) {
    const review = analysisReview();
    if (!review) return [];
    square = analysis.line.moves[analysis.line.length - 1].to;
    rating = review.symbol === "#" ? "Checkmate" : review.rating;
  } else {
    const ply = reviewPly();
    if (ply === 0) return [];
    square = game.moves[ply - 1].to;
    const piece = shown().board.get(parseSquare(square)!);
    if (!piece || piece.color !== game.moverOf(ply)) return []; // that piece has since been captured
    const review = reviews[ply - 1];
    if (info[ply - 1]?.book) rating = "Book";
    else if (review) rating = review.symbol === "#" ? "Checkmate" : review.rating;
    else return [];
  }
  return [{ orig: square as Key, customSvg: { html: badgeSvg(rating) } }];
}

function drawBoard(reviews: (Review | undefined)[], info: OpeningInfo[]) {
  const position = shown();
  let last: [Key, Key] | undefined;
  const plan = previewPlan();
  if (plan && preview) {
    const step = plan.steps[preview.step - 1];
    last = [makeSquare(step.move.from) as Key, arrowEnd(plan.positions[preview.step - 1], step.move)];
  } else if (analysis && analysis.line.length) {
    const played = analysis.line.moves[analysis.line.length - 1];
    last = [played.from as Key, played.to as Key];
  } else if (!analysis && currentPly() > 0) {
    const played = game.moves[currentPly() - 1];
    last = [played.from as Key, played.to as Key];
  }
  const colour = movableColour();
  const movesFrom = quizWaiting() ? quiz!.threat!.passed! : position;
  ground.setAutoShapes([...badgeShapes(reviews, info), ...arrowShapes()]);
  ground.set({
    fen: fenOf(position),
    orientation,
    turnColor: quizWaiting() ? quiz!.threat!.them : position.turn,
    lastMove: last,
    check: quizWaiting() ? false : position.isCheck(),
    movable: { color: colour, dests: colour ? chessgroundDests(movesFrom) : new Map() },
  });
  // In analysis the board gets a blue frame, so it's clear the moves aren't the game
  $("board").classList.toggle("analysis", analysis !== null);
  drawFallingKing(position);
}

// -- The checkmated king falls over ---------------------------------------------

const FALL_PAUSE_MS = 180; // a short pause before it topples
const FALL_SPEED_MS = 45; // time between pictures
const fallStyle = document.createElement("style");
document.head.append(fallStyle);
let fall: { fen: string; colour: Color; step: number; timer?: number } | null = null;

function drawFallingKing(position: Chess) {
  if (!position.isCheckmate()) {
    if (fall) clearTimeout(fall.timer);
    fall = null;
    fallStyle.textContent = "";
    return;
  }
  const fen = fenOf(position);
  if (fall?.fen === fen) return; // already falling (or fallen)
  if (fall) clearTimeout(fall.timer);
  fall = { fen, colour: position.turn, step: 0 };
  showFallFrame();
  fall.timer = window.setTimeout(advanceFall, FALL_PAUSE_MS);
}

function advanceFall() {
  if (!fall || fall.step >= FALL_ANGLES.length - 1) return;
  fall.step++;
  showFallFrame();
  fall.timer = window.setTimeout(advanceFall, FALL_SPEED_MS);
}

function showFallFrame() {
  if (!fall) return;
  const url = fallenKing(fall.colour, FALL_ANGLES[fall.step]);
  // (more specific than the normal piece pictures, so it wins)
  fallStyle.textContent = url ? `.cg-wrap cg-board piece.king.${fall.colour} { background-image: url("${url}"); }` : "";
}

/** Stockfish's verdict on the position on screen, as White's share of the bar. */
function drawEvalBar() {
  if (!evalOn()) return;
  const position = shown();
  let fraction: number | undefined;
  let label = "";
  if (position.isCheckmate()) {
    [fraction, label] = position.turn === "black" ? [1, "1-0"] : [0, "0-1"];
  } else if (isDrawnPosition(position) || (!analysis && !preview && viewPly === null && game.outcome())) {
    [fraction, label] = [0.5, "½"];
  } else {
    const score = analyser.evals.get(fenOf(position))?.score;
    if (score?.mate !== undefined) {
      [fraction, label] = [score.mate > 0 ? 1 : 0, `M${Math.abs(score.mate)}`];
    } else if (score) {
      // Same formula lichess uses: the bar moves a lot for the first few pawns
      fraction = 1 / (1 + Math.exp(-0.00368208 * score.cp));
      label = formatScore(score);
    }
  }
  if (fraction === undefined) [fraction, label] = [lastFraction, "..."];
  lastFraction = fraction;
  // White's share sits on White's side of the board
  evalBar.classList.toggle("flipped", orientation === "black");
  evalBar.style.setProperty("--white", `${fraction * 100}%`);
  const tag = evalBar.querySelector<HTMLElement>(".eval-label")!;
  tag.textContent = label;
  tag.classList.toggle("on-white", fraction >= 0.5);
}

function drawMoveList(reviews: (Review | undefined)[], info: OpeningInfo[]) {
  const current = analysis ? analysis.fromPly : currentPly();
  moveList.replaceChildren();
  game.moves.forEach((played, index) => {
    const ply = index + 1;
    const mover = game.moverOf(ply);
    if (mover === "white" || index === 0) {
      const row = document.createElement("li");
      const number = document.createElement("span");
      number.className = "number";
      number.textContent = `${game.positionAt(index).fullmoves}.${mover === "black" ? ".." : ""}`;
      row.append(number);
      moveList.append(row);
    }
    const button = document.createElement("button");
    button.type = "button";
    const review = reviews[index];
    const bookMove = info[index]?.book;
    button.className = "move" + (ply === current ? " current" : "");
    // Book moves are known theory: shown in brown, without a ?! mark
    if (bookMove) button.classList.add("r-book");
    else if (review) button.classList.add(ratingClass(review.rating));
    // "?!" style marks after the move; checkmate already shows "#"
    button.textContent = played.san + (review && review.symbol !== "#" && !bookMove ? review.symbol : "");
    button.addEventListener("click", () => goTo(ply));
    moveList.lastElementChild!.append(button);
  });
  // Keep the current move in sight (scrolling only the list, not the page)
  const marked = moveList.querySelector<HTMLElement>(".current");
  if (marked) {
    const top = marked.offsetTop - moveList.offsetTop;
    if (top < moveList.scrollTop || top + marked.offsetHeight > moveList.scrollTop + moveList.clientHeight) {
      moveList.scrollTop = top - moveList.clientHeight / 2;
    }
  }

  const total = game.length;
  viewLabel.textContent =
    viewPly === null ? (total ? "Showing the current position" : "No moves yet") : `Viewing move ${viewPly} of ${total}`;
  const enabled = [current > 0, current > 0, current < total, current < total];
  const order = ["first", "back", "forward", "last"];
  for (const button of navButtons) button.disabled = !enabled[order.indexOf(button.dataset.nav!)];

  // The opening's name, and the openings chosen for a practice match
  const opening = current ? info[current - 1]?.opening : null;
  openingLabel.textContent = opening ? `Opening: ${opening[0]} ${opening[1]}` : "";
  openingLabel.hidden = !opening || mode !== "practice";
  const lines: string[] = [];
  if (match && mode === "practice") {
    if (match.sfOpening) {
      lines.push(`Stockfish is playing: ${match.sfOpening.name}${match.sfActive ? "" : " (opening phase over)"}`);
    }
    if (match.myOpening) {
      const first = firstMoveOf(game.positionAt(0), gameMoves());
      const system = systemFor(match.myOpening, first);
      const [done, missing] = setupProgress(base(), match.user, system.setup);
      const progress = missing.length ? `setup ${done}/${system.setup.length}` : "setup complete";
      lines.push(`You are practising: ${system.label} (${progress})`);
    }
  }
  repertoireLabel.textContent = lines.join("\n");
  repertoireLabel.hidden = !lines.length;
}

/** For your moves while practising an opening: whether sticking to it (or
 *  leaving it) was right, judged with Stockfish's ratings. */
function openingChoiceNote(ply: number, review: Review | undefined): string | undefined {
  if (!review || !book || !match?.myOpening || game.moverOf(ply) !== match.user) return undefined;
  const before = game.positionAt(ply - 1);
  const best = analyser.evals.get(fenOf(before))?.best;
  const first = firstMoveOf(game.positionAt(0), gameMoves().slice(0, Math.max(0, ply - 1)));
  return reviewOpeningChoice(before, game.moves[ply - 1].move, review.loss, best, match.myOpening, book, first);
}

/** "Missed Win" -> "r-missed-win", for the rating's colour */
const ratingClass = (rating: string) => "r-" + rating.toLowerCase().replace(" ", "-");

function drawReview(reviews: (Review | undefined)[], info: OpeningInfo[]) {
  if (mode !== "practice") return;
  reviewBox.replaceChildren();
  const paragraph = (text: string, className = "") => {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    reviewBox.append(p);
  };
  const showRating = (review: Review) => {
    const [heading, ...rest] = review.text.split("\n");
    paragraph(heading, `review-heading ${ratingClass(review.rating)}`);
    paragraph(rest.join("\n"), "review-body");
  };

  if (analysis) {
    paragraph("Analysis - not part of the game", "review-opening");
    const review = ratingsOn() ? analysisReview() : undefined;
    if (!analysis.line.length) paragraph("Make a move to see what would have happened.");
    else if (!review) paragraph(ratingsOn() ? "Stockfish is checking this move..." : "Move ratings are switched off.");
    else showRating(review);
  } else {
    const ply = reviewPly();
    // Opening notes first: book move, transpositions, and how this move fits
    // the opening being played or practised
    if (ply > 0) {
      const moveInfo = info[ply - 1] ?? { book: false, opening: null, notes: [] };
      const notes = [...moveInfo.notes, ...(plyNotes.get(ply) ?? [])];
      const choiceNote = openingChoiceNote(ply, reviews[ply - 1]);
      if (choiceNote) notes.push(choiceNote);
      if (moveInfo.book || notes.length) {
        const name = moveInfo.opening ? moveInfo.opening[1] : "known theory";
        paragraph(moveInfo.book ? `Book move (${name})` : "Opening", "review-opening");
        paragraph(notes.map((note) => `• ${note}`).join("\n"), "review-notes");
      }
    }
    if (!ratingsOn()) paragraph("Move ratings are switched off.");
    else if (ply === 0) paragraph("Make a move, or click a move in the list, to see what Stockfish thinks of it.");
    else if (!reviews[ply - 1]) paragraph("Stockfish is checking this move...");
    else {
      showRating(reviews[ply - 1]!);
      const missed = missedBrilliant(game.positionAt(ply - 1), game.moves[ply - 1].move, analyser.evals);
      if (missed) paragraph(missed, "review-missed");
    }
  }

  const { done, total } = analyser.progress();
  reviewProgress.textContent = reviewing && done < total ? `Stockfish is checking the game: ${done} of ${total} positions` : "";
  reviewProgress.hidden = !reviewProgress.textContent;

  // In a match the review stays on your move; this shows Stockfish's reply
  const current = currentPly();
  const live = match !== null && viewPly === null && !preview && !analysis;
  if (live && reviewPly() < current) {
    replyButton.innerHTML = "See Stockfish's reply &rsaquo;";
    replyButton.disabled = false;
  } else if (live && showReply && current && game.moverOf(current) !== match!.user) {
    replyButton.innerHTML = "&lsaquo; Back to your move";
    replyButton.disabled = false;
  } else {
    replyButton.innerHTML = "See Stockfish's reply &rsaquo;";
    replyButton.disabled = true;
  }
}

function drawTurn() {
  turnLabel.textContent = turnText();
  if (analysis) gameInfo.textContent = "Exploring a different move";
  else if (match) {
    const colour = match.user === "white" ? "White" : "Black";
    gameInfo.textContent = `vs Stockfish (${shortName(LEVELS[match.level])}), you play ${colour}`;
  } else if (canReview && mode === "play") gameInfo.textContent = "Game over. See how every move rated:";
  else if (mode === "practice" && reviewing) gameInfo.textContent = reviewTitle || "Reviewing your game against Stockfish";
  else if (mode === "practice") gameInfo.textContent = "Free board: you move both sides";
  else gameInfo.textContent = game.length ? "Match over" : "";
}

function turnText(): string {
  if (analysis && !preview) {
    const line = analysisLineText();
    const side = colourName(base().turn);
    return line ? `Analysis (${side} to move): ${line}` : `Analysis: make any move for ${side} to see what would have happened`;
  }
  const plan = previewPlan();
  if (plan && preview) {
    const step = plan.steps[preview.step - 1];
    const who = step.who === "You" ? "you play" : "your opponent plays";
    return `Previewing Stockfish's line (not played): move ${preview.step} of ${plan.steps.length}, ${who} ${step.san}`;
  }
  if (viewPly !== null) return "Looking back - the game itself is unchanged";
  if (quizWaiting()) return `Quiz: move one of ${colourName(quiz!.threat!.them)}'s pieces to show their idea`;
  if (result) return result;
  const position = game.position;
  const side = colourName(position.turn);
  const outcome = game.outcome();
  if (outcome?.reason === "checkmate") return `Checkmate - ${colourName(outcome.winner!)} wins`;
  if (outcome) return "Game over - draw";
  if (match) {
    if (position.turn === match.user) return `Your move (${side})${position.isCheck() ? " - you're in check!" : ""}`;
    return "Stockfish is thinking...";
  }
  return position.isCheck() ? `${side} to move - in check!` : `${side} to move`;
}

/** Grey out buttons that can't be used right now. */
function drawButtons() {
  const waiting = busy || thinking;
  const looking = viewPly !== null || preview !== null || analysis !== null;
  const position = base();
  const gameOver = position.isEnd() || isDrawnPosition(position);
  const quizOpen = quiz !== null && !quiz.answered;

  for (const button of [toolButtons.threat, toolButtons.plan, toolButtons.ideas, toolButtons.brilliant]) {
    button.disabled = waiting || gameOver || quizOpen;
  }
  toolButtons.quiz.disabled = waiting || gameOver || preview !== null;
  toolButtons.quiz.textContent = quizOpen ? "Give up - show answer" : "Spot their idea (quiz)";

  const plan = insights.get(fenOf(position))?.plan;
  const step = preview?.step ?? 0;
  lineBack.disabled = waiting || step === 0;
  lineForward.disabled = waiting || !plan || quizOpen || step >= (plan?.steps.length ?? 0);
  lineExit.disabled = preview === null;

  // No take-backs while looking back or previewing: Undo only works on the live game.
  undoButton.disabled = waiting || looking || quizOpen || !game.length;
  newButton.disabled = busy;
  loadButton.disabled = busy;

  resignButton.hidden = !(match && !analysis);
  resignButton.disabled = busy;
  reviewButton.hidden = !(canReview && mode === "play" && !match && !analysis);
  exitAnalysisButton.hidden = !analysis;
}

/** Fill the coach's text box for the position being looked at. */
function drawCoach() {
  if (mode !== "practice") return;
  coachText.replaceChildren();
  const insight = insights.get(fenOf(base())) ?? {};

  const section = (heading: string, ...body: (string | HTMLElement)[]) => {
    const block = document.createElement("div");
    block.className = "coach-section";
    const title = document.createElement("p");
    title.className = "coach-heading";
    title.textContent = heading;
    block.append(title, ...body.map((part) => (typeof part === "string" ? textBlock(part) : part)));
    coachText.append(block);
  };
  const textSection = (text: string) => {
    const [heading, ...rest] = text.split("\n");
    section(heading, rest.join("\n"));
  };

  if (errorText) section("Something needs attention", errorText);

  if (quiz && !quiz.threat) {
    section("Quiz", "Preparing the question...");
  } else if (quiz && !quiz.answered) {
    const them = colourName(quiz.threat!.them);
    section(
      "Quiz: spot your opponent's idea",
      `Imagine you skip your move and ${them} gets to play again. What would they play?\n\n` +
        `Click one of ${them}'s pieces, then the square it would move to.\n\n` +
        `Take your time: look at what each of ${them}'s pieces attacks, and what is undefended on your side.`,
      textBlock('Stuck? Click "Give up - show answer".', "coach-note"),
    );
  } else if (quiz?.answered) {
    const [correct, text] = quiz.result!;
    section("Quiz result", textBlock(text, correct ? "coach-right" : "coach-wrong"));
  }

  // No spoilers while a quiz question is open
  const hidden = quiz !== null && !quiz.answered;
  if (insight.ideas && !hidden) {
    // The summary goes first; its sub-headings are in bold too
    const [heading, ...rest] = insight.ideas.split("\n");
    const parts: HTMLElement[] = [];
    for (const paragraph of rest.join("\n").split("\n\n")) {
      const [first, ...body] = paragraph.split("\n");
      if (first.startsWith("Watch for:")) {
        const p = textBlock("");
        const bold = document.createElement("strong");
        bold.textContent = "Watch for:";
        p.append(bold, first.slice("Watch for:".length));
        parts.push(p);
      } else if (body.length) {
        const sub = textBlock(first, "coach-subheading");
        parts.push(sub, textBlock(body.join("\n")));
      } else if (first) {
        parts.push(textBlock(first, first.startsWith("Move numbers") ? "coach-note" : ""));
      }
    }
    section(heading, ...parts);
  }
  if (insight.brilliant && !hidden) {
    const brilliant = insight.brilliant;
    const fen = fenOf(base());
    if (!brilliant.found) {
      section("Is there a brilliant move?", brilliant.text);
    } else if (!brilliantShown.has(fen)) {
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "coach-reveal";
      reveal.textContent = "Show the move";
      reveal.addEventListener("click", () => {
        brilliantShown.add(fen);
        refresh();
      });
      section(
        "Is there a brilliant move? Yes!",
        "There's a sacrifice here that works: you can offer up a piece and still come out on top.\n\n" +
          `Look at what your ${brilliant.role} can do: which move gives something away but opens the enemy king, ` +
          "forks, or wins more back? Check every capture, check and threat - and calculate what happens if they take.",
        reveal,
      );
    } else {
      section("The brilliant move", `${brilliant.text}\n\nStockfish's line: ${brilliant.line}`);
    }
  }
  if (insight.threat && !hidden) textSection(insight.threat.text);
  if (insight.plan && !hidden) {
    textSection(insight.plan.text);
    // Known opening theory from this position, from the opening database
    const theory = book ? [...book.bookMoves(base()).values()] : [];
    if (theory.length) {
      // Main lines first: the more named lines continue from a move, the more established it is.
      const ranked = theory.sort((a, b) => b.names.size - a.names.size).slice(0, 5);
      const items = ranked.map((entry) => `• ${makeSan(base(), entry.move)} (${mainFamily(entry.names)})`);
      section("Known opening theory from here", items.join("\n"));
    }
  }

  if (!coachText.childElementCount && match && (match.sfOpening || match.myOpening)) {
    // Start of a match: the plans of the openings being played
    const first = firstMoveOf(game.positionAt(0), gameMoves());
    for (const [who, opening] of [["Your opening", match.myOpening], ["Stockfish's opening", match.sfOpening]] as const) {
      if (!opening) continue;
      const system = systemFor(opening, first);
      section(`${who}: ${opening.name}`, `${opening.plan}\nSetup: ${system.setup.map(goalWords).join(", ")}.`);
    }
  }
  if (!coachText.childElementCount) textSection(HINT_TEXT);

  const [right, asked] = quizScore;
  quizScoreLabel.textContent = asked ? `Quiz score: ${right} / ${asked}` : "";
  drawStatus();
}

function textBlock(text: string, className = ""): HTMLElement {
  const p = document.createElement("p");
  p.className = `coach-body ${className}`.trim();
  p.textContent = text;
  return p;
}

// ---------------------------------------------------------------------------
// PGN: reviewing a game from a file or pasted text, and downloading games
// ---------------------------------------------------------------------------

const pgnDialog = $<HTMLDialogElement>("pgn-dialog");
const pgnText = $<HTMLTextAreaElement>("pgn-text");
const pgnPick = $<HTMLSelectElement>("pgn-pick");
const pgnStatus = $("pgn-status");
const pgnReview = $<HTMLButtonElement>("pgn-review");
let pgnGames: PgnGame[] = [];

function openPgnDialog() {
  readPgnText();
  pgnDialog.showModal();
  pgnText.focus();
}

/** Look for games in the text box (as you type or paste, or after opening a file). */
function readPgnText() {
  const text = pgnText.value.trim();
  pgnGames = text ? readPgn(text).filter((g) => g.load().game.length > 0 || g.headers.FEN) : [];
  pgnPick.replaceChildren(...pgnGames.map((g, i) => new Option(`${i + 1}. ${g.title}`, String(i))));
  $("pgn-pick-row").hidden = pgnGames.length < 2;
  pgnReview.disabled = !pgnGames.length;
  pgnStatus.classList.toggle("problem", !!text && !pgnGames.length);
  pgnStatus.textContent = !text
    ? ""
    : !pgnGames.length
      ? "No game found in this text. A PGN game looks like: 1. e4 e5 2. Nf3 Nc6 ..."
      : pgnGames.length === 1
        ? `Found: ${pgnGames[0].title}`
        : `Found ${pgnGames.length} games - choose one.`;
}

async function reviewPgnGame(event: Event) {
  event.preventDefault();
  const chosen = pgnGames[Number(pgnPick.value) || 0];
  if (!chosen) return;
  const { game: loaded, problem } = chosen.load();
  pgnDialog.close();
  mode = "practice";
  resetBoard(loaded, chosen.headers);
  canReview = false;
  reviewing = true;
  reviewTitle = `Reviewing: ${chosen.title}`;
  viewPly = loaded.length ? 0 : null; // start from the first position and step through
  orientation = "white";
  if (menuOpen) hideMenu();
  refresh();
  if (problem) await message("PGN", problem);
}

/** The game as a .pgn file, for keeping, sharing or opening elsewhere. */
function downloadPgn() {
  if (!game.length) {
    void message("Download PGN", "There are no moves to save yet.");
    return;
  }
  const outcome = game.outcome();
  const headers = { ...gameHeaders };
  if (!headers.Result || headers.Result === "*") {
    headers.Result = !outcome ? "*" : !outcome.winner ? "1/2-1/2" : outcome.winner === "white" ? "1-0" : "0-1";
  }
  const name = `${headers.White ?? "White"}-vs-${headers.Black ?? "Black"}-${(headers.Date ?? today()).replace(/\./g, "-")}`
    .replace(/[^A-Za-z0-9-]+/g, "_");
  saveFile(`${name}.pgn`, writePgn(game, headers));
}

// ---------------------------------------------------------------------------
// Pop-up messages
// ---------------------------------------------------------------------------

const dialog = $<HTMLDialogElement>("dialog");

let answerDialog: ((ok: boolean) => void) | null = null;

/** Shows a message; with `ask`, also a Cancel button. Resolves true for OK.
 *  The answer comes from the button clicks themselves (and Escape), not the
 *  dialog's "close" event, which some browsers deliver late. */
function message(title: string, text: string, ask = false): Promise<boolean> {
  answerDialog?.(false); // a message still open counts as cancelled
  $("dialog-title").textContent = title;
  $("dialog-text").textContent = text;
  $("dialog-cancel").hidden = !ask;
  if (!dialog.open) dialog.showModal();
  $("dialog-ok").focus();
  return new Promise((resolve) => (answerDialog = resolve));
}

function closeDialog(ok: boolean) {
  const answer = answerDialog;
  answerDialog = null;
  dialog.close();
  answer?.(ok);
}

// ---------------------------------------------------------------------------
// Buttons and keys
// ---------------------------------------------------------------------------

function wireButtons() {
  $("dialog-ok").addEventListener("click", (event) => {
    event.preventDefault();
    closeDialog(true);
  });
  $("dialog-cancel").addEventListener("click", (event) => {
    event.preventDefault();
    closeDialog(false);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault(); // Escape
    closeDialog(false);
  });

  const steps: Record<string, () => void> = {
    first: () => goTo(0),
    back: () => goTo(currentPly() - 1),
    forward: () => goTo(currentPly() + 1),
    last: () => goTo(game.length),
  };
  for (const button of navButtons) button.addEventListener("click", () => steps[button.dataset.nav!]());
  $("flip").addEventListener("click", () => {
    orientation = opposite(orientation);
    refresh();
  });
  newButton.addEventListener("click", showMenu);
  undoButton.addEventListener("click", onUndo);
  resignButton.addEventListener("click", () => void onResign());
  reviewButton.addEventListener("click", onReviewGame);
  exitAnalysisButton.addEventListener("click", exitAnalysis);
  replyButton.addEventListener("click", () => {
    showReply = !showReply;
    refresh();
  });
  rateMovesBox.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  evalCheck.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  fenRow.addEventListener("submit", (event) => void onLoadFen(event));
  for (const control of [soundOn, soundVolume]) {
    control.addEventListener("input", () => {
      applySound();
      saveSettings();
    });
  }
  soundVolume.addEventListener("change", () => void play("move")); // let you hear the new volume
  // Browsers only play sound after the page has been touched or clicked
  document.addEventListener("pointerdown", unlockSounds, { once: true });
  document.addEventListener("keydown", unlockSounds, { once: true });
  $("open-pgn").addEventListener("click", openPgnDialog);
  $("menu-open-pgn").addEventListener("click", openPgnDialog);
  $("download-pgn").addEventListener("click", downloadPgn);
  $("pgn-cancel").addEventListener("click", () => pgnDialog.close());
  $("pgn-form").addEventListener("submit", (event) => void reviewPgnGame(event));
  pgnText.addEventListener("input", readPgnText);
  $<HTMLInputElement>("pgn-file").addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    $("pgn-file-name").textContent = file.name;
    pgnText.value = await file.text();
    readPgnText();
  });
  planModeBox.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  themeBox.addEventListener("change", () => {
    applyTheme();
    saveSettings();
  });
  toolButtons.threat.addEventListener("click", () => void startTask("threat"));
  toolButtons.plan.addEventListener("click", () => void startTask("plan"));
  toolButtons.ideas.addEventListener("click", () => void startTask("ideas"));
  toolButtons.brilliant.addEventListener("click", () => void startTask("brilliant"));
  toolButtons.quiz.addEventListener("click", onQuizButton);
  lineBack.addEventListener("click", () => stepPreview(-1));
  lineForward.addEventListener("click", () => stepPreview(1));
  lineExit.addEventListener("click", exitPreview);

  document.addEventListener("keydown", (event) => {
    if (menuOpen || dialog.open) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement || pgnDialog.open) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (preview ? stepPreview(-1) : analysis ? analysisTakeBack() : goTo(currentPly() - 1)),
      ArrowRight: () => (preview ? stepPreview(1) : goTo(currentPly() + 1)),
      Home: () => goTo(0),
      End: () => goTo(game.length),
      Escape: exitAnalysis,
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    }
  });

  // Redraw the board when its size changes (window resized, phone turned)
  new ResizeObserver(() => ground.redrawAll()).observe($("board"));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

buildMenu();
wireButtons();
refresh();
showMenu();
void loadPieces().then(refresh);
// The built site keeps a copy of itself, so it works offline (see vite.config.ts)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
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
