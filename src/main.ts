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
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, makeUci, opposite, parseSquare, parseUci } from "chessops/util";

import "@fontsource/permanent-marker/latin-400.css";
import "@lichess-org/chessground/assets/chessground.base.css";
import "./style.css";
import "./themes.css";
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
import { FALL_ANGLES, fallenKing, loadPieces, PIECE_CHOICES, setPalette } from "./pieces";
import { play, setSound, soundForMove, unlockSounds } from "./sounds";
import { brilliantCandidates, findBrilliant, missedBrilliant, type Brilliant } from "./brilliant";
import { accuracyRating, divide, gameAccuracy, phaseAccuracy, winPercent, type Phase } from "./accuracy";
import type { Score } from "./coach";
import { explainGuess, type GuessExplanation } from "./quizExplain";
import {
  Clock, formatClock, parseTimeControl, PRESETS, thinkTime, timeControlTag, type TimeControl, type Times,
} from "./clock";
import { DEMOS, demoFor, demoSteps, type Demo, type DemoStep } from "./demos";
import { runTour, tourOpen, type TourStep } from "./tour";
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
const timeControlBox = $<HTMLSelectElement>("time-control");
const tcMinutes = $<HTMLInputElement>("tc-minutes");
const tcIncrement = $<HTMLInputElement>("tc-increment");
const clockTickBox = $<HTMLInputElement>("clock-tick");
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
const demoPanel = $("demo-panel");
const gameBar = document.querySelector<HTMLElement>(".game-bar")!;
const showDemoButton = $<HTMLButtonElement>("show-demo");
const demoPlay = $<HTMLButtonElement>("demo-play");
const demoPick = $<HTMLSelectElement>("demo-pick");
const demoDialog = $<HTMLDialogElement>("demo-dialog");
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
const playerNameBox = $<HTMLInputElement>("player-name");
const uiThemeBox = $<HTMLSelectElement>("ui-theme");
const piecesBox = $<HTMLSelectElement>("pieces");
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
  explanation?: GuessExplanation; // for a wrong guess: what would really happen
  explaining?: boolean;
  lineStep?: number; // stepping through the guess played out (0 = not)
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
let clock: Clock | null = null; // the chess clock, in a match with a time control
let clockTimes: number[] = []; // each move's time left afterwards (for the PGN)
let clockHistory: Times[] = []; // the clocks after each move (for Undo)
let lastTickSecond = -1;
// An opening demo: Stockfish plays a line, pausing at the notes
interface DemoState {
  demo: Demo;
  line: number;
  steps: DemoStep[];
  playing: boolean;
  interrupted: boolean; // stopped by you (Back/Next), not by a note
  timer?: number;
}
let demo: DemoState | null = null;
let demoStepping = false; // the demo itself is moving on (not you)
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
  const line = quizLinePositions();
  if (line && quiz?.lineStep) return line[quiz.lineStep];
  const plan = previewPlan();
  return plan && preview ? plan.positions[preview.step] : base();
}

/** The positions along a wrong guess played out (your move skipped, their guess, your answer...). */
function quizLinePositions(): Chess[] | undefined {
  const explanation = quiz?.explanation;
  if (!explanation) return undefined;
  const positions = [explanation.start];
  for (const move of explanation.line) positions.push(positionAfter(positions[positions.length - 1], move));
  return positions;
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
  playerName?: string;
  uiTheme?: string;
  pieces?: string;
  timeControl?: string;
  tcMinutes?: number;
  tcIncrement?: number;
  clockTick?: boolean;
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
    playerName: playerNameBox.value.trim(),
    uiTheme: uiThemeBox.value,
    pieces: piecesBox.value,
    timeControl: timeControlBox.value,
    tcMinutes: Number(tcMinutes.value),
    tcIncrement: Number(tcIncrement.value),
    clockTick: clockTickBox.checked,
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
  for (const [value, label] of PRESETS) timeControlBox.add(new Option(label, value));
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
  if (saved.playerName) playerNameBox.value = saved.playerName;
  if (saved.timeControl) timeControlBox.value = saved.timeControl;
  if (timeControlBox.selectedIndex < 0) timeControlBox.selectedIndex = 0;
  if (saved.tcMinutes) tcMinutes.value = String(saved.tcMinutes);
  if (saved.tcIncrement !== undefined) tcIncrement.value = String(saved.tcIncrement);
  if (saved.clockTick !== undefined) clockTickBox.checked = saved.clockTick;
  applySound();
  if (themeBox.selectedIndex < 0) themeBox.selectedIndex = 0;
  // Warm stone, with its walnut board and ivory-and-espresso pieces, for anyone
  // who hasn't chosen a theme yet
  uiThemeBox.value = saved.uiTheme ?? DEFAULT_THEME;
  if (uiThemeBox.selectedIndex < 0) uiThemeBox.value = DEFAULT_THEME;
  if (!saved.uiTheme) themeBox.value = THEME_BOARDS[DEFAULT_THEME];
  for (const [value, label] of Object.entries(PIECE_CHOICES)) piecesBox.add(new Option(label, value));
  piecesBox.value = saved.pieces && PIECE_CHOICES[saved.pieces] ? saved.pieces : uiThemeBox.value;
  if (piecesBox.selectedIndex < 0) piecesBox.selectedIndex = 0;
  setPalette(piecesBox.value);
  applyUiTheme();
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
// Each look comes with a board that suits it (the Board box can still change it)
const DEFAULT_THEME = "stone";
const THEME_BOARDS: Record<string, string> = { classic: "wood", ember: "slate", stone: "walnut", violet: "lavender" };
const THEME_BARS: Record<string, string> = { classic: "#fafafa", ember: "#16181e", stone: "#9a908a", violet: "#33365e" };

/** The colours of the whole page: Classic, Midnight ember, Warm stone or Violet glass. */
function applyUiTheme() {
  const theme = uiThemeBox.value;
  document.documentElement.dataset.ui = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BARS[theme] ?? "#fafafa");
}

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
    [timeControlBox, againstStockfish],
  ];
  for (const [box, on] of usable) {
    box.disabled = !on;
    box.previousElementSibling?.classList.toggle("disabled", !on);
  }
  const custom = againstStockfish && timeControlBox.value === "custom";
  $("tc-custom").hidden = $("tc-custom-label").hidden = !custom;
  const clockOn = againstStockfish && timeControlBox.value !== "none";
  clockTickBox.disabled = !clockOn;
  clockTickBox.parentElement!.classList.toggle("disabled", !clockOn);
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
  setTimeout(() => void showTour(false), 500); // the first time only
}

/** A fresh game from a position, with nothing else going on. */
function resetBoard(newGame: Game, headers: Headers = { White: "?", Black: "?", Date: today() }) {
  gameHeaders = { ...headers };
  if (demo) clearTimeout(demo.timer);
  demo = null;
  clock = null;
  clockTimes = [];
  clockHistory = [];
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
  const you = playerName();
  gameHeaders = { White: user === "white" ? you : stockfish, Black: user === "white" ? stockfish : you, Date: today() };
  orientation = user; // your pieces at the bottom
  const control = menuTimeControl();
  if (control) {
    clock = new Clock(control);
    clock.start("white");
    clockHistory = [clock.snapshot()];
    gameHeaders.TimeControl = timeControlTag(control);
  }
  void engine.newGame();
}

/** The time control chosen in the menu (undefined = no clock). */
function menuTimeControl(): TimeControl | undefined {
  if (timeControlBox.value !== "custom") return parseTimeControl(timeControlBox.value);
  const minutes = Math.min(180, Math.max(0.25, Number(tcMinutes.value) || 10));
  const increment = Math.min(60, Math.max(0, Math.round(Number(tcIncrement.value) || 0)));
  return { base: Math.round(minutes * 60), increment };
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
  if (match && clock?.running()) {
    clockTimes[game.length - 1] = clock.moved();
    clockHistory[game.length] = clock.snapshot();
    if (game.outcome()) clock.stop();
  }
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
    const gameClock = clock;
    const target = gameClock
      ? thinkTime({
          left: gameClock.timeLeft(position.turn),
          increment: gameClock.control.increment,
          fullmoves: position.fullmoves,
          legalMoves: legalMoveCount(position),
          inCheck: position.isCheck(),
          book: move !== undefined,
        })
      : 0;
    if (move === undefined) {
      const uci = await engine.bestMove(fenOf(position), {
        skill: level.skill,
        depth: level.depth,
        // with a clock it mustn't think longer than a person would
        movetime: gameClock ? Math.min(level.seconds * 1000, Math.max(50, target * 0.7)) : level.seconds * 1000,
      });
      const parsed = parseUci(uci);
      if (!parsed || !("from" in parsed)) throw new Error(`unexpected answer "${uci}"`);
      move = parsed;
    }
    if (gameClock) {
      // Its clock runs while it "thinks" (and stops while yours is paused)
      while (match?.id === id && clock === gameClock && gameClock.running() === position.turn && gameClock.usedThisMove() < target) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } else {
      const wait = OPPONENT_MIN_DELAY * 1000 - (performance.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
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

/** Out of time: a loss - or a draw if the other side can't possibly checkmate. */
function onFlag(colour: Color) {
  if (!match || !clock) return;
  clock.stop();
  const other = opposite(colour);
  const draw = game.position.hasInsufficientMaterial(other);
  const you = colour === match.user;
  gameHeaders.Result = draw ? "1/2-1/2" : other === "white" ? "1-0" : "0-1";
  gameHeaders.Termination = "Time forfeit";
  result = draw ? "Out of time - a draw" : you ? "You ran out of time - Stockfish wins" : "Stockfish ran out of time - you win";
  const text = draw
    ? `${you ? "You" : "Stockfish"} ran out of time, but ${you ? "Stockfish" : "you"} can't checkmate with the pieces left, so it's a draw.`
    : you ? "You ran out of time - Stockfish wins." : "Stockfish ran out of time - you win!";
  endMatch(text);
}

/** The match is over: Play games can then be reviewed in Practice mode. */
function endMatch(text: string) {
  clock?.stop();
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
  if (busy || thinking || preview || menuOpen || quiz?.lineStep || demo) return undefined;
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
  if (demo && !demoStepping) {
    clearTimeout(demo.timer);
    if (demo.playing) demo.interrupted = true;
    demo.playing = false;
  }
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
  if (match && clock && clockHistory[game.length]) {
    clockHistory.length = game.length + 1;
    clockTimes.length = game.length;
    clock.restore(clockHistory[game.length], game.position.turn);
  }
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
// The feature tour
// ---------------------------------------------------------------------------

const TOUR_KEY = "chess-trainer-tour";

const BOARD_STEPS: TourStep[] = [
  { target: "#board", title: "The board",
    text: "Drag a piece to move it, or tap it and then tap where it should go." },
  { target: "#bar-top", title: "The players",
    text: "Names, the pieces each side has captured, and who is ahead in material (+3 means three pawns' worth). With a time control, the clocks are here too." },
];

const STEP_THROUGH: TourStep[] = [
  { target: ".board-nav", title: "Step through the game",
    text: "Go back and forward through the moves. You can also click a move in the list, or use the arrow keys." },
  { target: ".list-nav", title: "Step through the game",
    text: "Go back and forward through the moves. You can also click a move in the list, or use the arrow keys." },
];

const PRACTICE_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  { target: "#eval-bar", title: "Eval bar",
    text: "Who is better according to Stockfish: the more white, the better for White. You can switch it off with the Eval bar tick box." },
  { target: "#review-area", title: "Move review",
    text: "Every move gets a rating (Best, Good, Mistake...) with what was better and why. The Game report adds accuracy for the opening, middlegame, endgame and the whole game." },
  { target: "#threat-button", title: "What's the threat?",
    text: "Shows what your opponent wants to do next." },
  { target: "#plan-button", title: "Plan ahead",
    text: "Stockfish's next few moves for both sides, as numbered arrows you can step through. While practising an opening it can follow your opening instead." },
  { target: "#quiz-button", title: "Spot their idea (quiz)",
    text: "Guess your opponent's threat by playing it on the board. A wrong guess is explained: why it isn't a threat, and how it would be punished." },
  { target: "#ideas-button", title: "Explain the ideas",
    text: "The plans in the position in plain words: weak squares, outposts, pawn structure and more." },
  { target: "#brilliant-button", title: "Is there a brilliant move?",
    text: "Checks for a hidden sacrifice or a winning trick in the position." },
  { target: "#show-demo", title: "Opening demo",
    text: "Watch Stockfish play the opening you're practising, with the ideas explained." },
  ...STEP_THROUGH,
  { target: "#undo", title: "Undo",
    text: "Take back your move (and Stockfish's reply) to try something else." },
  { target: ".pgn-row", title: "PGN files",
    text: "Open a game from lichess, chess.com or a file to review it, or download this game." },
  { target: "#new-game", title: "New game and the menu",
    text: "Back to the menu: change the level, your colour, the time control, the opening to practise, or watch an opening demo. The feature tour can be found there and at the bottom of this panel." },
];

const PLAY_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  ...STEP_THROUGH,
  { target: "#resign", title: "Resign", text: "Give up the game." },
  { target: ".pgn-row", title: "PGN files",
    text: "Download this game, or open one to review it." },
  { target: "#new-game", title: "New game and the menu",
    text: "Back to the menu for a new game, Practice mode (coach, eval bar and move ratings) or an opening demo. After a game, \"Review this game\" shows how every move rated." },
];

function tourSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOUR_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** The tour for the mode on screen: automatically only the first time
 *  (unless "No thanks" was pressed without the tick), or when asked for. */
async function showTour(asked: boolean) {
  if (menuOpen || tourOpen() || demo) return;
  const which = mode;
  const seen = tourSeen();
  if (!asked && seen[which]) return;
  const end = await runTour(which === "practice" ? PRACTICE_TOUR : PLAY_TOUR, which === "practice" ? "Practice mode tour" : "Play mode tour");
  if (end.finished || end.neverAgain || asked) {
    try {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ ...seen, [which]: end.neverAgain ? "never" : "seen" }));
    } catch {
      // storage blocked: it may be offered again next time
    }
  }
  refresh();
}

/** "Show the feature tour" in the menu: back to the game (or start one), then the tour. */
function onMenuTour() {
  if (game.length === 0 && match === null) onStartGame();
  else hideMenu();
  setTimeout(() => void showTour(true), 500);
}

// ---------------------------------------------------------------------------
// Opening demos
// ---------------------------------------------------------------------------

const DEMO_MOVE_DELAY = 1100; // ms between moves while it plays on
const DEMO_START_DELAY = 2500; // time to read the introduction

function startDemo(chosen: Demo, line = 0) {
  resetBoard(new Game(), { White: "White", Black: "Black", Event: `${chosen.opening} demo`, Date: today() });
  mode = "practice";
  canReview = false;
  reviewing = false;
  // Black openings are shown from Black's side
  orientation = REPERTOIRE.find((o) => o.name === chosen.opening)?.colour ?? "white";
  demo = { demo: chosen, line: 0, steps: [], playing: true, interrupted: false };
  demoPick.replaceChildren(...chosen.lines.map((l, i) => new Option(`${i + 1}. ${l.title}`, String(i))));
  if (menuOpen) hideMenu();
  loadDemoLine(line);
}

/** Set up one line of the demo from its first move, and start playing it. */
function loadDemoLine(index: number) {
  if (!demo) return;
  clearTimeout(demo.timer);
  demo.line = index;
  demo.steps = demoSteps(demo.demo, index);
  game = new Game();
  for (const step of demo.steps) game.play(step.move);
  plyNotes = new Map();
  analysis = null;
  preview = null;
  quiz = null;
  viewPly = 0;
  demo.playing = true;
  demo.interrupted = false;
  refresh();
  scheduleDemo(DEMO_START_DELAY);
}

function scheduleDemo(delay = DEMO_MOVE_DELAY) {
  if (!demo) return;
  clearTimeout(demo.timer);
  if (demo.playing) demo.timer = window.setTimeout(demoAdvance, delay);
}

/** Autoplay: the next move, then a pause if it has a note. */
function demoAdvance() {
  if (!demo || !demo.playing) return;
  const ply = currentPly();
  if (ply >= game.length) {
    demo.playing = false;
    refresh();
    return;
  }
  demoStepping = true;
  goTo(ply + 1);
  demoStepping = false;
  if (demo.steps[ply].note || ply + 1 >= game.length) demo.playing = false; // read the note, then Continue
  refresh();
  scheduleDemo();
}

function onDemoPlay() {
  if (!demo) return;
  if (currentPly() >= game.length) {
    loadDemoLine(demo.line); // watch it again
    return;
  }
  demo.playing = !demo.playing;
  demo.interrupted = false;
  refresh();
  scheduleDemo(demo.playing ? 400 : DEMO_MOVE_DELAY);
}

function drawDemo() {
  if (!demo) return;
  const ply = currentPly();
  const line = demo.demo.lines[demo.line];
  $("demo-line").textContent = `Line ${demo.line + 1} of ${demo.demo.lines.length}: ${line.title}`;
  const note = $("demo-note");
  note.replaceChildren();
  if (ply === 0) {
    note.append(demo.line === 0 ? demo.demo.intro : `Watch how this line goes: ${line.title}.`);
  } else {
    const step = demo.steps[ply - 1];
    const label = document.createElement("span");
    label.className = "demo-move";
    label.textContent = step.label;
    note.append(label);
    const [said, transposition] = (step.note ?? "").split(/(?=Transposition: )/);
    if (said) note.append(said.trim());
    if (transposition) {
      const extra = document.createElement("span");
      extra.className = "demo-transposition";
      extra.textContent = transposition;
      note.append(extra);
    }
    if (!step.note) note.append(demo.playing ? "" : "(no note for this move)");
  }
  const atEnd = ply >= game.length;
  if (atEnd) {
    const last = document.createElement("span");
    last.className = "demo-transposition";
    last.textContent = demo.line + 1 < demo.demo.lines.length ? "End of this line. Next variation, or try it yourself." : "That's the last line. Now try it yourself!";
    note.append(last);
  }
  demoPlay.textContent = atEnd ? "↻ Watch again" : demo.playing ? "⏸ Pause" : demo.interrupted ? "▶ Resume autoplay" : ply === 0 ? "▶ Play" : "▶ Continue";
  $<HTMLButtonElement>("demo-back").disabled = ply === 0;
  $<HTMLButtonElement>("demo-next").disabled = atEnd;
  $<HTMLButtonElement>("demo-next-line").disabled = demo.line + 1 >= demo.demo.lines.length;
  demoPick.value = String(demo.line);
}

function openDemoDialog() {
  const choices = $("demo-choices");
  choices.replaceChildren(
    ...DEMOS.map((d) => {
      const button = document.createElement("button");
      button.type = "button";
      const colour = REPERTOIRE.find((o) => o.name === d.opening)?.colour === "black" ? "Black" : "White";
      button.textContent = `${d.opening} (${colour}) - ${d.lines.length} lines`;
      button.addEventListener("click", () => {
        demoDialog.close();
        startDemo(d);
      });
      return button;
    }),
  );
  demoDialog.showModal();
}

/** "Show me this opening" while practising it: leave the game for the demo. */
async function onShowDemo() {
  const chosen = demoFor(match?.myOpening?.name);
  if (!chosen) return;
  if (game.length && !(await message("Opening demo", "Watch the demo of this opening? It ends your current game.", true))) return;
  startDemo(chosen);
}

/** Try it yourself: back to the menu, set up to practise this opening. */
function onDemoTry() {
  if (!demo) return;
  const opening = REPERTOIRE.find((o) => o.name === demo!.demo.opening);
  resetBoard(new Game());
  const practice = menuCard.querySelector<HTMLInputElement>('input[name="mode"][value="practice"]');
  if (practice) practice.checked = true;
  opponentBox.selectedIndex = 0;
  if (opening) {
    colourBox.value = opening.colour === "white" ? "White" : "Black";
    myOpeningBox.value = menuName(opening);
  }
  refresh();
  showMenu();
}

function onDemoExit() {
  resetBoard(new Game());
  refresh();
  showMenu();
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
  if (!correct) void explainWrongGuess(guess);
}

async function explainWrongGuess(guess: NormalMove) {
  const asked = quiz;
  if (!asked?.threat) return;
  asked.explaining = true;
  setBusy(true, "Stockfish is checking your guess...");
  try {
    asked.explanation = await explainGuess(coachAnalysis, asked.threat, guess);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
  } finally {
    asked.explaining = false;
    setBusy(false);
    refresh();
  }
}

function stepPreview(direction: number) {
  if (quiz?.explanation) {
    const last = quiz.explanation.line.length;
    quiz.lineStep = Math.max(0, Math.min((quiz.lineStep ?? 0) + direction, last));
    refresh();
    return;
  }
  const plan = insights.get(fenOf(base()))?.plan;
  if (!plan || busy) return;
  const step = Math.max(0, Math.min((preview?.step ?? 0) + direction, plan.steps.length));
  preview = step === 0 ? null : { baseFen: fenOf(base()), step };
  refresh();
}

function exitPreview() {
  if (quiz) quiz.lineStep = 0;
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

// Ratings this harsh get a second, longer look by Stockfish before they're final
const HARSH = new Set(["Mistake", "Blunder", "Miss", "Missed Win"]);
let deepNeeded: Chess[] = []; // positions waiting for that second look

// A drop in the mover's winning chance this big (lichess's measure) also gets the second look
const BIG_DROP = 8;

function rateMove(before: Chess, move: NormalMove): Review | undefined {
  const key = `${fenOf(before)} ${makeUci(move)}`;
  let review = reviewCache.get(key);
  if (!review) {
    review = reviewMove(before, move, analyser.evals);
    if (!review) return undefined;
    const after = positionAfter(before, move);
    const checked = analyser.isDeep(before) && analyser.isDeep(after);
    const suspicious = HARSH.has(review.rating) || bigDrop(before, after);
    if (!suspicious || checked) reviewCache.set(key, review);
    else deepNeeded.push(before, after);
  }
  return review;
}

/** Did the mover's winning chance drop sharply between these positions? */
function bigDrop(before: Chess, after: Chess): boolean {
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
function moveReviews(): (Review | undefined)[] {
  deepNeeded = [];
  if (!ratingsOn()) return game.moves.map(() => undefined);
  const reviews = addMisses(game.moves.map((played, i) => rateMove(game.positionAt(i), played.move)));
  // A Miss is decided after the ratings, so make sure its positions get the second look too
  reviews.forEach((review, i) => {
    if (review?.rating === "Miss" && !(analyser.isDeep(game.positionAt(i)) && analyser.isDeep(game.positionAt(i + 1)))) {
      deepNeeded.push(game.positionAt(i), game.positionAt(i + 1));
    }
  });
  return reviews;
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
    analyser.requestDeep(deepNeeded);
  }
  analyser.request(wanted);
}

// ---------------------------------------------------------------------------
// Drawing everything
// ---------------------------------------------------------------------------

function refresh() {
  tidyState();
  const reviews = moveReviews();
  requestEval(); // (before drawing, so the review's progress line is current)
  const info = openingInfo();
  applyMode();
  drawBoard(reviews, info);
  drawPlayerBars();
  clock?.setPaused(clockShouldPause());
  drawClocks();
  drawEvalBar();
  drawMoveList(reviews, info);
  drawReview(reviews, info);
  drawTurn();
  drawButtons();
  drawCoach();
  drawDemo();
}

/** Show the parts of the page that belong to the current mode. */
function applyMode() {
  const practice = mode === "practice";
  document.body.classList.toggle("practice", practice);
  modeTitle.textContent = practice ? "Practice" : "Play";
  for (const element of [coachPanel, reviewArea, fenRow, undoButton]) element.hidden = !practice || demo !== null;
  demoPanel.hidden = demo === null;
  gameBar.hidden = demo !== null;
  if (demo) modeTitle.textContent = "Opening demo";
  showDemoButton.hidden = !(practice && match?.myOpening && demoFor(match.myOpening.name));
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
    const reply = quiz.explanation?.reply;
    if (reply && !quiz.lineStep) {
      const afterGuess = positionAfter(quiz.threat.passed, quiz.guess);
      shapes.push({ orig: makeSquare(reply.from) as Key, dest: arrowEnd(afterGuess, reply), brush: "you" });
    }
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
  const quizLine = quizLinePositions();
  if (quizLine && quiz?.lineStep) {
    const move = quiz.explanation!.line[quiz.lineStep - 1];
    last = [makeSquare(move.from) as Key, arrowEnd(quizLine[quiz.lineStep - 1], move)];
  } else if (plan && preview) {
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
  fallStyle.textContent = url ? `:root[data-pieces] .cg-wrap cg-board piece.king.${fall.colour} { background-image: url("${url}"); }` : "";
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

// ---------------------------------------------------------------------------
// The player bars: name, captured pieces and material lead
// ---------------------------------------------------------------------------

const VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const START_COUNT: Record<Role, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };
const CAPTURE_ORDER: Role[] = ["pawn", "knight", "bishop", "rook", "queen"];

/** Your name from the start menu ("You" if none is set). */
function playerName(): string {
  return playerNameBox.value.trim() || "You";
}

/** The name on a colour's bar: from the game's headers, with the rating if known. */
function barName(colour: Color): string {
  const key = colour === "white" ? "White" : "Black";
  const name = gameHeaders[key];
  if (!name || name === "?") return colour === "white" ? "White" : "Black";
  const elo = gameHeaders[`${key}Elo`];
  return elo && elo !== "?" && elo !== "-" ? `${name} (${elo})` : name;
}

function drawPlayerBars() {
  const board = shown().board;
  const material = { white: 0, black: 0 };
  for (const colour of ["white", "black"] as const) {
    for (const role of CAPTURE_ORDER) material[colour] += VALUES[role] * board.pieces(colour, role).size();
  }
  const bars: [HTMLElement, Color][] = [
    [$("bar-top"), opposite(orientation)],
    [$("bar-bottom"), orientation],
  ];
  for (const [bar, colour] of bars) {
    const name = bar.querySelector<HTMLElement>(".pb-name")!;
    name.textContent = barName(colour);
    name.title = `${name.textContent} - ${colour === "white" ? "White" : "Black"}`;
    // The pieces this side has taken (the other side's missing pieces)
    const taken = opposite(colour);
    const captured = bar.querySelector<HTMLElement>(".pb-captured")!;
    captured.replaceChildren();
    for (const role of CAPTURE_ORDER) {
      const missing = Math.max(0, START_COUNT[role] - board.pieces(taken, role).size());
      for (let i = 0; i < missing; i++) {
        const icon = document.createElement("span");
        icon.className = `mini-piece ${role} ${taken}${i === 0 && captured.childElementCount ? " gap" : ""}`;
        captured.append(icon);
      }
    }
    const lead = material[colour] - material[taken];
    bar.querySelector<HTMLElement>(".pb-diff")!.textContent = lead > 0 ? `+${lead}` : "";
  }
}

function legalMoveCount(position: Chess): number {
  let count = 0;
  for (const targets of position.allDests().values()) count += targets.size();
  return count;
}

/** Practice mode stops the clock while you use the coach, look back or
 *  analyse; both modes stop it while the menu is open. */
function clockShouldPause(): boolean {
  if (menuOpen || tourOpen()) return true;
  if (mode !== "practice") return false;
  return busy || viewPly !== null || analysis !== null || preview !== null || quiz !== null ||
    document.querySelector("dialog[open]") !== null;
}

function drawClocks() {
  const bars: [string, Color][] = [["bar-top", opposite(orientation)], ["bar-bottom", orientation]];
  for (const [id, colour] of bars) {
    const box = $(id).querySelector<HTMLElement>(".pb-clock")!;
    box.hidden = !clock;
    if (!clock) continue;
    const left = clock.timeLeft(colour);
    const running = clock.running() === colour;
    box.textContent = formatClock(left);
    box.classList.toggle("running", running);
    box.classList.toggle("low", left < 20_000);
    box.classList.toggle("paused", running && clock.isPaused());
    box.title = running && clock.isPaused() ? "Clock paused" : "";
  }
}

function clockTick() {
  if (!clock?.running()) return;
  clock.setPaused(clockShouldPause());
  const flagged = match ? clock.flagged() : null;
  if (flagged) {
    drawClocks();
    onFlag(flagged);
    return;
  }
  drawClocks();
  // A soft tick each second when you're nearly out of time
  if (match && clock.running() === match.user && !clock.isPaused() && clockTickBox.checked) {
    const left = clock.timeLeft(match.user);
    const second = Math.ceil(left / 1000);
    if (left < 10_000 && second !== lastTickSecond) {
      lastTickSecond = second;
      void play("tick");
    }
  }
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

const RATING_ORDER = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced",
  "Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"];

/** Stockfish's score for each position of the game (White's view), where known. */
function gameScores(): (Score | undefined)[] {
  return Array.from({ length: game.length + 1 }, (_, ply) => {
    const position = game.positionAt(ply);
    if (position.isCheckmate()) return { mate: position.turn === "black" ? 1 : -1 };
    if (isDrawnPosition(position)) return { cp: 0 };
    return analyser.evals.get(fenOf(position))?.score;
  });
}

/** The game report: each player's accuracy in each phase, coloured like the
 *  ratings, and how many moves got each rating. */
function drawGameReport(reviews: (Review | undefined)[], info: OpeningInfo[]) {
  const report = $("game-report");
  const body = $("game-report-body");
  report.hidden = !ratingsOn() || game.length < 4 || !!analysis;
  if (report.hidden) return;
  const positions = Array.from({ length: game.length + 1 }, (_, ply) => game.positionAt(ply));
  const scores = gameScores();
  const start = positions[0].turn;
  const overall = gameAccuracy(start, scores);
  const phases = phaseAccuracy(start, positions, scores);
  const rated = reviews.filter(Boolean).length;

  const cell = (accuracy: number | undefined) => {
    const td = document.createElement("td");
    if (accuracy === undefined || Number.isNaN(accuracy)) {
      td.textContent = "-";
    } else {
      td.textContent = `${Math.round(accuracy)}%`;
      td.className = `acc ${ratingClass(accuracyRating(accuracy))}`;
    }
    return td;
  };
  const table = document.createElement("table");
  const head = table.insertRow();
  for (const title of ["", "Opening", "Middle", "End", "Overall"]) {
    const th = document.createElement("th");
    th.textContent = title;
    head.append(th);
  }
  const names: Record<"white" | "black", string> = {
    white: gameHeaders.White && gameHeaders.White !== "?" ? gameHeaders.White : "White",
    black: gameHeaders.Black && gameHeaders.Black !== "?" ? gameHeaders.Black : "Black",
  };
  for (const colour of ["white", "black"] as const) {
    const row = table.insertRow();
    const name = document.createElement("td");
    name.textContent = names[colour];
    name.title = `${names[colour]} (${colour === "white" ? "White" : "Black"})`;
    row.append(name);
    for (const phase of ["opening", "middlegame", "endgame"] as Phase[]) row.append(cell(phases[phase][colour]));
    row.append(cell(overall[colour]));
  }

  // How many moves of each rating, per player
  const counts = document.createElement("div");
  counts.className = "counts";
  for (const colour of ["white", "black"] as const) {
    const tally = new Map<string, number>();
    game.moves.forEach((_, i) => {
      if (game.moverOf(i + 1) !== colour) return;
      const rating = info[i]?.book ? "Book" : reviews[i]?.symbol === "#" ? "Best" : reviews[i]?.rating;
      if (rating) tally.set(rating, (tally.get(rating) ?? 0) + 1);
    });
    const line = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = `${names[colour]}: `;
    line.append(label);
    RATING_ORDER.filter((r) => tally.has(r)).forEach((rating, i) => {
      if (i) line.append(" · ");
      const span = document.createElement("span");
      span.className = ratingClass(rating);
      span.textContent = `${rating} ${tally.get(rating)}`;
      line.append(span);
    });
    counts.append(line);
  }

  const division = divide(positions);
  const phaseText = document.createElement("p");
  phaseText.className = "phases";
  const moveNo = (ply: number) => game.positionAt(ply).fullmoves;
  phaseText.textContent =
    (division.middle === undefined
      ? "The game stayed in the opening phase."
      : `Middlegame from move ${moveNo(division.middle)}` +
        (division.end !== undefined ? `, endgame from move ${moveNo(division.end)}.` : "; no endgame.")) +
    (rated < game.length ? ` (Stockfish has rated ${rated} of ${game.length} moves so far.)` : "");
  body.replaceChildren(table, counts, phaseText);
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

  drawGameReport(reviews, info);
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
  if (demo) {
    turnLabel.textContent = `${demo.demo.opening} - ${demo.demo.lines[demo.line].title}`;
    return;
  }
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
  const quizLine = quizLinePositions();
  if (quizLine && quiz?.lineStep) {
    const total = quiz.explanation!.line.length;
    const move = quiz.explanation!.line[quiz.lineStep - 1];
    const san = makeSan(quizLine[quiz.lineStep - 1], move);
    const who = quiz.lineStep === 1 ? "their guessed move" : quiz.lineStep % 2 === 0 ? "you answer" : "they play";
    return `Your guess played out (not the game): move ${quiz.lineStep} of ${total}, ${who} ${san}`;
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
  if (quiz?.explanation) {
    const quizStep = quiz.lineStep ?? 0;
    lineBack.disabled = waiting || quizStep === 0;
    lineForward.disabled = waiting || quizStep >= quiz.explanation.line.length;
    lineExit.disabled = quizStep === 0;
  } else {
    lineBack.disabled = waiting || step === 0;
    lineForward.disabled = waiting || !plan || quizOpen || step >= (plan?.steps.length ?? 0);
    lineExit.disabled = preview === null;
  }

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
    const parts: HTMLElement[] = [textBlock(text, correct ? "coach-right" : "coach-wrong")];
    if (quiz.explaining) parts.push(textBlock("Stockfish is checking what your guess would do...", "coach-note"));
    if (quiz.explanation) {
      parts.push(textBlock(quiz.explanation.text));
      parts.push(textBlock("Blue arrow: your guess. Green arrow: your best answer. Use the ‹ › buttons below to play it out.", "coach-note"));
    }
    section("Quiz result", ...parts);
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
  saveFile(`${name}.pgn`, writePgn(game, headers, clockTimes));
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
  piecesBox.addEventListener("change", () => {
    setPalette(piecesBox.value);
    saveSettings();
    refresh();
  });
  uiThemeBox.addEventListener("change", () => {
    applyUiTheme();
    themeBox.value = THEME_BOARDS[uiThemeBox.value] ?? themeBox.value;
    applyTheme();
    piecesBox.value = uiThemeBox.value; // each theme has its own piece colours
    setPalette(piecesBox.value);
    saveSettings();
    refresh();
  });
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
  window.setInterval(clockTick, 100);
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
  $("menu-demo").addEventListener("click", openDemoDialog);
  $("menu-tour").addEventListener("click", onMenuTour);
  $("panel-tour").addEventListener("click", () => void showTour(true));
  showDemoButton.addEventListener("click", () => void onShowDemo());
  demoPlay.addEventListener("click", onDemoPlay);
  $("demo-back").addEventListener("click", () => goTo(currentPly() - 1));
  $("demo-next").addEventListener("click", () => goTo(currentPly() + 1));
  $("demo-next-line").addEventListener("click", () => demo && loadDemoLine(demo.line + 1));
  demoPick.addEventListener("change", () => loadDemoLine(Number(demoPick.value)));
  $("demo-try").addEventListener("click", onDemoTry);
  $("demo-exit").addEventListener("click", onDemoExit);
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
    if (menuOpen || dialog.open || tourOpen()) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement || pgnDialog.open || demoDialog.open) return;
    if (event.key === " " && event.target instanceof HTMLButtonElement) return; // the button's own click
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (preview ? stepPreview(-1) : analysis ? analysisTakeBack() : goTo(currentPly() - 1)),
      ArrowRight: () => (preview ? stepPreview(1) : goTo(currentPly() + 1)),
      Home: () => goTo(0),
      End: () => goTo(game.length),
      Escape: exitAnalysis,
      " ": () => demo && onDemoPlay(),
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

// For testing in development only (not in the published site)
if (import.meta.env.DEV) {
  (window as unknown as { trainer: unknown }).trainer = {
    analyser, game: () => game, gameScores, answerQuiz, startTask, quiz: () => quiz, parseUci, normalizeMove, base,
    boardMove: onBoardMove, clock: () => clock, clockTimes: () => clockTimes, onUndo,
    demo: () => demo, startDemo, DEMOS, demoSteps, showTour,
  };
}

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
