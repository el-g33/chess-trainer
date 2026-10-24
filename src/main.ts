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
import { makeBoardFen, makeFen, parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, makeUci, opposite, parseSquare, parseUci } from "chessops/util";

import "@fontsource/permanent-marker/latin-400.css";
import "@lichess-org/chessground/assets/chessground.base.css";
import "./style.css";
import "./themes.css";
import "./layout.css";
import { Analyser, lineMove, lineScore, type DeepMove, type SavedAnalysis } from "./analyser";
import { avatarSvg, moodForRating, type Mood } from "./avatar";
import { drawIcons, icon } from "./icons";
import { enhanceSelects, syncDropdowns } from "./dropdown";
import { badgeSvg } from "./badge";
import { afterMove as positionAfter, colourName, isCastling, standardUci, variationSan } from "./coach";
import { Engine } from "./engine";
import { Game, type Outcome } from "./game";
import { explainIdeas } from "./ideas";
import { controlledSquares, dangerAfter, moveInWords, narrateMove, quietIdea, ratingWords, targetsOf, verdict, whyMove } from "./narrate";
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
import { play, setSound, soundForMove, unlockSounds, SOUND_STYLES, type SoundStyle } from "./sounds";
import { brilliantCandidates, findBrilliant, missedBrilliant, type Brilliant } from "./brilliant";
import { accuracyRating, divide, estimateRating, gameAccuracy, phaseAccuracy, winPercent, type Phase } from "./accuracy";
import type { Score } from "./coach";
import { explainGuess, type GuessExplanation } from "./quizExplain";
import {
  Clock, formatClock, parseTimeControl, PRESETS, thinkTime, timeControlTag, type TimeControl, type Times,
} from "./clock";
import { DEMOS, demoFor, demoSteps, introMoves, type Demo, type DemoStep } from "./demos";
import { LESSONS, type Lesson, type TrainPhase } from "./lessons";
import { BANDS, likelyMoves, pickLikely, type Band, type LikelyMove } from "./explore";
import { chainOf, whatYouGet, type Mark } from "./outlook";
import { fitsIn, readingTime, splitToFit, Typer } from "./talk";
import { startLoadAnimation } from "./loading";
import { styleAlternative, type Style } from "./style";
import { runTour, tourOpen, type TourStep } from "./tour";
import { readPgn, saveFile, today, writePgn, type Headers, type PgnGame } from "./pgn";
import { addMisses, fenOf, formatScore, isDrawnPosition, isSacrifice, reviewMove, verdictWords, winningChance, type Review } from "./review";
import { gradeGuess, planAhead, threatCheck, type CoachEngine, type Plan, type Threat } from "./strategy";
import { Board } from "chessops/board";
import { defaultSetup } from "chessops/setup";
import type { Piece, Role as PieceRole } from "chessops/types";

// The styles are in (imports run first), so the page can show; the theme's
// stand-in background (see index.html) gives way to the real one
document.documentElement.classList.add("styled");
document.documentElement.style.background = "";

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
const settingsDialog = $<HTMLDialogElement>("settings-dialog");
const opponentBox = $<HTMLSelectElement>("opponent");
const levelBox = $<HTMLSelectElement>("level");
const colourBox = $<HTMLSelectElement>("colour");
const timeControlBox = $<HTMLSelectElement>("time-control");
const tcMinutes = $<HTMLInputElement>("tc-minutes");
const tcIncrement = $<HTMLInputElement>("tc-increment");
const clockTickBox = $<HTMLInputElement>("clock-tick");
const sfOpeningBox = $<HTMLSelectElement>("sf-opening");
const myOpeningBox = $<HTMLSelectElement>("my-opening");
const engineStatus = $("engine-status");
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
const showDemoButton = $<HTMLButtonElement>("show-demo");
const demoPlay = $<HTMLButtonElement>("demo-play");
const demoPick = $<HTMLSelectElement>("demo-pick");
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
const fenInput = $<HTMLInputElement>("fen");
const themeBox = $<HTMLSelectElement>("board-theme");
const soundOn = $<HTMLInputElement>("sound-on");
const soundVolume = $<HTMLInputElement>("sound-volume");
const soundStyleBox = $<HTMLSelectElement>("sound-style");
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
  ahead: NormalMove[]; // moves stepped back over (forward replays them)
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
  intro: boolean; // before play: the finished setup on the board, the coach introduces it
  timer?: number;
}
let demo: DemoState | null = null;
let demoStepping = false; // the demo itself is moving on (not you)
let canReview = false; // a finished Play game can be reviewed in Practice mode
let reviewing = false; // reviewing a Play game in Practice mode
let reviewTitle = ""; // for a game opened from PGN, e.g. "Reviewing: Carlsen - Nakamura (1-0)"
let reviewSide: Color | null = null; // a PGN game: the side you played (null: just watching)
let preparing = false; // Stockfish is checking the whole game before the review opens
let preparingSince = 0;
let stopLoading: (() => void) | null = null;
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

/** The coach's best line starting with one of these moves (all moves if none given). */
async function coachLine(position: Chess, seconds: number, first: NormalMove[] = []): Promise<{ score: Score; pv: NormalMove[] } | undefined> {
  coachEngine ??= new Engine();
  const [line] = await coachEngine.analyse(fenOf(position), seconds * 1000, 1, first.map((m) => standardUci(position, m)));
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
// Chessground remembers where the board is on the page. When the layout moves
// the board (a card opens or closes, the editor goes away) without a resize or
// scroll, that memory goes stale and touches land on the wrong squares - so
// forget it at the start of every touch or click, before chessground reads it.
for (const kind of ["mousedown", "touchstart"]) {
  $("board").addEventListener(kind, () => ground.state.dom.bounds.clear(), { capture: true, passive: true });
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

const ratingsOn = () => mode === "practice" && rateMovesBox.checked;
const evalOn = () => mode === "practice" && evalCheck.checked && !editor;
const currentPly = () => viewPly ?? game.length;
const gameMoves = () => game.moves.map((m) => m.move);

/** The real position being looked at (in analysis, the "what if" position). */
function base(): Chess {
  return analysis ? analysis.line.position : game.positionAt(currentPly());
}

/** What the board draws: a position of Stockfish's line during a preview. */
function shown(): Chess {
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

/** An empty board to explore, where you move both sides (not a loaded game). */
function freeBoard(): boolean {
  return mode === "practice" && match === null && !reviewing && !explore && !editor && !puzzle && !demo && !drill;
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
  soundStyle?: string;
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
    soundStyle: soundStyleBox.value,
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
  // The usual openings, then the unsound-but-tricky ones in their own group
  const openingNames = REPERTOIRE.filter((o) => !o.gambit).map(menuName);
  const gambitNames = REPERTOIRE.filter((o) => o.gambit).map(menuName);
  for (const [box, first] of [[sfOpeningBox, STOCKFISH_DECIDES], [myOpeningBox, NO_OPENING]] as const) {
    for (const name of [first, SUGGESTED, ...openingNames]) box.add(new Option(name));
    if (gambitNames.length) {
      const group = document.createElement("optgroup");
      group.label = "Gambits & traps";
      for (const name of gambitNames) group.append(new Option(name));
      box.append(group);
    }
  }

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
  matchColour = REPERTOIRE.find((o) => menuName(o) === myOpeningBox.value)?.colour ?? (saved.colour === "Black" ? "black" : "white");
  if (saved.rateMoves !== undefined) rateMovesBox.checked = saved.rateMoves;
  if (saved.evalBar !== undefined) evalCheck.checked = saved.evalBar;
  if (saved.boardTheme) themeBox.value = saved.boardTheme;
  if (saved.planMode) planModeBox.value = saved.planMode;
  if (planModeBox.selectedIndex < 0) planModeBox.selectedIndex = 0;
  if (saved.soundOn !== undefined) soundOn.checked = saved.soundOn;
  if (saved.soundVolume !== undefined) soundVolume.value = String(saved.soundVolume);
  for (const [value, label] of Object.entries(SOUND_STYLES)) soundStyleBox.add(new Option(label, value));
  soundStyleBox.value = saved.soundStyle && saved.soundStyle in SOUND_STYLES ? saved.soundStyle : "original";
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

  // The practice match: "None" plays without an opening of your own
  const none = myOpeningBox.options[0];
  none.value = NO_OPENING;
  none.text = "None - just play";
  menuCard.addEventListener("change", updateMenu);
  menuCard.addEventListener("submit", (event) => event.preventDefault());
  setupHome();
  updateMenu();
  enhanceSelects();
}

/** Sound effects on or off, how loud, and in which style. */
function applySound() {
  setSound(soundOn.checked, Number(soundVolume.value) / 100, soundStyleBox.value as SoundStyle);
  soundVolume.disabled = !soundOn.checked;
  soundStyleBox.disabled = !soundOn.checked;
}

/** A move's sound: a little lower when it's their move (the side at the top of the board). */
function moveSound(san: string, mover: Color) {
  void play(soundForMove(san), mover !== orientation);
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
  drawHome();
}

function showMenu() {
  menuOpen = true;
  homeChoice = null;
  greeting = pickGreeting();
  showScreen("welcome");
  menu.hidden = false;
}

// ---------------------------------------------------------------------------
// The start screens: the coach's welcome, then the setup for each mode
// ---------------------------------------------------------------------------

type HomeScreen = "welcome" | "play" | "practice" | "analysis" | "train";
type HomeChoice = "play" | "practice" | "analysis" | "train";

let homeChoice: HomeChoice | null = null;
let greeting = "";
let learnColour: Color = "white";
let matchColour: Color = "white"; // your side in a practice match
let learnOpening: string | null = null;
// Where the game on screen came from, so New game goes back to that setup
let gameOrigin: HomeChoice | "learn" | null = null;

/** Five ways to say hello, so it doesn't feel the same every time. */
function pickGreeting(): string {
  const name = playerNameBox.value.trim();
  const hi = name ? `Hi ${name}!` : "Hi!";
  const options = [
    `${hi} What are we doing today?`,
    name ? `Good to see you, ${name}. Fancy a game?` : "Good to see you. Fancy a game?",
    "Hey! Ready for some chess?",
    name ? `Welcome back, ${name}! What shall we work on?` : "Welcome back! What shall we work on?",
    `${hi} Shall we play, practise or look at a game?`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

const MODE_LINES: Record<HomeChoice, string> = {
  play: "A real game against Stockfish. No hints until it's over, then I'll go through it with you.",
  practice: "A game against Stockfish with me helping along the way: ratings, hints and plans.",
  analysis: "Got a game from lichess or chess.com? Let's look at it together.",
  train: "Openings, middlegame and endgame: short lessons, puzzles for every level, and your own positions to play out with me.",
};

// The time controls under each icon (values as in the clock's PRESETS)
const TC_KINDS: Record<string, [string, string][]> = {
  bullet: [["60+0", "1+0"], ["120+1", "2+1"]],
  blitz: [["180+0", "3+0"], ["180+2", "3+2"], ["300+0", "5+0"]],
  rapid: [["600+0", "10+0"], ["900+10", "15+10"], ["1800+0", "30+0"], ["custom", "Custom"]],
  none: [],
};

const tcKindOf = (value: string) =>
  Object.entries(TC_KINDS).find(([, presets]) => presets.some(([v]) => v === value))?.[0] ?? "none";

function showScreen(screen: HomeScreen) {
  for (const section of menu.querySelectorAll<HTMLElement>(".screen")) section.hidden = section.dataset.screen !== screen;
  // The level box is shared by the Play and Practice screens
  const slot = menu.querySelector<HTMLElement>(`.screen[data-screen="${screen}"] .slot-level`);
  if (slot && levelBox.parentElement !== slot) {
    const button = document.getElementById("level-button");
    slot.append(levelBox);
    if (button) slot.append(button); // its themed dropdown goes with it
  }
  drawHome();
}

/** How strictly Stockfish follows its opening at this level, in a line. */
function stickinessNote(): string {
  const level = levelBox.selectedIndex;
  const name = shortName(LEVELS[level]);
  if (level <= 2) return `At ${name} level Stockfish sticks to its opening even when that costs it a little.`;
  if (level <= 4) return `At ${name} level Stockfish keeps to its opening unless that would cost it material.`;
  return `At ${name} level Stockfish only plays its opening moves when they're as good as anything else, and punishes mistakes.`;
}

function drawHome() {
  // Welcome
  setFace($("home-face"), homeChoice ? "talk" : "wave", 96);
  $("home-bubble").textContent = homeChoice ? MODE_LINES[homeChoice] : greeting;
  for (const button of menu.querySelectorAll<HTMLButtonElement>(".mode-choice")) {
    const on = button.dataset.choice === homeChoice;
    button.classList.toggle("on", on);
    button.setAttribute("aria-checked", String(on));
  }
  $<HTMLButtonElement>("home-next").disabled = !homeChoice;
  syncDropdowns();

  // Play
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#colour-seg button")) {
    button.classList.toggle("on", button.dataset.colour === colourBox.value);
  }
  const kind = tcKindOf(timeControlBox.value);
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#tc-kinds button")) {
    button.classList.toggle("on", button.dataset.kind === kind);
  }
  const chips = $("tc-presets");
  chips.replaceChildren(...TC_KINDS[kind].map(([value, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    chip.classList.toggle("on", value === timeControlBox.value);
    chip.addEventListener("click", () => {
      timeControlBox.value = value;
      saveSettings();
      drawHome();
    });
    return chip;
  }));
  chips.hidden = !TC_KINDS[kind].length;
  $("tc-custom").hidden = timeControlBox.value !== "custom";

  // Training: the openings (White or Black)
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#learn-colour button")) {
    button.classList.toggle("on", button.dataset.colour === learnColour);
  }
  const tiles = $("opening-tiles");
  tiles.replaceChildren(...DEMOS.filter((d) => REPERTOIRE.find((o) => o.name === d.opening)?.colour === learnColour).map((d) => {
    const opening = REPERTOIRE.find((o) => o.name === d.opening)!;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.classList.toggle("on", d.opening === learnOpening);
    tile.innerHTML = `<span class="tile-name"></span><span class="tile-note"></span>`;
    tile.querySelector(".tile-name")!.textContent = d.opening.replace(/ \(.*\)$/, "");
    tile.querySelector(".tile-note")!.textContent = opening.gambit ? "Gambit and traps" : "";
    tile.addEventListener("click", () => {
      learnOpening = d.opening;
      gameOrigin = "learn";
      startDemo(d);
    });
    return tile;
  }));
  // Practice match
  // Your side decides the openings on offer: yours for your side, Stockfish's for the other
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#match-colour button")) {
    button.classList.toggle("on", button.dataset.colour === matchColour);
  }
  for (const [box, side] of [[myOpeningBox, matchColour], [sfOpeningBox, opposite(matchColour)]] as const) {
    for (const option of box.querySelectorAll("option")) {
      const opening = REPERTOIRE.find((o) => menuName(o) === option.value);
      option.hidden = !!opening && opening.colour !== side;
    }
    if (box.selectedOptions[0]?.hidden) box.selectedIndex = 0;
  }
  $("practice-note").textContent = stickinessNote();
  menu.querySelector<HTMLButtonElement>('[data-start="practice"]')!.disabled = false;

  // Analysis
  menu.querySelector<HTMLButtonElement>('[data-start="analysis"]')!.disabled = !pgnGames.length && !fenPosition;

  // Train
  drawTrainScreen();
}

function setupHome() {
  drawIcons();
  for (const button of menu.querySelectorAll<HTMLButtonElement>(".mode-choice")) {
    button.addEventListener("click", () => {
      homeChoice = button.dataset.choice as HomeChoice;
      drawHome();
    });
  }
  $("home-next").addEventListener("click", () => homeChoice && showScreen(homeChoice));
  setupTrain();
  for (const button of menu.querySelectorAll<HTMLButtonElement>(".setup-back")) {
    button.addEventListener("click", () => showScreen("welcome"));
  }
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#colour-seg button")) {
    button.addEventListener("click", () => {
      colourBox.value = button.dataset.colour!;
      saveSettings();
      drawHome();
    });
  }
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#tc-kinds button")) {
    button.addEventListener("click", () => {
      const presets = TC_KINDS[button.dataset.kind!];
      if (tcKindOf(timeControlBox.value) !== button.dataset.kind) timeControlBox.value = presets[0]?.[0] ?? "none";
      saveSettings();
      drawHome();
    });
  }
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#match-colour button")) {
    button.addEventListener("click", () => {
      matchColour = button.dataset.colour as Color;
      drawHome();
      saveSettings();
    });
  }
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#learn-colour button")) {
    button.addEventListener("click", () => {
      learnColour = button.dataset.colour as Color;
      learnOpening = null;
      drawHome();
    });
  }
  for (const box of [levelBox, sfOpeningBox, myOpeningBox, tcMinutes, tcIncrement]) {
    box.addEventListener("change", () => {
      saveSettings();
      drawHome();
    });
  }
  menu.querySelector('[data-start="play"]')!.addEventListener("click", () => startFromHome("play"));
  menu.querySelector('[data-start="practice"]')!.addEventListener("click", () => startFromHome("practice"));
  menu.querySelector('[data-start="analysis"]')!.addEventListener("click", (event) => void startAnalysis(event));
  $("empty-board").addEventListener("click", () => {
    mode = "practice";
    resetBoard(new Game());
    gameOrigin = "analysis";
    orientation = "white";
    canReview = false;
    reviewing = false;
    hideMenu();
    refresh();
  });
}

function setMode(value: Mode) {
  const radio = menuCard.querySelector<HTMLInputElement>(`input[name="mode"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function startFromHome(kind: "play" | "practice") {
  gameOrigin = kind;
  setMode(kind);
  opponentBox.selectedIndex = 0;
  if (kind === "practice") {
    colourBox.value = matchColour === "white" ? "White" : "Black";
  }
  saveSettings();
  onStartGame();
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
  currentGameId = null;
  puzzle = null;
  drill = null;
  editor = null;
  lesson = null;
  explore = null;
  fromStats = false;
  stepper = null;
  closeOverlay(false);
  currentView = "board";
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
  void play("start");
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
  const control = mode === "play" ? menuTimeControl() : undefined;
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
  stepper = null;
  closeOverlay(false);
  if (match && clock?.running()) {
    clockTimes[game.length - 1] = clock.moved();
    clockHistory[game.length] = clock.snapshot();
    if (game.outcome()) clock.stop();
  }
  const last = game.moves[game.length - 1];
  if (last) moveSound(last.san, opposite(game.position.turn));
  // (checkmate has its own sound)
  if (!match && game.outcome() && !last?.san.includes("#")) setTimeout(() => void play("gameover"), 350);
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
  recordGame();
  clock?.stop();
  if (!game.moves[game.length - 1]?.san.includes("#")) void play("gameover"); // (checkmate has its own sound)
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
  currentView = "stats"; // the statistics first, then the review from move 1
  viewPly = game.length ? 0 : null;
  startPreparing();
  refresh();
}

/** Watching a game you didn't play: the coach says "White" and "Black", not "you". */
const watching = () => reviewing && reviewTitle !== "" && reviewSide === null;

// -- The load screen: Stockfish checks everything before the review --------------

const PREP_MIN_MS = 2500; // long enough to see the animation once Stockfish has work to do
let prepWorked = false; // Stockfish had something to check (a game seen before opens at once)

function startPreparing() {
  if (!rateMovesBox.checked) return;
  restoreAnalysis();
  prepWorked = false;
  preparing = true;
  preparingSince = performance.now();
  stopLoading?.();
  stopLoading = startLoadAnimation($("prep-stage"), $("prep-caption"));
  $("prep-screen").hidden = false;
}

function stopPreparing() {
  preparing = false;
  stopLoading?.();
  stopLoading = null;
  $("prep-screen").hidden = true;
}

/** Once every move has its final rating (the second looks included), the
 *  load screen gives way to the statistics. */
function drawPrep(list: (Review | undefined)[]) {
  if (!preparing) return;
  const { done, total } = analyser.progress();
  const finished = done >= total && !deepNeeded.length && !deepMoves.length && list.every(Boolean);
  if (!finished) {
    prepWorked = true;
    return;
  }
  const wait = prepWorked ? PREP_MIN_MS - (performance.now() - preparingSince) : 0;
  if (wait > 0) {
    setTimeout(refresh, wait);
    return;
  }
  keepAnalysis();
  stopPreparing();
  currentView = "stats";
  applyView();
}

// -- Games reviewed before: their analysis is kept, so they open at once -----------

const ANALYSIS_KEY = "chess-trainer-analysis"; // { game key: SavedAnalysis }, oldest first
const ANALYSIS_KEEP = 40; // games

/** The positions of the game on the board. */
function gameFens(): Set<string> {
  const fens = new Set<string>();
  for (let ply = 0; ply <= game.length; ply++) fens.add(fenOf(game.positionAt(ply)));
  return fens;
}

/** A short key for the game: its positions, hashed. */
function gameKey(): string {
  let hash = 2166136261;
  const text = [...gameFens()].join("|");
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `g${(hash >>> 0).toString(36)}-${game.length}`;
}

function savedAnalyses(): Record<string, SavedAnalysis> {
  try {
    return JSON.parse(localStorage.getItem(ANALYSIS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** A game reviewed before: what Stockfish found then. */
function restoreAnalysis() {
  if (!game.length) return;
  const saved = savedAnalyses()[gameKey()];
  if (saved) analyser.restore(saved);
}

/** Keep this game's analysis (the most recent games only). */
function keepAnalysis() {
  if (!game.length) return;
  const all = savedAnalyses();
  const key = gameKey();
  delete all[key];
  // the game's positions, and the ones after each best (and second best) move, which the ratings use too
  const fens = gameFens();
  for (let ply = 0; ply <= game.length; ply++) {
    const position = game.positionAt(ply);
    const found = analyser.evals.get(fenOf(position));
    for (const move of [found?.best, found?.second]) if (move && position.isLegal(move)) fens.add(fenOf(positionAfter(position, move)));
  }
  all[key] = analyser.save(fens);
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - ANALYSIS_KEEP))) delete all[old];
  try {
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the game just takes a moment to check next time
  }
}

let gradeJump = { key: "", next: 0 };
let silentJump = false; // from the statistics: the top bubble says nothing, the card below does the talking
let fromStats = false; // jumped to a move from the statistics: a bar leads back

/** The move ratings with the opening's known moves rated Book, as the board's badges show them. */
function withBook(list: (Review | undefined)[]): (Review | undefined)[] {
  const info = openingInfo();
  return list.map((review, i) => (review && info[i]?.book ? { ...review, rating: "Book" } : review));
}

/** From the statistics: the next move of this grade by this side, on the board, explained. */
function jumpToGrade(colour: Color, grade: string, list: (Review | undefined)[]) {
  const plies = list.flatMap((review, i) => (review?.rating === grade && game.moverOf(i + 1) === colour ? [i + 1] : []));
  if (!plies.length) return;
  const key = `${colour}:${grade}`;
  if (gradeJump.key !== key) gradeJump = { key, next: 0 };
  const ply = plies[gradeJump.next % plies.length];
  gradeJump.next++;
  currentView = "board";
  stepper = null;
  // the position before the move first, then the move plays in with its explanation
  goTo(ply - 1);
  silentJump = true;
  fromStats = true;
  refresh();
  const review = list[ply - 1]!;
  setTimeout(() => {
    if (silentJump && currentPly() === ply - 1 && !stepper) explainMove(ply, review);
  }, GRADE_JUMP_PAUSE);
}

const GRADE_JUMP_PAUSE = 1000; // ms on the position before the move

/** The bar back to the statistics, while you're on the board after a jump. */
function drawStatsBack() {
  if (!reviewing) fromStats = false;
  const show = fromStats && currentView === "board" && !analysis && !demo;
  $("stats-back-bar").hidden = !show;
  document.querySelector(".board-area")!.classList.toggle("statsback", show);
}

function backToStats() {
  fromStats = false;
  silentJump = false;
  stepper = null;
  currentView = "stats";
  refresh();
}

/** Start going through the game, from the first move. */
function startReview() {
  currentView = "board";
  stepper = null;
  goTo(0);
}

async function onResign() {
  if (!match) return;
  if (!(await message("Resign?", "Are you sure you want to resign this game?", true))) return;
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
  if (busy || thinking || preview || menuOpen || quiz?.lineStep || demo || stepper || overlayOpen() || editor) return undefined;
  if (drill) {
    return drill.state === "playing" && !drill.waiting && viewPly === null && game.position.turn === drill.user ? drill.user : undefined;
  }
  if (puzzle) {
    return puzzle.state === "solving" && viewPly === null && game.length > 0 && game.position.turn === puzzle.side ? puzzle.side : undefined;
  }
  if (quizWaiting()) return quiz!.threat!.them;
  if (analysing()) return base().turn;
  if (viewPly !== null) return undefined; // looking back in Play mode
  if (match) return game.position.turn === match.user ? match.user : undefined;
  return game.outcome() ? undefined : game.position.turn; // a free board
}

function onBoardMove(from: Key, to: Key) {
  if (editor) return; // setting up a position: editorSync keeps track
  const position = clickPosition();
  const given: NormalMove = { from: parseSquare(from)!, to: parseSquare(to)! };
  // Pawns reaching the last rank always become queens (as in the desktop app)
  if (position.board.get(given.from)?.role === "pawn" && (to[1] === "8" || to[1] === "1")) given.promotion = "queen";
  const move = normalizeMove(position, given) as NormalMove;
  if (drill) {
    drillMove(move);
  } else if (puzzle) {
    puzzleMove(move);
  } else if (quizWaiting()) {
    answerQuiz(move);
  } else if (explore) {
    exploreMove(given);
  } else if (freeBoard() && viewPly !== null && !analysis) {
    // An empty board to explore: going back and moving takes the later moves back
    const from = currentPly();
    while (game.length > from) game.undo();
    game.play(given);
    afterMove();
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
    analysis = { fromPly: currentPly(), line: new Game(fenOf(base())), ahead: [] };
    quiz = null;
  }
  const played = analysis.line.play(move);
  analysis.ahead = []; // a new move replaces the ones stepped back over
  moveSound(played.san, opposite(analysis.line.position.turn));
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
  if (!analysis || !analysis.line.length) return;
  const undone = analysis.line.moves[analysis.line.length - 1].move;
  analysis.line.undo();
  analysis.ahead.unshift(undone);
  preview = null;
  refresh();
}

function analysisForward() {
  if (!analysis || !analysis.ahead.length) return;
  const played = analysis.line.play(analysis.ahead.shift()!);
  moveSound(played.san, opposite(analysis.line.position.turn));
  preview = null;
  refresh();
}

/** The step buttons and arrow keys: in a What-if they move through the
 *  What-if moves, never the game. */
function navigate(where: "first" | "back" | "forward" | "last") {
  if (analysis) {
    if (where === "back") analysisTakeBack();
    else if (where === "forward") analysisForward();
    else if (where === "first") while (analysis.line.length) analysisTakeBack();
    else while (analysis.ahead.length) analysisForward();
    return;
  }
  if (where === "first") goTo(0);
  else if (where === "back") goTo(currentPly() - 1);
  else if (where === "forward") goTo(currentPly() + 1);
  else goTo(game.length);
}

function drawWhatIf() {
  const bar = $("whatif-bar");
  bar.hidden = !analysis;
  document.querySelector(".board-area")!.classList.toggle("whatif", analysis !== null);
  if (!analysis) return;
  $("whatif-text").textContent = "Analysis board";
}

function exitAnalysis() {
  if (!analysis) return;
  analysis = null;
  preview = null;
  refresh();
}

// -- Stepping through the game ------------------------------------------------

function goTo(ply: number) {
  stepper = null;
  silentJump = false;
  if (demo && !demoStepping) {
    clearTimeout(demo.timer);
    if (demo.playing) demo.interrupted = true;
    demo.playing = false;
    if (demo.intro) {
      // out of the introduction's setup and into the line itself
      demo.intro = false;
      game = new Game();
      for (const step of demo.steps) game.play(step.move);
    }
  }
  if (replaying && !replayStepping) replaying = false;
  ply = Math.max(0, Math.min(ply, game.length));
  if (ply === currentPly() + 1 && !analysis) moveSound(game.moves[ply - 1].san, game.positionAt(ply - 1).turn);
  analysis = null; // moving through the game leaves any analysis line
  viewPly = ply === game.length ? null : ply;
  refresh();
  if (explore && viewPly === null) autoReply(); // back at the end: they carry on
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

let fenPosition: Chess | null = null; // the position typed on the analysis screen, if it's valid

/** Check the position box on the analysis screen. */
function readFen() {
  const text = fenInput.value.trim();
  fenPosition = null;
  if (text) {
    try {
      fenPosition = Chess.fromSetup(parseFen(text).unwrap()).unwrap();
    } catch {
      fenPosition = null;
    }
  }
  const status = $("fen-status");
  status.classList.toggle("problem", !!text && !fenPosition);
  status.textContent = !text ? "" : fenPosition ? `A position with ${colourName(fenPosition.turn)} to move.` : "That doesn't look like a valid FEN position.";
}

/** Explore the position from the analysis screen. */
function loadFenPosition() {
  if (!fenPosition) return;
  mode = "practice";
  resetBoard(new Game(fenOf(fenPosition)));
  gameOrigin = "analysis";
  orientation = fenPosition.turn;
  canReview = false;
  reviewing = false;
  if (menuOpen) hideMenu();
  refresh();
}

/** Start on the analysis screen: the game, the position, or ask which. */
async function startAnalysis(event: Event) {
  event.preventDefault();
  const both = pgnGames.length > 0 && fenPosition !== null;
  let choice: string = pgnGames.length ? "pgn" : "fen";
  if (both) {
    // (resolved from the buttons: some browsers don't send the dialog's close event)
    const ask = $<HTMLDialogElement>("load-choice");
    ask.showModal();
    choice = await new Promise<string>((resolve) => {
      const buttons = [...ask.querySelectorAll<HTMLButtonElement>("button[value]")];
      const done = (value: string) => {
        for (const button of buttons) button.onclick = null;
        ask.oncancel = null;
        ask.close();
        resolve(value);
      };
      for (const button of buttons) {
        button.onclick = (event) => {
          event.preventDefault();
          done(button.value);
        };
      }
      ask.oncancel = (event) => {
        event.preventDefault();
        done("cancel");
      };
    });
  }
  if (choice === "pgn") void reviewPgnGame(event);
  else if (choice === "fen") loadFenPosition();
}

// ---------------------------------------------------------------------------
// The feature tour
// ---------------------------------------------------------------------------

const TOUR_KEY = "chess-trainer-tour";

const BOARD_STEPS: TourStep[] = [
  { target: "#board", title: "The board",
    text: "Drag a piece to move it, or tap it and then tap where it should go." },
  { target: "#coach-strip", title: "Your coach",
    text: "I sit up here and say what I think of each move in a line. The rating icon on the board shows which move I mean." },
  { target: "#bar-top", title: "The players",
    text: "Names, the pieces each side has captured, and who is ahead in material. With a time control, the clocks are here too." },
];

const PRACTICE_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  { target: "#strip-actions", title: "Tell me more, and Strategy",
    text: "The dots open the full explanation, and what your opponent can do next. The target shows the main idea: your opening's plan or Stockfish's, one move at a time, with a quiz." },
  { target: "#eval-bar", title: "Eval bar",
    text: "Who is better according to Stockfish. You can switch it off in the settings." },
  { target: ".board-controls", title: "Moving through the game",
    text: "Step back and forward, take back your move, flip the board, or resign with the white flag." },
  { target: "#move-strip", title: "The moves",
    text: "Swipe sideways to see every move; tap one to go to it." },
  { target: ".moves-area", title: "The moves",
    text: "Every move of the game, coloured by its rating. Click one to go to it." },
  { target: ".view-tabs", title: "Statistics and history",
    text: "See each player's accuracy and an estimated rating for this game, and your record against Stockfish." },
  { target: ".game-top .gear-button", title: "Settings",
    text: "Theme, board, pieces, sounds, your name, and more." },
  { target: "#new-game", title: "New game",
    text: "Start again in the mode you're in: a new game, match, review or lesson. The feature tour is in the settings if you'd like to see it again." },
];

const DEMO_TOUR: TourStep[] = [
  { target: "#bar-top", title: "The line",
    text: "The opening and the line you're watching, for example the main line or a variation." },
  { target: "#coach-strip", title: "Your coach",
    text: "I explain each idea as the moves are played. Tap the dots to read the full note." },
  { target: "#board", title: "The board", text: "The moves play out here, one at a time." },
  { target: ".board-controls", title: "Play, pause and step",
    text: "Step back and forward, play or pause in the middle, and jump to the previous or next variation." },
  { target: ".list-nav", title: "Play, pause and step",
    text: "Step back and forward, with play and pause in the middle." },
  { target: ".demo-vars", title: "Variations", text: "Jump to the previous or next variation of this opening." },
  { target: "#new-game", title: "New game", text: "Choose another opening, or practise this one in a match." },
];

const STATS_TOUR: TourStep[] = [
  { target: ".stats-card", title: "Accuracy",
    text: "How accurately each player played: over the whole game, then the opening, middlegame and endgame. Tap More for a count of every grade." },
  { target: ".rating-card", title: "Rating",
    text: "Roughly how strongly each side played in this game, judged by how much they gave away move by move." },
  { target: ".stats-start", title: "The review", text: "Go through the game move by move, from the start." },
  { target: ".view-tabs", title: "Tabs", text: "Back to the board, or on to your game history." },
];

const HISTORY_TOUR: TourStep[] = [
  { target: ".history-colours", title: "Your colour", text: "Show all your games, or only those as White or Black." },
  { target: ".history-record", title: "Your record",
    text: "Wins, draws and losses. Tap them to show only those games; they combine with the colour." },
  { target: ".history-list", title: "Your games", text: "Tap a game to replay it with me." },
];

const PLAY_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  { target: ".board-controls", title: "Moving through the game",
    text: "Step back to look at earlier moves, flip the board, or resign with the white flag." },
  { target: ".view-tabs", title: "Statistics and history",
    text: "After the game: accuracy and an estimated rating, and your record against Stockfish." },
  { target: ".game-top .gear-button", title: "Settings",
    text: "Theme, board, pieces, sounds, your name, and more." },
  { target: "#new-game", title: "New game",
    text: "Back to the start. After a game I'll offer to go through it with you." },
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
  if (menuOpen || tourOpen() || (demo && !asked)) return;
  const which = mode;
  const seen = tourSeen();
  if (!asked && seen[which]) return;
  const [steps, title] = currentView === "stats" ? [STATS_TOUR, "Statistics"]
    : currentView === "history" ? [HISTORY_TOUR, "Game history"]
    : demo ? [DEMO_TOUR, "Learn an opening"]
    : which === "practice" ? [PRACTICE_TOUR, "Practice mode tour"] : [PLAY_TOUR, "Play mode tour"];
  const end = await runTour(steps, title);
  if (end.finished || end.neverAgain || asked) {
    try {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ ...seen, [which]: end.neverAgain ? "never" : "seen" }));
    } catch {
      // storage blocked: it may be offered again next time
    }
  }
  refresh();
}

/** The ? button: About, and (in a game) a tour of the screen you're on. */
function toggleHelp(anchor: HTMLElement) {
  const box = $("help-menu");
  if (!box.hidden) {
    box.hidden = true;
    return;
  }
  box.replaceChildren();
  const item = (text: string, run: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = text;
    button.addEventListener("click", () => {
      box.hidden = true;
      run();
    });
    box.append(button);
  };
  if (!menuOpen) item("Show me around this screen", () => void showTour(true));
  item("About and licences", () => window.open("./about.html", "_blank"));
  const rect = anchor.getBoundingClientRect();
  box.hidden = false;
  box.style.top = `${rect.bottom + 6}px`;
  box.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
}


// ---------------------------------------------------------------------------
// Train: principles, puzzles and your own positions
// ---------------------------------------------------------------------------

type PuzzleLevel = "beginner" | "club" | "advanced" | "expert" | "master";
const PUZZLE_LEVELS: [PuzzleLevel, string][] = [["beginner", "Beginner"], ["club", "Club"], ["advanced", "Advanced"], ["expert", "Expert"], ["master", "Master"]];
type PuzzleRow = [id: string, fen: string, moves: string, rating: number, themes: string];

let trainPhase: TrainPhase = "middlegame";
let trainTab: "openings" | TrainPhase = "openings"; // the tab on screen (openings, or a phase)
let puzzleLevel: PuzzleLevel = "club";
// The puzzle sets: opening traps, and the middlegame and endgame
type PuzzleSet = "openings" | TrainPhase;
const puzzleFiles = new Map<PuzzleSet, Promise<Record<PuzzleLevel, PuzzleRow[]>>>();

interface PuzzleState {
  phase: PuzzleSet;
  level: PuzzleLevel;
  list: PuzzleRow[];
  index: number;
  side: Color; // you solve for this side
  solution: NormalMove[]; // your moves and the replies, after the opening move
  step: number; // the next solution move expected
  state: "solving" | "solved" | "shown";
  missed: boolean; // a wrong try (the streak is lost)
  hints: number;
  themes: string[];
  streak: number;
  note: string; // what the coach says now
}

let puzzle: PuzzleState | null = null;
// Your position: the coach helps you analyse it. You play your side, and the
// other side is played by you or by "an opponent" of the chosen strength.
interface ExploreState {
  user: Color;
  band: Band;
  auto: boolean; // they reply by themselves after your move (pause to move for them)
  thinking: boolean; // their reply is being chosen (the board stays free meanwhile)
}

const AUTO_REPLY_DELAY = 1800; // ms: time to see your move's rating first
let explore: ExploreState | null = null;
let exploreBand: Band = "club";

function loadPuzzles(phase: PuzzleSet) {
  if (!puzzleFiles.has(phase)) {
    puzzleFiles.set(phase, fetch(`${import.meta.env.BASE_URL}puzzles/${phase}.json`).then((r) => r.json()));
  }
  return puzzleFiles.get(phase)!;
}

function drawTrainScreen() {
  for (const tab of menu.querySelectorAll<HTMLButtonElement>("[data-train-tab]")) {
    const on = tab.dataset.trainTab === trainTab;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-selected", String(on));
  }
  // Openings: the lessons by colour and the opening traps; the phases: principles
  // and puzzles. Your position is on every tab.
  const openings = trainTab === "openings";
  $("train-openings").hidden = !openings;
  $("train-principles").hidden = openings;
  $("puzzles-title").textContent = openings ? "Opening traps" : "Puzzles";
  $("puzzles-note").textContent = openings
    ? "Tricks from the first moves of real games. Choose a level, then spot as many as you can."
    : "Choose a level, then solve as many as you like.";
  const lessons = LESSONS[trainPhase];
  $("principles-note").textContent = lessons.length
    ? `${lessons.length} short lessons on how to play the ${trainPhase}.`
    : `The ${trainPhase} lessons are being written.`;
  const chips = $("puzzle-levels");
  chips.replaceChildren(...PUZZLE_LEVELS.map(([value, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    chip.classList.toggle("on", value === puzzleLevel);
    chip.addEventListener("click", () => {
      puzzleLevel = value;
      drawTrainScreen();
    });
    return chip;
  }));
}

function setupTrain() {
  for (const tab of menu.querySelectorAll<HTMLButtonElement>("[data-train-tab]")) {
    tab.addEventListener("click", () => {
      trainTab = tab.dataset.trainTab as "openings" | TrainPhase;
      if (trainTab !== "openings") trainPhase = trainTab;
      $("lesson-list").hidden = true;
      $("train-cards").hidden = false;
      drawTrainScreen();
    });
  }
  $("start-puzzles").addEventListener("click", () => void startPuzzles(trainTab, puzzleLevel));
  $("train-position").addEventListener("click", () => startEditor());
  $("train-principles").addEventListener("click", showLessonList);
  // The editor
  ground.set({ events: { select: (key) => editorTap(key), change: editorSync } });
  $("editor-empty").addEventListener("click", () => editorLoad("8/8/8/8/8/8/8/8 w - - 0 1"));
  $("editor-start").addEventListener("click", () => editorLoad(makeFen(defaultSetup())));
  $("editor-paste").addEventListener("click", openPaste);
  $("editor-done").addEventListener("click", () => void editorDone());
  for (const button of document.querySelectorAll<HTMLButtonElement>("#editor-turn button")) {
    button.addEventListener("click", () => {
      if (!editor) return;
      editor.turn = button.dataset.turn as Color;
      refresh();
    });
  }
}

// -- Puzzles -------------------------------------------------------------------

const THEME_HINTS: [string, string][] = [
  ["mateIn1", "There's a checkmate in one."],
  ["mateIn2", "There's a checkmate in two moves. Start with a forcing move."],
  ["mateIn3", "There's a forced mate. Checks first!"],
  ["fork", "Look for a fork: one piece attacking two things at once."],
  ["pin", "Look for a pin: a piece that can't move without exposing something bigger."],
  ["skewer", "Look for a skewer: attack a big piece so it moves and uncovers another."],
  ["discoveredAttack", "Move one piece out of the way to uncover an attack by another."],
  ["doubleCheck", "A double check: the king has to move."],
  ["hangingPiece", "Something is left undefended. Find it."],
  ["trappedPiece", "One of their pieces has nowhere to go."],
  ["deflection", "Pull a defender away from what it's guarding."],
  ["attraction", "Lure a piece (or the king) onto a bad square."],
  ["sacrifice", "Don't be afraid to give up material for a bigger gain."],
  ["promotion", "A pawn wants to become a queen."],
  ["advancedPawn", "An advanced pawn is the key."],
  ["zugzwang", "They'd love to pass. Find a waiting move that leaves them stuck."],
  ["quietMove", "It's not a check or a capture: a quiet move wins."],
  ["defensiveMove", "First stop their threat."],
  ["intermezzo", "Before recapturing, is there something stronger in between?"],
  ["kingsideAttack", "Go for the king."],
  ["rookEndgame", "Activate your rook: it belongs behind passed pawns."],
  ["pawnEndgame", "Count the moves: king activity and the opposition decide pawn endgames."],
];

function puzzleHint(themes: string[]): string {
  return THEME_HINTS.find(([theme]) => themes.includes(theme))?.[1] ?? "Look at checks, captures and threats first.";
}

async function startPuzzles(phase: PuzzleSet, level: PuzzleLevel, themes: string[] = []) {
  const all = await loadPuzzles(phase);
  let list = all[level];
  if (themes.length) {
    const wanted = Object.values(all).flat().filter((row) => themes.some((t) => row[4].split(" ").includes(t)));
    if (wanted.length) list = wanted;
  }
  // a different order each time
  list = [...list].sort(() => Math.random() - 0.5);
  const streak = puzzle?.streak ?? 0;
  puzzle = { phase, level, list, index: -1, side: "white", solution: [], step: 0, state: "solving", missed: false, hints: 0, themes: [], streak, note: "" };
  showPuzzle(0);
}

function showPuzzle(index: number) {
  if (!puzzle) return;
  const keep = puzzle;
  const row = keep.list[index % keep.list.length];
  const [, fen, moves] = row;
  const all = moves.split(" ").map((uci) => parseUci(uci) as NormalMove);
  mode = "play"; // no eval bar or ratings to give it away
  resetBoard(new Game(fen), { White: "?", Black: "?", Event: "Puzzle" });
  puzzle = keep;
  gameOrigin = "train";
  currentView = "board";
  const start = game.position.clone();
  start.play(all[0]);
  Object.assign(puzzle, {
    index, side: start.turn, solution: all.slice(1), step: 0, state: "solving", missed: false, hints: 0,
    themes: row[4].split(" "), note: `${colourName(start.turn)} to move. Find the best move.`,
  });
  orientation = start.turn;
  if (menuOpen) hideMenu();
  refresh();
  // Their move first, then it's your turn
  setTimeout(() => {
    if (!puzzle || puzzle.index !== index) return;
    const played = game.play(all[0]);
    moveSound(played.san, opposite(game.position.turn));
    refresh();
  }, 600);
}

function puzzleMove(move: NormalMove) {
  if (!puzzle || puzzle.state !== "solving") return;
  const expected = puzzle.solution[puzzle.step];
  const after = game.position.clone();
  after.play(move);
  const right = makeUci(move) === makeUci(expected) || after.isCheckmate();
  if (!right) {
    // Show the try, then take it back
    const played = game.play(move);
    moveSound(played.san, opposite(game.position.turn));
    puzzle.missed = true;
    puzzle.streak = 0;
    puzzle.note = "Not quite. Try again, or tap the bulb for a hint.";
    refresh();
    setTimeout(() => {
      game.undo();
      void play("illegal");
      refresh();
    }, 700);
    return;
  }
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  puzzle.step++;
  if (puzzle.step >= puzzle.solution.length || after.isCheckmate()) {
    puzzleSolved();
    return;
  }
  puzzle.note = "Good! Keep going.";
  refresh();
  // Their reply
  const reply = puzzle.solution[puzzle.step];
  setTimeout(() => {
    if (!puzzle || puzzle.state !== "solving") return;
    const answered = game.play(reply);
    moveSound(answered.san, opposite(game.position.turn));
    puzzle.step++;
    if (puzzle.step >= puzzle.solution.length) puzzleSolved();
    else refresh();
  }, 500);
}

function puzzleSolved() {
  if (!puzzle) return;
  puzzle.state = "solved";
  if (!puzzle.missed) puzzle.streak++;
  puzzle.note = puzzle.missed ? "Solved! Next one?" : puzzle.streak > 1 ? `Solved! That's ${puzzle.streak} in a row.` : "Solved! Well done.";
  void play("right");
  refresh();
}

function puzzleHintStep() {
  if (!puzzle || puzzle.state !== "solving") return;
  puzzle.hints++;
  puzzle.missed = true;
  puzzle.note = puzzle.hints === 1 ? puzzleHint(puzzle.themes) : "This piece moves.";
  refresh();
}

/** Show the rest of the solution, one move at a time. */
function puzzleShowSolution() {
  if (!puzzle) return;
  const rest = puzzle.solution.slice(puzzle.step);
  if (!rest.length) return;
  puzzle.state = "shown";
  puzzle.missed = true;
  puzzle.streak = 0;
  puzzle.note = "Here's the solution. Next one when you're ready.";
  const positions = [game.position.clone()];
  for (const move of rest) positions.push(positionAfter(positions[positions.length - 1], move));
  // your moves: the move and why; their replies: what they do
  const texts = rest.map((move, i) => positions[i].turn === puzzle!.side
    ? moveInWords(positions[i], move, puzzle!.side)
    : narrateMove(positions[i], move, puzzle!.side));
  startStepper(positions, rest, texts, "talk", { ico: "skipNext", label: "Next puzzle", run: () => { closeStepper(); nextPuzzle(); }, kind: "accent" });
}

function nextPuzzle() {
  if (!puzzle) return;
  showPuzzle(puzzle.index + 1);
}

function puzzleSays(): CoachSay {
  const p = puzzle!;
  const level = PUZZLE_LEVELS.find(([v]) => v === p.level)?.[1] ?? "";
  const hint: CoachButton = { ico: "bulb", label: "Hint", run: puzzleHintStep };
  const show: CoachButton = { ico: "eye", label: "Show the solution", run: puzzleShowSolution, kind: "soft" };
  const next: CoachButton = { ico: "skipNext", label: "Next puzzle", run: nextPuzzle, kind: "accent" };
  void level;
  if (p.state === "solving") return { mood: p.missed ? "think" : "talk", text: p.note, buttons: [hint, show] };
  return { mood: p.state === "solved" ? "wow" : "talk", text: p.note, buttons: [next] };
}

/** A circle on the piece to move, after the second hint. */
function puzzleShapes(): DrawShape[] {
  if (!puzzle || puzzle.state !== "solving" || puzzle.hints < 2) return [];
  const move = puzzle.solution[puzzle.step];
  return move ? [{ orig: makeSquare(move.from) as Key, brush: "you" }] : [];
}

// -- Your position: set it up, then the coach takes a side ---------------------

interface EditorState {
  board: Board;
  turn: Color;
  pick: Piece | "erase" | null;
}

let editor: EditorState | null = null;

const PIECE_LETTERS: [PieceRole, string][] = [["king", "K"], ["queen", "Q"], ["rook", "R"], ["bishop", "B"], ["knight", "N"], ["pawn", "P"]];

function startEditor(fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1") {
  mode = "practice";
  resetBoard(new Game());
  gameOrigin = "train";
  currentView = "board";
  editor = { board: Board.empty(), turn: "white", pick: null };
  editorLoad(fen);
  orientation = "white";
  if (menuOpen) hideMenu();
  drawPalette();
  refresh();
}

function editorLoad(fen: string) {
  if (!editor) return;
  const setup = parseFen(fen);
  if (setup.isErr) return;
  editor.board = setup.value.board.clone();
  editor.turn = setup.value.turn;
  refresh();
}

function editorTap(key: Key) {
  if (!editor || !editor.pick) return;
  const square = parseSquare(key)!;
  const current = editor.board.get(square);
  const pick = editor.pick;
  if (pick === "erase" || (current && current.role === pick.role && current.color === pick.color)) editor.board.take(square);
  else {
    // only one king of each colour
    if (pick.role === "king") for (const sq of editor.board.pieces(pick.color, "king")) editor.board.take(sq);
    editor.board.set(square, pick);
  }
  refresh();
}

/** After a piece was moved (or dragged off) on the board itself. */
function editorSync() {
  if (!editor || editor.pick) return;
  const board = Board.empty();
  for (const [key, piece] of ground.state.pieces) board.set(parseSquare(key)!, { role: piece.role, color: piece.color });
  if (makeBoardFen(board) === makeBoardFen(editor.board)) return;
  editor.board = board;
  refresh();
}

function drawPalette() {
  for (const colour of ["white", "black"] as Color[]) {
    const row = $(`palette-${colour}`);
    row.replaceChildren(...PIECE_LETTERS.map(([role]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-piece";
      button.innerHTML = `<span class="mini-piece ${role} ${colour}"></span>`;
      button.setAttribute("aria-label", `${colour} ${role}`);
      const on = editor?.pick !== "erase" && editor?.pick?.role === role && editor?.pick?.color === colour;
      button.classList.toggle("on", !!on);
      button.addEventListener("click", () => {
        if (!editor) return;
        editor.pick = on ? null : { role, color: colour };
        drawPalette();
        refresh();
      });
      return button;
    }));
    if (colour === "black") {
      const erase = document.createElement("button");
      erase.type = "button";
      erase.className = "palette-piece";
      erase.innerHTML = icon("eraser", 20);
      erase.setAttribute("aria-label", "Remove pieces");
      erase.classList.toggle("on", editor?.pick === "erase");
      erase.addEventListener("click", () => {
        if (!editor) return;
        editor.pick = editor.pick === "erase" ? null : "erase";
        drawPalette();
        refresh();
      });
      row.append(erase);
    }
  }
}

function drawEditor() {
  const panel = $("editor-panel");
  panel.hidden = !editor;
  document.body.classList.toggle("editing", editor !== null);
  if (!editor) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>("#editor-turn button")) {
    button.classList.toggle("on", button.dataset.turn === editor.turn);
  }
}

/** Castling rights where king and rook still stand on their home squares. */
function castlingFen(board: Board): string {
  const has = (sq: string, role: PieceRole, color: Color) => {
    const piece = board.get(parseSquare(sq)!);
    return piece?.role === role && piece.color === color;
  };
  let rights = "";
  if (has("e1", "king", "white")) rights += (has("h1", "rook", "white") ? "K" : "") + (has("a1", "rook", "white") ? "Q" : "");
  if (has("e8", "king", "black")) rights += (has("h8", "rook", "black") ? "k" : "") + (has("a8", "rook", "black") ? "q" : "");
  return rights || "-";
}

async function editorDone() {
  if (!editor) return;
  const fen = `${makeBoardFen(editor.board)} ${editor.turn === "white" ? "w" : "b"} ${castlingFen(editor.board)} - 0 1`;
  const setup = parseFen(fen);
  const position = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
  if (!position || position.isErr) {
    const kings = (["white", "black"] as Color[]).every((c) => editor!.board.pieces(c, "king").size() === 1);
    await message("Not a legal position", kings
      ? "That position can't happen in a game (for example, the side not to move is in check, or pawns are on the first or last rank)."
      : "Each side needs exactly one king.");
    return;
  }
  if (position.value.isEnd()) {
    await message("Game over", "That position is already checkmate or stalemate. Change it a little first.");
    return;
  }
  const ask = $<HTMLDialogElement>("side-dialog");
  drawBandChips();
  ask.showModal();
  const choice = await new Promise<string>((resolve) => {
    const buttons = [...ask.querySelectorAll<HTMLButtonElement>("button[value]")];
    const done = (value: string) => {
      for (const button of buttons) button.onclick = null;
      ask.oncancel = null;
      ask.close();
      resolve(value);
    };
    for (const button of buttons) button.onclick = (event) => { event.preventDefault(); done(button.value); };
    ask.oncancel = (event) => { event.preventDefault(); done("cancel"); };
  });
  if (choice !== "white" && choice !== "black") return;
  startExplore(fenOf(position.value), choice as Color);
}

/** The opponent's strength: the puzzle bands, each with its ratings. */
function drawBandChips() {
  const chips = $("band-chips");
  chips.replaceChildren(...(Object.keys(BANDS) as Band[]).map((band) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = BANDS[band].name;
    chip.classList.toggle("on", band === exploreBand);
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      exploreBand = band;
      drawBandChips();
    });
    return chip;
  }));
  const info = BANDS[exploreBand];
  $("band-note").textContent = `${info.name}: rated ${info.ratings}, like ${info.stockfish}.`;
}

function openPaste() {
  const dialogBox = $<HTMLDialogElement>("paste-dialog");
  const text = $<HTMLTextAreaElement>("paste-text");
  text.value = "";
  $("paste-status").textContent = "";
  dialogBox.showModal();
  const buttons = [...dialogBox.querySelectorAll<HTMLButtonElement>("button[value]")];
  const done = () => {
    for (const button of buttons) button.onclick = null;
    dialogBox.close();
  };
  for (const button of buttons) {
    button.onclick = (event) => {
      event.preventDefault();
      if (button.value !== "load") return done();
      const raw = text.value.trim();
      const asFen = parseFen(raw);
      if (asFen.isOk && raw.split("/").length === 8) {
        editorLoad(raw);
        return done();
      }
      const [parsed] = readPgn(raw);
      const loaded = parsed?.load().game;
      if (loaded && (loaded.length || parsed.headers.FEN)) {
        editorLoad(fenOf(loaded.position));
        return done();
      }
      $("paste-status").textContent = "That isn't a FEN or a PGN game I can read.";
    };
  }
}

/** Analyse your position: the coach shows the best moves and the likely replies. */
function startExplore(fen: string, user: Color) {
  mode = "practice";
  const opponent = `Opponent · ${BANDS[exploreBand].name}`;
  resetBoard(new Game(fen), { White: user === "white" ? playerName() : opponent, Black: user === "black" ? playerName() : opponent, Date: today() });
  gameOrigin = "train";
  explore = { user, band: exploreBand, auto: true, thinking: false };
  orientation = user;
  refresh();
  // You go first: the best moves wait until you ask (the bulb). If it's their
  // move, they make it.
  autoReply();
}

/** Playing a move from an earlier point replaces the moves after it. */
function exploreMove(move: NormalMove) {
  const from = currentPly();
  while (game.length > from) game.undo();
  game.play(move);
  afterMove();
  autoReply();
}

/** When it's their move at the end of the line, they reply by themselves
 *  after a moment - unless auto-reply is paused or you've moved on (stepped
 *  back, played something, opened the coach's card) in the meantime. */
function autoReply() {
  if (!explore?.auto || viewPly !== null) return;
  if (game.position.turn === explore.user || game.position.isEnd()) return;
  const length = game.length;
  const state = explore;
  setTimeout(() => {
    if (explore !== state || !explore.auto || game.length !== length || viewPly !== null || stepper) return;
    void letThemReply();
  }, AUTO_REPLY_DELAY);
}

const SIMULATE: CoachButton = {
  ico: "play", label: "Simulate: play it out", kind: "accent",
  run: () => {
    closeStepper();
    // if it's their move to start with, they make it
    if (explore && game.position.turn !== explore.user && viewPly === null) {
      if (explore.auto) void letThemReply();
    }
  },
};

/** The best move for your side, the replies an opponent of the chosen
 *  strength would likely play, and (when the best line is forcing) how it
 *  goes on, ending with who stands better. */
async function showIdeas() {
  if (!explore || busy) return;
  const { user, band } = explore;
  const position = base();
  setBusy(true, "Let me look at the position...");
  try {
    const frames: StepFrame[] = [];
    const texts: string[] = [];
    const moveFrame = (before: Chess, move: NormalMove, text: string, illustrate: boolean) => {
      const next = positionAfter(before, move);
      const shapes: DrawShape[] = [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: before.turn === user ? "you" : "them" }];
      // one move on its own: show what the piece does from its new square
      if (illustrate && !isCastling(before, move)) {
        for (const square of controlledSquares(next, move.to)) shapes.push({ orig: makeSquare(move.to) as Key, dest: makeSquare(square) as Key, brush: "control" });
        for (const square of quietIdea(before, move, user)?.squares ?? []) shapes.push({ orig: makeSquare(square) as Key, brush: "you" });
      }
      frames.push({ position: next, shapes });
      texts.push(text);
    };
    let line: NormalMove[] = [];
    let score: Score | undefined;
    if (position.turn === user) {
      const plan = await planAhead(coachAnalysis, position);
      line = forcingStart(position, plan.steps.map((step) => step.move));
      score = plan.score;
      if (line.length) moveFrame(position, line[0], `Best here: ${lowerFirst(moveInWords(position, line[0], user))}`, line.length === 1);
    }
    // Their likely replies (to your best move, or now if it's their turn)
    const after = line.length ? positionAfter(position, line[0]) : position;
    if (!after.isEnd()) {
      const odds = (await likelyMoves(coachAnalysis, after, band)).filter((o) => o.chance >= 5).slice(0, 3);
      const shapes: DrawShape[] = odds.map((o) => ({
        orig: makeSquare(o.move.from) as Key, dest: arrowEnd(after, o.move), brush: "guess",
        modifiers: { lineWidth: Math.round(4 + o.weight * 10) },
      }));
      const who = BANDS[band].who.replace(/^./, (c) => c.toUpperCase());
      texts.push(line.length ? `${who} would most likely answer:` : `It's their move. ${who} would most likely play:`);
      const others = 100 - odds.reduce((sum, o) => sum + o.chance, 0);
      frames.push({ position: after, shapes, odds, others: others >= 10 ? others : undefined });
    }
    // The rest of a forcing line, move by move
    let walk = after;
    line.slice(1).forEach((move, i) => {
      const mine = walk.turn === user;
      const text = i === 0 && !mine ? `Their best defence: ${lowerFirst(narrateMove(walk, move, user))}`
        : mine ? `Then ${lowerFirst(moveInWords(walk, move, user))}` : narrateMove(walk, move, user);
      moveFrame(walk, move, text, false);
      walk = positionAfter(walk, move);
    });
    if (line.length > 1 && score) texts[texts.length - 1] += ` In the end, ${verdictWords(score)}.`;
    setBusy(false);
    if (!frames.length || !explore) return refresh();
    stepper = { positions: frames.map((f) => f.position), moves: [], texts, step: 1, mood: "talk", extra: SIMULATE, frames };
    refresh();
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    setBusy(false);
    refresh();
  }
}

/** The start of the best line: your first move, then on while your moves are
 *  forcing (checks and captures), with their replies in between. */
function forcingStart(position: Chess, line: NormalMove[]): NormalMove[] {
  const user = position.turn;
  const shown: NormalMove[] = [];
  let walk = position;
  for (const move of line.slice(0, 6)) {
    const next = positionAfter(walk, move);
    const mine = walk.turn === user;
    const forcing = next.isCheck() || walk.board.get(move.to) !== undefined;
    if (mine && shown.length && !forcing) break;
    shown.push(move);
    if (mine && !forcing) break;
    walk = next;
  }
  return shown;
}

/** Their move, chosen the way a player of the chosen strength might. */
async function letThemReply() {
  if (!explore || explore.thinking) return;
  const state = explore;
  const length = game.length;
  const ply = currentPly();
  const position = base();
  if (position.turn === state.user || position.isEnd()) return;
  // No busy lock: you can keep stepping through or moving while they think
  state.thinking = true;
  refresh();
  try {
    const odds = await likelyMoves(coachAnalysis, position, state.band);
    state.thinking = false;
    // You've moved on meanwhile: their reply no longer fits
    if (explore !== state || game.length !== length || currentPly() !== ply) return refresh();
    const choice = pickLikely(odds);
    if (choice) exploreMove(choice.move);
    else refresh();
  } catch (error) {
    state.thinking = false;
    errorText = `Something went wrong: ${error}`;
    refresh();
  }
}

/** What the coach says in your position, and the buttons it offers. */
function exploreSays(reviews: (Review | undefined)[]): CoachSay {
  const { user, band } = explore!;
  const ply = currentPly();
  const position = game.positionAt(ply);
  const theirs = position.turn !== user;
  const over = position.isEnd();
  const { auto, thinking } = explore!;
  const buttons: CoachButton[] = [];
  // Their move waits for you when auto-reply is paused (or you've stepped back)
  const waiting = theirs && !over && (!auto || viewPly !== null);
  const stepped = viewPly !== null;
  if (waiting && !thinking) {
    buttons.push({ ico: "play", label: stepped ? `Let them play from here (${BANDS[band].name})` : `Let them reply (${BANDS[band].name})`, kind: "accent", run: () => void letThemReply() });
  }
  if (!over) buttons.push({ ico: "bulb", label: theirs ? "Their likely moves" : "Best move and their replies", run: () => void showIdeas() });
  buttons.push(auto
    ? { ico: "pause", label: "Pause auto-reply, to move for them yourself", run: () => { explore!.auto = false; refresh(); } }
    : { ico: "replay", label: "Turn auto-reply back on", run: () => {
      explore!.auto = true;
      refresh();
      // they carry on from the position on the board, with fresh moves
      if (position.turn !== user && !over) void letThemReply();
    } });
  // Stepped back: say how to carry on from here (the moves after it get replaced)
  if (stepped && !over && !thinking) {
    const text = theirs ? "You've stepped back to their move. Move for them, or let them play from here with fresh moves."
      : "You've stepped back. Play a move from here and they'll carry on from it.";
    return { mood: "talk", text, buttons };
  }
  if (ply === 0) {
    const text = theirs ? (auto ? "It's their move first. Here it comes..." : "It's their move. Move for them on the board, or let them reply.")
      : "Your move. Play what you think is best and I'll rate it. Tap the bulb when you want my best move.";
    return { mood: "talk", text, buttons };
  }
  const review = reviews[ply - 1];
  if (!review) return { mood: "think", text: "Let me check that move...", buttons };
  const said = verdict(review, game.positionAt(ply - 1), position, analyser.evals.get(fenOf(position)), user, ply);
  let text: string;
  if (over) text = said;
  else if (theirs) text = thinking ? `${said} They're thinking...` : waiting ? `${said} Now their move: play it, or let them reply.` : `${said} They're replying...`;
  else {
    // after their reply, your own move's rating too, so it isn't missed
    const yours = ply >= 2 ? reviews[ply - 2] : undefined;
    const mine = yours ? `Your move was ${ratingWords(yours.rating)}. ` : "";
    text = `${mine}${said} Your move.`;
  }
  return { mood: moodForRating(review.rating), text, buttons: [...buttons, TELL_MORE] };
}

// -- Lessons ----------------------------------------------------------------------

interface LessonState {
  phase: TrainPhase;
  index: number;
}

let lesson: LessonState | null = null;

function showLessonList() {
  const list = $("lesson-list");
  const lessons = LESSONS[trainPhase];
  list.replaceChildren();
  const back = document.createElement("button");
  back.type = "button";
  back.className = "home-link";
  back.innerHTML = `${icon("back", 16)} ${trainPhase === "middlegame" ? "Middlegame" : "Endgame"}`;
  back.addEventListener("click", () => {
    list.hidden = true;
    $("train-cards").hidden = false;
  });
  list.append(back);
  if (!lessons.length) {
    const note = document.createElement("p");
    note.className = "setup-note";
    note.textContent = "These lessons are being written. Try the puzzles in the meantime!";
    list.append(note);
  }
  lessons.forEach((item, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "train-card lesson-card";
    card.innerHTML = `<span class="lesson-number">${i + 1}</span><span><b></b><small></small></span>`;
    card.querySelector("b")!.textContent = item.title;
    card.querySelector("small")!.textContent = item.summary;
    card.addEventListener("click", () => startLesson(trainPhase, i));
    list.append(card);
  });
  $("train-cards").hidden = true;
  list.hidden = false;
}

function startLesson(phase: TrainPhase, index: number) {
  const item: Lesson | undefined = LESSONS[phase][index];
  if (!item) return;
  mode = "play";
  resetBoard(new Game(item.steps[0].fen), { White: "?", Black: "?", Event: item.title });
  gameOrigin = "train";
  lesson = { phase, index };
  currentView = "board";
  if (menuOpen) hideMenu();
  const frames = item.steps.map((step) => {
    const position = Chess.fromSetup(parseFen(step.fen).unwrap()).unwrap();
    // green: good, red: weaknesses and threats, blue: plans
    const brush = (kind?: string) => (kind === "bad" ? "them" : kind === "plan" ? "guess" : "you");
    const shapes: DrawShape[] = [
      ...(step.arrows ?? []).map(([from, to, kind]) => ({ orig: from as Key, dest: to as Key, brush: brush(kind) })),
      ...(step.squares ?? []).map(([square, kind]) => ({ orig: square as Key, brush: brush(kind) })),
    ];
    return { position, shapes };
  });
  const tryIt: CoachButton = {
    ico: "puzzle", label: "Try it: puzzles on this idea", kind: "accent",
    run: () => { closeStepper(); lesson = null; void startPuzzles(phase, puzzleLevel, item.themes); },
  };
  stepper = {
    positions: frames.map((f) => f.position), moves: [], texts: item.steps.map((s) => s.text),
    step: 1, mood: "talk", extra: tryIt, frames,
  };
  orientation = frames[0].position.turn;
  refresh();
}

// ---------------------------------------------------------------------------
// Opening demos
// ---------------------------------------------------------------------------

const DEMO_MOVE_DELAY = 1100; // ms between moves while it plays on

function startDemo(chosen: Demo, line = 0) {
  resetBoard(new Game(), { White: "White", Black: "Black", Event: `${chosen.opening} demo`, Date: today() });
  mode = "practice";
  canReview = false;
  reviewing = false;
  // Black openings are shown from Black's side
  orientation = REPERTOIRE.find((o) => o.name === chosen.opening)?.colour ?? "white";
  demo = { demo: chosen, line: 0, steps: [], playing: false, interrupted: false, intro: true };
  gameOrigin = "learn";
  demoPick.replaceChildren(...chosen.lines.map((l, i) => new Option(`${i + 1}. ${l.title}`, String(i))));
  if (menuOpen) hideMenu();
  loadDemoLine(line);
}

/** Set up one line of the demo from its first move, and start playing it. */
function loadDemoLine(index: number, intro = true) {
  if (!demo) return;
  clearTimeout(demo.timer);
  demo.line = index;
  demo.steps = demoSteps(demo.demo, index);
  game = new Game();
  // the introduction shows the opening's basic setup; play brings the whole line
  for (const move of intro ? introMoves(demo.demo, index) : demo.steps.map((step) => step.move)) game.play(move);
  plyNotes = new Map();
  analysis = null;
  preview = null;
  quiz = null;
  demo.interrupted = false;
  demo.intro = intro;
  if (intro) {
    // the basic setup, while the coach introduces it; play starts the line
    viewPly = null;
    demo.playing = false;
    refresh();
    return;
  }
  viewPly = 0;
  demo.playing = true;
  refresh(); // the moves follow once the coach has spoken
  scheduleDemo(800);
}

/** Play, after the introduction: back to the start, and the line plays out. */
function startDemoLine() {
  if (!demo) return;
  demo.intro = false;
  demo.playing = true; // (before going back to the start, so the coach says "Here we go")
  demo.interrupted = false;
  game = new Game();
  for (const step of demo.steps) game.play(step.move);
  demoStepping = true;
  goTo(0);
  demoStepping = false;
  refresh();
  scheduleDemo(900);
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
  refresh(); // the next move follows once the coach has said what this one does (onSpoken)
}

function onDemoPlay() {
  if (!demo) return;
  if (demo.intro) {
    startDemoLine();
    return;
  }
  if (currentPly() >= game.length) {
    loadDemoLine(demo.line, false); // watch it again
    return;
  }
  demo.playing = !demo.playing;
  demo.interrupted = false;
  refresh();
  scheduleDemo(demo.playing ? 400 : DEMO_MOVE_DELAY);
}

/** The demo's controls: play / pause / replay between the move buttons, the
 *  variation buttons, and the line's name as the heading. */
function drawDemo() {
  document.body.classList.toggle("demo-on", demo !== null);
  document.body.classList.toggle("replay-on", canReplay());
  $("moves-heading").textContent = demo ? demoTitle() : "Moves";
  if (!demo && !canReplay()) return;
  const atEnd = currentPly() >= game.length && !demo?.intro;
  const playing = demo ? demo.playing : replaying;
  const [glyph, label] = atEnd ? ["replay", demo ? "Watch again" : "Play from the start"] : playing ? ["pause", "Pause"] : ["play", "Play"];
  document.body.classList.toggle("demo-intro", !!demo?.intro);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-play")) {
    button.title = label;
    button.setAttribute("aria-label", label);
    button.querySelector(".play-icon")!.innerHTML = icon(glyph, 20);
  }
  if (!demo) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".var-prev")) button.disabled = demo.line === 0;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".var-next")) button.disabled = demo.line + 1 >= demo.demo.lines.length;
}

const lowerFirst = (text: string) => (/^(White|Black)/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "London · Main", "London · Nf3 variation" */
function demoTitle(): string {
  if (!demo) return "";
  return `${openingShortName(demo.demo.opening)} · ${demo.demo.lines[demo.line].title}`;
}

/** "London" from "London System", "Caro-Kann / Slav" from "Caro-Kann / Slav (...c6 and ...d5)" */
function openingShortName(name: string): string {
  return name.replace(/ \(.*\)$/, "").replace(/ (System|Opening|Game|Defence|setup)$/, "");
}

/** On each move of a demo: what the piece now controls, the pawn chain it
 *  builds, and the square a quiet move takes away. At the start: where the
 *  pieces are heading. */
function demoShapes(): DrawShape[] {
  if (!demo || demo.intro) return [];
  const ply = currentPly();
  if (ply === 0) return []; // the start: nothing drawn (the introduction showed where the pieces go)
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const move = game.moves[ply - 1].move;
  const yours = before.turn === orientation;
  const shapes: DrawShape[] = [];
  const marked = new Set<number>();
  const mark = (square: number) => {
    if (marked.has(square)) return;
    marked.add(square);
    shapes.push({ orig: makeSquare(square) as Key, brush: yours ? "you" : "them" });
  };
  if (!isCastling(before, move)) {
    for (const square of controlledSquares(after, move.to)) {
      shapes.push({ orig: makeSquare(move.to) as Key, dest: makeSquare(square) as Key, brush: yours ? "control" : "controlThem" });
    }
  }
  for (const square of chainOf(after, move.to)) mark(square);
  for (const square of quietIdea(before, move, orientation)?.squares ?? []) mark(square);
  // The moves and squares this note talks about
  const label = demo.steps[ply - 1]?.label;
  for (const item of (label && demo.demo.lines[demo.line].arrows?.[label]) || []) {
    const threat = item.endsWith("!");
    const brush = threat ? "them" : "guess";
    const squares = item.replace(/[@!]/g, "");
    if (item.startsWith("@")) shapes.push({ orig: squares as Key, brush });
    else shapes.push({ orig: squares.slice(0, 2) as Key, dest: squares.slice(2, 4) as Key, brush });
  }
  return shapes;
}

/** The end of a line: the position you get, explained with Stockfish - its
 *  shape, its strengths and ideas, and what to watch out for. */
async function showWhatYouGet() {
  if (!demo || busy) return;
  const position = game.position;
  setBusy(true, "Let me look at the position you get...");
  try {
    const pages = await whatYouGet(coachAnalysis, position, orientation);
    setBusy(false);
    if (!demo) return refresh();
    const brush = (mark: Mark) => (mark === "bad" ? "them" : mark === "plan" ? "guess" : "you");
    const frames: StepFrame[] = pages.map((page) => ({
      position,
      shapes: [
        ...page.arrows.map(([from, to, mark]): DrawShape => ({ orig: makeSquare(from) as Key, dest: arrowEnd(position, { from, to }), brush: brush(mark) })),
        ...page.squares.map(([square, mark]): DrawShape => ({ orig: makeSquare(square) as Key, brush: brush(mark) })),
      ],
    }));
    const line = demo.line;
    const more = line + 1 < demo.demo.lines.length;
    const chosen = demo.demo;
    const extra: CoachButton | CoachButton[] = more
      ? { ico: "next", label: "Next line", kind: "accent", run: () => { closeStepper(); loadDemoLine(line + 1); } }
      : [
          { ico: "target", label: "Drill it", kind: "accent", labelled: true, run: () => { closeStepper(); startDrill(chosen); } },
          { ico: "knight", label: "Practice match", labelled: true, run: () => { closeStepper(); onDemoTry(); } },
        ];
    stepper = { positions: frames.map((f) => f.position), moves: [], texts: pages.map((p) => p.text), step: 1, mood: "talk", extra, frames };
    refresh();
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    setBusy(false);
    refresh();
  }
}

// -- Playing a reviewed game through, move by move -------------------------------

let replaying = false;
let replayStepping = false; // the replay itself is moving (not you)
const REPLAY_STOPS = new Set(["Brilliant", "Great", "Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"]);
const REPLAY_MOVE_MS = 900; // an ordinary move, then the next
const REPLAY_WAIT_MS = 6000; // the longest it waits for a move's rating
const canReplay = () => !demo && reviewing && game.length > 0;

function toggleReplay() {
  if (!canReplay()) return;
  if (replaying) {
    replaying = false;
    refresh();
    return;
  }
  replaying = true;
  if (currentPly() >= game.length) {
    replayStepping = true;
    goTo(0);
    replayStepping = false;
  }
  refresh();
  setTimeout(replayNext, 400);
}

/** The next move. Ordinary moves go by quickly; it stops on a brilliant move
 *  or an inaccuracy, mistake, miss or blunder, so it can be looked at. */
function replayNext() {
  if (!replaying) return;
  const ply = currentPly();
  if (ply >= game.length) {
    replaying = false;
    refresh();
    return;
  }
  replayStepping = true;
  goTo(ply + 1);
  replayStepping = false;
  const shownAt = performance.now();
  const check = () => {
    if (!replaying || currentPly() !== ply + 1) return;
    const review = lastReviews[ply];
    const waited = performance.now() - shownAt;
    // wait for the rating (Stockfish may still be on it), but not for ever
    if (!review && ratingsOn() && waited < REPLAY_WAIT_MS) {
      setTimeout(check, 200);
      return;
    }
    if (review && REPLAY_STOPS.has(review.rating)) {
      replaying = false;
      refresh();
      return;
    }
    setTimeout(replayNext, Math.max(0, REPLAY_MOVE_MS - waited));
  };
  setTimeout(check, 200);
}

function onNavPlay() {
  if (demo) onDemoPlay();
  else toggleReplay();
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
  if (demo) practiseOpening(demo.demo.opening);
}

// -- Opening drills: you play the lesson's moves -------------------------------
// Round 1 is the main line. Round 2 mixes it up: a few of the variations, and in
// most of them the opponent slips (an inaccuracy or a mistake) somewhere along
// the way, for you to spot and punish.

const DRILL_VARIATIONS = 3; // lines in the mixed round
const DRILL_SLIP_MIN = 8; // their slip costs them at least this much winning chance (an inaccuracy)...
const DRILL_SLIP_MAX = 30; // ...and at most this much (a mistake, nothing silly)
const DRILL_ANSWER = 5; // your answer to it counts within this of the best move ("Good" or better)
const DRILL_MOVE_DELAY = 700; // ms before their move

interface DrillScore {
  moves: number; // your moves
  right: number; // ...found first time
  slips: number; // their slips
  spotted: number; // ...that you punished first time
}

interface DrillState {
  demo: Demo;
  opening?: Opening;
  user: Color;
  round: 1 | 2;
  queue: { line: number; slip: boolean }[]; // the mixed round's lines still to come
  line: number;
  script: NormalMove[]; // the line's moves
  slipAt?: number; // the ply where they slip (the mixed round)
  slipped: boolean; // they did: now find the answer
  best?: { move: NormalMove; chance: number }; // the best answer to their slip
  state: "playing" | "between" | "done";
  waiting: boolean; // the coach is thinking (the board waits)
  tries: number; // wrong tries at this move
  note: string;
  mood: Mood;
  scores: [DrillScore, DrillScore];
  token: number; // a new line cancels the old one's timers
}

let drill: DrillState | null = null;

const newScore = (): DrillScore => ({ moves: 0, right: 0, slips: 0, spotted: 0 });
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const shuffled = <T,>(list: T[]): T[] => [...list].sort(() => Math.random() - 0.5);

/** Start the drill of an opening, from round 1. */
function startDrill(chosen: Demo) {
  const opening = REPERTOIRE.find((o) => o.name === chosen.opening);
  const user = opening?.colour ?? "white";
  resetBoard(new Game(), { White: "White", Black: "Black", Event: `${chosen.opening} drill`, Date: today() });
  mode = "play"; // no eval bar to give it away
  gameOrigin = "learn";
  currentView = "board";
  orientation = user;
  drill = {
    demo: chosen, opening, user, round: 1, queue: [], line: 0, script: [], slipped: false, state: "playing",
    waiting: false, tries: 0, note: "", mood: "talk", scores: [newScore(), newScore()], token: 0,
  };
  if (menuOpen) hideMenu();
  void play("start");
  startDrillLine(0, false, "Round 1: the main line. You play your moves, I'll play theirs.");
}

/** One line of the drill, from the start. */
function startDrillLine(line: number, slip: boolean, note: string) {
  const d = drill;
  if (!d) return;
  const token = ++d.token;
  d.line = line;
  d.script = demoSteps(d.demo, line).map((step) => step.move);
  d.slipped = false;
  d.best = undefined;
  d.slipAt = undefined;
  if (slip) {
    // their slip comes after their first move, somewhere in the line
    const theirs: number[] = [];
    for (let ply = 2; ply < d.script.length; ply++) if ((ply % 2 === 0 ? "white" : "black") !== d.user) theirs.push(ply);
    if (theirs.length) d.slipAt = pickOne(theirs);
  }
  d.state = "playing";
  d.waiting = false;
  d.tries = 0;
  d.note = note;
  d.mood = "talk";
  game = new Game();
  viewPly = null;
  analysis = null;
  preview = null;
  refresh();
  drillContinue(token, 1200);
}

/** After a move: their reply, the end of the line, or your turn. */
function drillContinue(token: number, delay = DRILL_MOVE_DELAY) {
  const d = drill;
  if (!d || d.token !== token || d.state !== "playing") return;
  if (!d.slipped && game.length >= d.script.length) {
    drillLineDone();
    return;
  }
  if (game.position.turn === d.user) {
    refresh();
    return;
  }
  d.waiting = true;
  refresh();
  setTimeout(() => void drillTheirMove(token), delay);
}

async function drillTheirMove(token: number) {
  const d = drill;
  if (!d || d.token !== token) return;
  const ply = game.length;
  let move = d.script[ply];
  let slipped = false;
  if (ply === d.slipAt) {
    const slip = await findSlip(game.position, move);
    if (drill !== d || d.token !== token) return;
    if (slip) [move, slipped] = [slip, true];
  }
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  if (!slipped) {
    d.waiting = false;
    drillContinue(token);
    return;
  }
  // Their slip: what's your best answer?
  d.slipped = true;
  d.scores[1].slips++;
  d.note = "That's not the move from the lesson. Look carefully: what does it change?";
  d.mood = "think";
  refresh();
  const [line] = await coachAnalysis.analyse(game.position, 1.2, 1);
  if (drill !== d || d.token !== token) return;
  if (!line?.pv[0]) {
    drillLineDone();
    return;
  }
  d.best = { move: line.pv[0], chance: winningChance(line.score, d.user) };
  d.waiting = false;
  refresh();
}

/** A move they could play instead of the lesson's: an inaccuracy or a
 *  mistake, not a silly blunder - something you need to spot. */
async function findSlip(position: Chess, lessonMove: NormalMove): Promise<NormalMove | undefined> {
  const mover = position.turn;
  const lines = await coachAnalysis.analyse(position, 1, 12);
  if (!lines.length) return undefined;
  const best = Math.max(...lines.map((line) => winningChance(line.score, mover)));
  const fits = (chance: number) => best - chance >= DRILL_SLIP_MIN && best - chance <= DRILL_SLIP_MAX;
  const isLesson = (move: NormalMove) => makeUci(move) === makeUci(lessonMove);
  const listed = lines.filter((line) => line.pv[0] && !isLesson(line.pv[0]) && fits(winningChance(line.score, mover)));
  if (listed.length) return pickOne(listed).pv[0];
  // Not among the engine's top moves: try a few ordinary-looking ones
  const seen = new Set(lines.map((line) => (line.pv[0] ? makeUci(line.pv[0]) : "")));
  const others: NormalMove[] = [];
  for (const [from, dests] of position.allDests()) {
    if (position.board.get(from)?.role === "king") continue;
    for (const to of dests) {
      const move: NormalMove = { from, to };
      if (!seen.has(makeUci(move)) && !isLesson(move)) others.push(move);
    }
  }
  for (const move of shuffled(others).slice(0, 8)) {
    const score = await coachAnalysis.moveScore!(position, move, 0.3);
    if (fits(winningChance(score, mover))) return move;
  }
  return undefined;
}

/** Your move in a drill. */
function drillMove(move: NormalMove) {
  const d = drill;
  if (!d || d.state !== "playing" || d.waiting) return;
  if (d.slipped) {
    void drillAnswer(move);
    return;
  }
  const before = game.position.clone();
  const expected = d.script[game.length];
  const score = d.scores[d.round - 1];
  if (makeUci(move) === makeUci(expected)) {
    if (d.tries === 0) score.right++;
    score.moves++;
    d.tries = 0;
    const played = game.play(move);
    moveSound(played.san, opposite(game.position.turn));
    const goal = goalDone(before, move);
    d.note = goal ? `Right: ${goal}, that's ticked off.` : pickOne(["Right.", "That's the move.", "Yes, that's the lesson's move.", "Good."]);
    d.mood = "happy";
    drillContinue(d.token);
    return;
  }
  void drillWrong(before, move, expected);
}

/** A wrong move: say how good it was, then take it back. */
async function drillWrong(before: Chess, move: NormalMove, expected: NormalMove) {
  const d = drill!;
  const token = d.token;
  d.tries++;
  d.waiting = true;
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  d.note = "Let me check that...";
  d.mood = "think";
  refresh();
  const [best] = await coachAnalysis.analyse(before, 0.5, 1);
  const score = await coachAnalysis.moveScore!(before, move, 0.5);
  if (drill !== d || d.token !== token) return;
  const loss = best ? Math.max(0, winningChance(best.score, d.user) - winningChance(score, d.user)) : 0;
  const rating = loss < 2 ? "Excellent" : loss < 5 ? "Good" : loss < 10 ? "Inaccuracy" : loss < 20 ? "Mistake" : "Blunder";
  const verdictText = loss < 5
    ? `That's ${ratingWords(rating)} too, but it isn't the lesson's move.`
    : `That would be ${ratingWords(rating)}.`;
  const goal = goalDone(before, expected);
  const hint = d.tries >= 2 ? "The arrow shows the lesson's move." : goal ? `Think about your setup: ${goal}.` : "Think back to the lesson.";
  d.note = `${verdictText} ${hint}`;
  d.mood = loss < 5 ? "talk" : "worried";
  setTimeout(() => {
    if (drill !== d || d.token !== token) return;
    game.undo();
    void play("illegal");
    d.waiting = false;
    refresh();
  }, 900);
}

/** Your answer to their slip: good enough is good enough. */
async function drillAnswer(move: NormalMove) {
  const d = drill!;
  const token = d.token;
  const before = game.position.clone();
  d.waiting = true;
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  d.note = "Let me check that...";
  d.mood = "think";
  refresh();
  const score = await coachAnalysis.moveScore!(before, move, 0.8);
  if (drill !== d || d.token !== token || !d.best) return;
  const good = makeUci(move) === makeUci(d.best.move) || winningChance(score, d.user) >= d.best.chance - DRILL_ANSWER;
  if (good) {
    if (d.tries === 0) d.scores[1].spotted++;
    void play("right");
    d.note = `Well spotted! ${moveInWords(before, move, d.user)}`;
    d.mood = "wow";
    d.waiting = false;
    drillLineDone(true);
    return;
  }
  d.tries++;
  d.note = d.tries >= 2
    ? "Not that either. The arrow shows the way to make them pay."
    : "There's something better. What did their last move leave open, or what does it threaten?";
  d.mood = "worried";
  setTimeout(() => {
    if (drill !== d || d.token !== token) return;
    game.undo();
    void play("illegal");
    d.waiting = false;
    refresh();
  }, 900);
}

/** The setup goal a move achieves, in words ("bishop to f4"), if any. */
function goalDone(before: Chess, move: NormalMove): string | undefined {
  const d = drill;
  if (!d?.opening || before.turn !== d.user) return undefined;
  const setup = drillSystem()?.setup;
  if (!setup) return undefined;
  const [, missingBefore] = setupProgress(before, d.user, setup);
  const [, missingAfter] = setupProgress(positionAfter(before, move), d.user, setup);
  const done = missingBefore.find((goal) => !missingAfter.includes(goal));
  return done ? goalWords(done) : undefined;
}

/** The opening system the drill's line uses (its setup is the checklist). */
function drillSystem() {
  const d = drill;
  if (!d?.opening) return undefined;
  return systemFor(d.opening, firstMoveOf(game.positionAt(0), gameMoves()));
}

/** The end of a line: on to the next one, or the result. */
function drillLineDone(answered = false) {
  const d = drill;
  if (!d) return;
  d.waiting = false;
  if (d.round === 1) {
    const s = d.scores[0];
    d.state = "between";
    d.note = `Main line done: ${s.right} of ${s.moves} moves first time. Let's do that again, this time I'll mix it up - good luck!`;
    d.mood = "happy";
    refresh();
    return;
  }
  if (!d.queue.length) {
    drillDone();
    return;
  }
  d.state = "between";
  if (!answered) {
    d.note = d.tries === 0 && !d.slipped ? "That line's done. Ready for the next one?" : "That line's done. Next one?";
    d.mood = "happy";
  }
  refresh();
}

/** Round 2: some variations, most with a slip in them. */
function startMixedRound() {
  const d = drill;
  if (!d) return;
  const variations = d.demo.lines.map((_, i) => i).slice(1);
  const lines = variations.length ? shuffled(variations).slice(0, DRILL_VARIATIONS) : [0, 0];
  // at least one slip; the others more often than not
  const slips = lines.map((_, i) => i === 0 || Math.random() < 0.6);
  d.queue = shuffled(lines.map((line, i) => ({ line, slip: slips[i] })));
  d.round = 2;
  nextDrillLine();
}

function nextDrillLine() {
  const d = drill;
  if (!d) return;
  const next = d.queue.shift();
  if (!next) {
    drillDone();
    return;
  }
  const title = d.demo.lines[next.line].title;
  startDrillLine(next.line, next.slip, title === "Main" ? "The main line again, but stay alert." : `Next up: the ${title}. Stay alert.`);
}

function drillDone() {
  const d = drill;
  if (!d) return;
  d.state = "done";
  d.waiting = false;
  const [one, two] = d.scores;
  const right = one.right + two.right;
  const moves = one.moves + two.moves;
  d.mood = right === moves && two.spotted === two.slips ? "wow" : right >= moves * 0.75 ? "happy" : "talk";
  d.note = "That's the drill done.";
  refresh();
  const words = [
    `Round 1, the main line: ${one.right} of ${one.moves} moves first time.`,
    `Round 2, mixed up: ${two.right} of ${two.moves} moves first time` +
      (two.slips ? `, and you spotted ${two.spotted} of ${two.slips} slip${two.slips === 1 ? "" : "s"}.` : "."),
    right === moves && two.spotted === two.slips ? "Perfect! You know this opening."
      : right >= moves * 0.75 ? "Nicely done. Another go will make it stick."
        : "A good start. Drill it again and it'll soon feel natural.",
  ];
  const name = d.demo.opening;
  showOverlay(d.mood, words.map((text) => para(text)), [
    { ico: "replay", label: "Drill again", kind: "accent", run: () => { closeOverlay(false); startDrill(d.demo); } },
    { ico: "knight", label: "Play a practice match with it", run: () => { closeOverlay(false); practiseOpening(name); } },
    { ico: "school", label: "Back to Training", kind: "soft", run: () => { closeOverlay(false); backToTraining(name); } },
  ]);
}

/** What the coach says during a drill. */
function drillSays(): CoachSay {
  const d = drill!;
  if (d.state === "between") {
    const next: CoachButton = d.round === 1
      ? { ico: "play", label: "Round 2", kind: "accent", run: startMixedRound }
      : { ico: "skipNext", label: "Next line", kind: "accent", run: nextDrillLine };
    return { mood: d.mood, text: d.note, buttons: [next], key: `drill:${d.token}:between` };
  }
  if (d.state === "done") {
    const again: CoachButton = { ico: "replay", label: "See the result", kind: "accent", run: drillDone };
    return { mood: d.mood, text: d.note, buttons: [again], key: `drill:${d.token}:done` };
  }
  return { mood: d.mood, text: d.note, buttons: [], key: `drill:${d.token}:${game.length}:${d.tries}:${d.note}` };
}

/** After two wrong tries, the arrow shows the move. */
function drillShapes(): DrawShape[] {
  const d = drill;
  if (!d || d.state !== "playing" || d.waiting || d.tries < 2 || game.position.turn !== d.user) return [];
  const move = d.slipped ? d.best?.move : d.script[game.length];
  return move ? [{ orig: makeSquare(move.from) as Key, dest: makeSquare(move.to) as Key, brush: "you" }] : [];
}

/** The setup checklist under the board: a tick for each part that's in place. */
function drawDrillSetup() {
  const box = $("drill-setup");
  const system = drill ? drillSystem() : undefined;
  box.hidden = !drill || !system;
  document.body.classList.toggle("drilling", !!drill);
  if (!drill || !system) return;
  const [, missing] = setupProgress(game.position, drill.user, system.setup);
  const colour = drill.user;
  const roles: Record<string, Role> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
  box.replaceChildren(...system.setup.map((goal) => {
    const chip = document.createElement("span");
    chip.className = "setup-chip";
    chip.classList.toggle("done", !missing.includes(goal));
    chip.title = goalWords(goal);
    if (typeof goal === "string") {
      chip.innerHTML = `<span class="mini-piece king ${colour}"></span><span>castle</span>`;
    } else {
      const role = roles[goal[0]] ?? "pawn";
      chip.innerHTML = `<span class="mini-piece ${role} ${colour}"></span><span>${goal[1].join("/")}</span>`;
    }
    return chip;
  }));
}

/** Play a practice match with an opening: the practice screen, set up for it. */
function practiseOpening(name: string) {
  const opening = REPERTOIRE.find((o) => o.name === name);
  resetBoard(new Game());
  const practice = menuCard.querySelector<HTMLInputElement>('input[name="mode"][value="practice"]');
  if (practice) practice.checked = true;
  opponentBox.selectedIndex = 0;
  if (opening) {
    colourBox.value = opening.colour === "white" ? "White" : "Black";
    matchColour = opening.colour;
    myOpeningBox.value = menuName(opening);
  }
  refresh();
  showMenu();
  homeChoice = "practice";
  showScreen("practice");
}

/** Back to Training, on the Openings tab. */
function backToTraining(name: string) {
  resetBoard(new Game());
  refresh();
  showMenu();
  homeChoice = "train";
  trainTab = "openings";
  learnOpening = name;
  learnColour = REPERTOIRE.find((o) => o.name === name)?.colour ?? "white";
  $("lesson-list").hidden = true;
  showScreen("train");
  drawTrainScreen();
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
  void position;
  return "best";
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
const HARSH = new Set(["Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"]);
let deepNeeded: Chess[] = []; // positions waiting for that second look
let deepMoves: DeepMove[] = []; // moves waiting for it

// A drop in the mover's winning chance this big (lichess's measure) also gets the second look
const BIG_DROP = 8;

function rateMove(before: Chess, move: NormalMove): Review | undefined {
  const key = `${fenOf(before)} ${makeUci(move)}`;
  let review = reviewCache.get(key);
  if (!review) {
    review = reviewMove(before, move, analyser.evals, analyser.isPoisoned(before, move));
    if (!review) return undefined;
    const after = positionAfter(before, move);
    const checked = analyser.isDeep(before) && analyser.isDeep(after);
    // a piece offered up may be a brilliant sacrifice the quick look misjudged
    const offered = isSacrifice(before, move, after);
    const suspicious = HARSH.has(review.rating) || bigDrop(before, after) || offered !== undefined;
    if (!suspicious || checked) reviewCache.set(key, review);
    else deepMoves.push({ before, move, after, offered });
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
  deepMoves = [];
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
    analyser.requestDeepMoves(deepMoves);
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
  drawCoachFace(reviews);
  drawEditor();
  drawDrillSetup();
  drawWhatIf();
  drawMoveStrip(reviews, info);
  syncDropdowns();
  applyView();
  drawTurn();
  drawButtons();
  drawCoach();
  drawDemo();
  drawPrep(reviews);
  drawStatsBack();
}

/** Show the parts of the page that belong to the current mode. */
function applyMode() {
  const practice = mode === "practice";
  document.body.classList.toggle("practice", practice);
  modeTitle.textContent = practice ? "Practice" : "Play";
  for (const element of [coachPanel, reviewArea]) element.hidden = !practice || demo !== null;
  undoButton.hidden = !practice || demo !== null || !match;
  demoPanel.hidden = demo === null;
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
/** During a replay: the move just played, as an arrow. */
function replayShapes(): DrawShape[] {
  const ply = currentPly();
  if (!replaying || !ply || analysis) return [];
  const before = game.positionAt(ply - 1);
  const move = game.moves[ply - 1].move;
  const mine = before.turn === (listener() ?? orientation);
  return [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: mine ? "you" : "them" }];
}

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
  if (stepper?.frames) {
    last = undefined;
  } else if (stepper && stepper.step > 0) {
    const move = stepper.moves[stepper.step - 1];
    last = [makeSquare(move.from) as Key, arrowEnd(stepper.positions[stepper.step - 1], move)];
  } else if (quizLine && quiz?.lineStep) {
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
  ground.setAutoShapes(stepper ? stepperShapes() : drill ? drillShapes() : puzzle ? puzzleShapes() : editor ? [] : demo ? demoShapes() : [...badgeShapes(reviews, info), ...arrowShapes(), ...replayShapes()]);
  if (editor || demo?.intro) last = undefined;
  ground.set({
    fen: fenOf(position),
    orientation,
    turnColor: quizWaiting() ? quiz!.threat!.them : position.turn,
    lastMove: last,
    check: quizWaiting() ? false : position.isCheck(),
    movable: editor && !editor.pick
      ? { color: "both", free: true, showDests: false }
      : { color: colour, free: false, showDests: true, dests: colour ? chessgroundDests(movesFrom) : new Map() },
    draggable: { deleteOnDropOff: !!editor && !editor.pick },
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
  // Captures count from where this game started (a puzzle or set-up position
  // isn't the usual starting position); while setting up, there are none
  const startBoard = editor ? board : game.positionAt(0).board;
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
    name.textContent = demo && bar.id === "bar-top" ? demoTitle()
      : drill && bar.id === "bar-top" ? `${openingShortName(drill.demo.opening)} drill · Round ${drill.round}`
      : puzzle && bar.id === "bar-top" ? `${puzzle.phase === "openings" ? "Opening trap" : "Puzzle"} · ${PUZZLE_LEVELS.find(([v]) => v === puzzle!.level)?.[1]}${puzzle.streak ? ` · ${puzzle.streak} in a row` : ""}`
      : editor && bar.id === "bar-top" ? "Set up a position"
      : lesson && bar.id === "bar-top" ? `Lesson ${lesson.index + 1}: ${LESSONS[lesson.phase][lesson.index].title}`
      : barName(colour);
    name.title = `${name.textContent} - ${colour === "white" ? "White" : "Black"}`;
    // The pieces this side has taken (the other side's missing pieces)
    const taken = opposite(colour);
    const captured = bar.querySelector<HTMLElement>(".pb-captured")!;
    captured.replaceChildren();
    for (const role of CAPTURE_ORDER) {
      const missing = Math.max(0, startBoard.pieces(taken, role).size() - board.pieces(taken, role).size());
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
    stepper !== null || overlayOpen() || document.querySelector("dialog[open]") !== null;
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
    // Only the moves worth noticing get a colour and a mark (book moves stay plain)
    const mark = review && !bookMove ? MOVE_MARKS[review.rating] : undefined;
    if (mark !== undefined) button.classList.add(ratingClass(review!.rating));
    button.textContent = played.san + (mark && !played.san.endsWith("#") ? mark : "");
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
  // In a What-if the buttons step through its moves
  const back = analysis ? analysis.line.length > 0 : current > 0;
  const forward = analysis ? analysis.ahead.length > 0 : current < total;
  const enabled = [back, back, forward, forward];
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
      td.textContent = accuracy.toFixed(1); // (like chess.com: 96.3)
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

/** The ratings worth noticing in the move list, and their marks. */
const MOVE_MARKS: Record<string, string> = {
  Brilliant: "!!", Great: "!", Best: "★", Inaccuracy: "?!", Mistake: "?", Miss: "×", "Missed Win": "×", Blunder: "??",
};

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

// ---------------------------------------------------------------------------
// The coach: the review spoken by a cartoon face (a strip above the board on
// phones; a feed of earlier moves and a speech bubble on desktops)
// ---------------------------------------------------------------------------

// The coach's bubble above the board is always the same size: one short,
// natural line (the board and its rating icon show which move), with icon
// buttons for more. "Tell me more" opens the overlay; lines of moves are
// talked through one move at a time by the stepper.

interface CoachButton {
  ico: string;
  label: string;
  run: () => void;
  kind?: "accent" | "soft" | "hazard" | `hazard ${string}`;
  labelled?: boolean; // shows its label as well as the icon
}

interface CoachSay {
  mood: Mood;
  text: string;
  buttons: CoachButton[];
  key?: string; // a new key means "say it (again)"; by default the move and the words
}

const faces = new Map<HTMLElement, string>(); // what each face shows, so it's only redrawn on a change

function setFace(element: HTMLElement, mood: Mood, size: number) {
  const key = `${mood}/${size}`;
  if (faces.get(element) === key) return;
  faces.set(element, key);
  element.innerHTML = avatarSvg(mood, size);
}

/** Who the coach is talking to: you in a match, otherwise nobody in particular. */
function listener(): Color | null {
  if (explore) return explore.user;
  if (reviewing && reviewTitle) return reviewSide;
  if (match) return match.user;
  if (reviewing && !reviewTitle) return orientation; // your own finished game
  return null;
}

const TELL_MORE: CoachButton = { ico: "dots", label: "Tell me more", run: () => openMore() };
const STRATEGY: CoachButton = { ico: "target", label: "Strategy", run: () => void openStrategy(), kind: "accent" };

/** What the coach says about the position on screen. */
function coachSays(reviews: (Review | undefined)[]): CoachSay {
  if (silentJump) return { mood: "talk", text: "", buttons: [], key: "silent" };
  if (busy) return { mood: "think", text: statusMessage || "Hmm, let me think...", buttons: [] };
  if (editor) return { mood: "talk", text: editor.pick
    ? "Tap squares to place it, or tap it again to put it away. Done when you're ready."
    : "Drag pieces to move them (off the board to remove), or pick a piece below to add. Done when you're ready.", buttons: [] };
  if (drill) return drillSays();
  if (puzzle) return puzzleSays();
  if (lesson) return { mood: "talk", text: LESSONS[lesson.phase][lesson.index].title, buttons: [] };
  if (demo?.intro) {
    const lines = demo.demo.lines;
    const count = lines.length === 1 ? "one line" : `${lines.length} lines`;
    const start = `The ${openingShortName(demo.demo.opening)} has ${count}. We'll go through all of them, starting with the main line.`;
    const text = demo.line === 0
      ? `${start} ${demo.demo.intro} Here's how it starts. Ready when you are: press play.`
      : `${lines[demo.line].about ?? demo.demo.intro} When you're ready, let's go: press play.`;
    const play: CoachButton = { ico: "play", label: "Play the line", run: startDemoLine, kind: "accent" };
    return { mood: "talk", text, buttons: [play], key: `demo:${demo.line}:intro` };
  }
  if (demo) {
    const ply = currentPly();
    const step = ply ? demo.steps[ply - 1] : undefined;
    const lines = demo.demo.lines;
    let text: string;
    if (!ply && !demo.playing) {
      const count = lines.length === 1 ? "one line" : `${lines.length} lines`;
      const start = `The ${openingShortName(demo.demo.opening)} has ${count}. We'll go through all of them, starting with the main line.`;
      text = demo.line === 0 ? `${start} ${demo.demo.intro}` : lines[demo.line].about ?? demo.demo.intro;
    } else if (!ply) {
      text = "Here we go.";
    } else {
      text = step!.note ?? narrateMove(game.positionAt(ply - 1), step!.move, null);
    }
    const atEnd = ply >= game.length;
    const buttons: CoachButton[] = atEnd ? [{ ico: "bulb", label: "What you get", run: () => void showWhatYouGet(), kind: "accent" }] : [];
    return { mood: step?.note || !ply ? "talk" : "happy", text, buttons, key: `demo:${demo.line}:${ply}` };
  }
  if (mode === "play") {
    if (match) {
      const yours = game.position.turn === match.user;
      return thinking || !yours
        ? { mood: "think", text: "Stockfish is thinking...", buttons: [] }
        : { mood: "talk", text: game.length ? "Your move." : "Your move. Good luck!", buttons: [] };
    }
    if (canReview) return { mood: "happy", text: "Good game! Shall we go through it together?", buttons: [{ ico: "search", label: "Review the game", run: onReviewGame, kind: "accent" }] };
    return { mood: "talk", text: game.length ? "That's the end of the game." : "Press New game to start.", buttons: [] };
  }
  if (quizWaiting()) {
    return { mood: "think", text: "What are they threatening? Play their move on the board.", buttons: [{ ico: "close", label: "Stop the quiz", run: () => { quiz = null; refresh(); }, kind: "soft" }] };
  }
  if (quiz?.answered && quiz.result) {
    const [correct, text] = quiz.result;
    const short = correct ? "Yes, that's their idea. Well spotted!" : "Not quite. Tap the dots and I'll show you.";
    void text;
    return { mood: correct ? "happy" : "worried", text: short, buttons: [TELL_MORE, { ico: "close", label: "Done", run: () => { quiz = null; refresh(); }, kind: "soft" }] };
  }
  if (analysis) {
    const review = ratingsOn() ? analysisReview() : undefined;
    if (!analysis.line.length) return { mood: "talk", text: "Try any move to see what would have happened.", buttons: [] };
    if (!review) return { mood: "think", text: "Let me check that move...", buttons: [] };
    const line = analysis.line;
    const before = line.positionAt(line.length - 1);
    const after = line.positionAt(line.length);
    return { mood: moodForRating(review.rating), text: verdict(review, before, after, analyser.evals.get(fenOf(after)), before.turn, line.length), buttons: [] };
  }
  if (explore) return exploreSays(reviews);
  const ply = reviewPly();
  if (!ratingsOn()) return { mood: "talk", text: "Move ratings are off.", buttons: [STRATEGY] };
  if (ply === 0) return { mood: "talk", text: game.length ? "The starting position." : "Make a move and I'll tell you what I think.", buttons: [STRATEGY] };
  const review = reviews[ply - 1];
  if (!review) return { mood: "think", text: "Hmm, let me check that move...", buttons: [STRATEGY] };
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const text = verdict(review, before, after, analyser.evals.get(fenOf(after)), listener(), ply, watching());
  // a good move that wasn't the best: the bulb (why it's good, then the best move) instead of Tell me more
  const more: CoachButton = notTheBest(ply, review) ? { ico: "bulb", label: "See the best move", run: () => void showBestLine(ply) } : TELL_MORE;
  return { mood: moodForRating(review.rating), text, buttons: [more, STRATEGY] };
}

/** An icon button that also shows its words, when the button asks for it. */
function labelledButton(button: CoachButton): HTMLButtonElement {
  const element = iconButton(button);
  if (button.labelled) {
    const words = document.createElement("span");
    words.textContent = button.label;
    element.append(words);
    element.classList.add("labelled");
  }
  return element;
}

function iconButton(button: CoachButton, size = 18): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `round ${button.kind ?? ""}`;
  element.title = button.label;
  element.setAttribute("aria-label", button.label);
  element.innerHTML = icon(button.ico, size);
  element.addEventListener("click", button.run);
  return element;
}

function drawCoachFace(reviews: (Review | undefined)[]) {
  lastReviews = reviews;
  const say = coachSays(reviews);
  setFace($("strip-face"), say.mood, 46);
  stripButtons = say.buttons;
  drawStripActions(true); // first, so the words are measured against the room the buttons leave
  speak(say.text, say.key ?? `${currentPly()}:${say.text}`);
  drawStripActions();
  drawStepper();
}

// -- The coach's bubble: words typed out, a piece at a time ----------------------

interface Speech {
  key: string;
  pieces: string[];
  index: number;
  hold: number; // the timer before the next piece
  done: boolean; // every piece said (and read)
}

let speech: Speech = { key: "", pieces: [""], index: 0, hold: 0, done: true };
let stripButtons: CoachButton[] = [];
let lastReviews: (Review | undefined)[] = [];
const stripTyper = new Typer($("strip-text"), () => pieceTyped());

/** Say something in the bubble. Long words are cut into pieces that fit; each
 *  is typed out, stays up long enough to read, then the next one follows. */
function speak(text: string, key: string) {
  if (key === speech.key) return;
  clearTimeout(speech.hold);
  const box = $("strip-text");
  speech = { key, pieces: splitToFit(text, (piece) => fitsIn(box, piece)), index: 0, hold: 0, done: false };
  stripTyper.type(speech.pieces[0], true);
}

function pieceTyped() {
  const current = speech;
  clearTimeout(current.hold);
  current.hold = window.setTimeout(() => {
    if (speech !== current) return;
    if (current.index + 1 < current.pieces.length) showPiece(current.index + 1);
    else if (!current.done) {
      current.done = true;
      onSpoken();
    }
  }, readingTime(current.pieces[current.index] ?? ""));
}

function showPiece(index: number) {
  speech.index = Math.max(0, Math.min(index, speech.pieces.length - 1));
  stripTyper.type(speech.pieces[speech.index], true);
  drawStripActions();
}

/** The bubble's buttons: ‹ › through the pieces (when there's more than one), then the coach's own. */
function drawStripActions(roomForNav = false) {
  const nav: HTMLButtonElement[] = [];
  if (speech.pieces.length > 1 || roomForNav) {
    const back = iconButton({ ico: "back", label: "Back a sentence", run: () => showPiece(speech.index - 1), kind: "soft" }, 16);
    const next = iconButton({ ico: "next", label: "Next sentence", run: () => showPiece(speech.index + 1), kind: "soft" }, 16);
    back.disabled = speech.index === 0;
    next.disabled = speech.index + 1 >= speech.pieces.length;
    back.classList.add("piece-nav");
    next.classList.add("piece-nav");
    nav.push(back, next);
  }
  $("strip-actions").replaceChildren(...nav, ...stripButtons.map((b) => iconButton(b)));
}

/** Everything in the bubble has been said: a demo or a replay moves on. */
function onSpoken() {
  if (demo?.playing && !stepper && !busy) {
    if (currentPly() >= game.length) {
      demo.playing = false;
      refresh();
      void showWhatYouGet();
    } else {
      scheduleDemo(500);
    }
  }
}

// -- Tell me more: the board dims and the coach explains in full ----------------

const overlay = () => $("coach-overlay");
const overlayOpen = () => !overlay().hidden;

function showOverlay(mood: Mood, content: (Node | string)[], buttons: CoachButton[]) {
  setFace($("overlay-face"), mood, 64);
  $("overlay-text").replaceChildren(...content);
  $("overlay-actions").replaceChildren(...buttons.map((b) => {
    const element = iconButton(b, 20);
    const label = document.createElement("span");
    label.textContent = b.label;
    element.append(label);
    element.classList.add("labelled");
    return element;
  }));
  overlay().hidden = false;
  refresh();
}

function closeOverlay(redraw = true) {
  if (overlay().hidden) return;
  overlay().hidden = true;
  if (redraw) refresh();
}

const para = (text: string, className = "") => {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
};

const CLOSE: CoachButton = { ico: "close", label: "Back", run: () => closeOverlay(), kind: "soft" };

/** The quiz result in plain words: was it their idea, and if not, what their
 *  idea really is (the board's "Show me" plays it out). */
function quizInWords(): string[] {
  const asked = quiz!;
  const threat = asked.threat!;
  const idea = threat.threatMove && threat.passed ? narrateMove(threat.passed, threat.threatMove, threat.you) : "";
  if (asked.result![0]) return [`Yes, that's their idea! ${idea}`.trim()];
  const kind = asked.explanation?.kind;
  const first = kind === "mistake" ? "That move wouldn't be a threat: it would be a mistake for them, and you could punish it."
    : kind === "smaller-threat" ? "That's a threat too, but a smaller one."
    : "That move doesn't threaten anything serious.";
  return idea ? [first, `Their real idea: ${lowerFirst(idea)}`] : [first];
}

/** Tell me more: the full review of the move (or the demo note, or the quiz result). */
function openMore() {
  if (demo) {
    const ply = currentPly();
    const note = ply ? demo.steps[ply - 1].note : demo.demo.intro;
    showOverlay("talk", [para(note ?? "Watch how the line goes.")], [CLOSE]);
    return;
  }
  if (quiz?.answered && quiz.result) {
    const parts = quizInWords().map((text) => para(text));
    const buttons: CoachButton[] = [];
    const explanation = quiz.explanation;
    if (explanation?.line.length) {
      buttons.push({ ico: "hazard", label: "Show me", kind: "hazard", run: () => {
        closeOverlay(false);
        const positions = [explanation.start];
        for (const move of explanation.line) positions.push(positionAfter(positions[positions.length - 1], move));
        startStepper(positions, explanation.line, explanation.line.map((m, i) => narrateMove(positions[i], m, listener())), "worried");
      } });
    }
    buttons.push(CLOSE);
    showOverlay(quiz.result[0] ? "happy" : "talk", parts, buttons);
    return;
  }
  const ply = reviewPly();
  const review = ratingsOn() && ply > 0 ? reviews()[ply - 1] : undefined;
  if (!review) return;
  explainMove(ply, review);
}

// Ratings where the coach shows the better move
const WORTH_SHOWING = new Set(["Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"]);

/** Tell me more about a move. A slip (inaccuracy, mistake, miss, blunder)
 *  gets a story in three parts: why it isn't the best, what it allows (played
 *  out), and the better move with how it goes on. A good move that isn't the
 *  best says why it's good, with a button to see the best move and its line. */
function explainMove(ply: number, review: Review) {
  if (review.rating === "Brilliant") return void explainBrilliant(ply);
  if (review.rating === "Great") return void explainGreat(ply);
  if (WORTH_SHOWING.has(review.rating) && review.bestSan) return void explainSlip(ply, review);
  if (notTheBest(ply, review)) return void showBestLine(ply);
  const before = game.positionAt(ply - 1);
  const played = game.moves[ply - 1].move;
  const you = listener();
  const mine = !you || game.moverOf(ply) === you;
  const why = whyMove(before, played, mine ? game.moverOf(ply) : you);
  const text = `${review.rating === "Book" ? "A known opening move" : mine ? "Why it's good" : "Their idea"}: ${why}.`;
  startStepper([before, positionAfter(before, played)], [played], [text], moodForRating(review.rating), undefined, true);
}

/** A good move that wasn't Stockfish's top choice. */
function notTheBest(ply: number, review: Review | undefined): boolean {
  if (!review?.bestSan || !["Excellent", "Good"].includes(review.rating)) return false;
  return makeSan(game.positionAt(ply - 1), game.moves[ply - 1].move) !== review.bestSan;
}

/** The arrow for a move (yours or theirs, from the viewer's side) and the
 *  pieces it then attacks. */
function moveShapes(before: Chess, move: NormalMove, viewer: Color | null): DrawShape[] {
  const mover = before.board.get(move.from)?.color;
  const shapes: DrawShape[] = [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: mover === (viewer ?? orientation) ? "you" : "them" }];
  if (!isCastling(before, move)) {
    const after = positionAfter(before, move);
    for (const square of targetsOf(after, move.to)) shapes.push({ orig: makeSquare(square) as Key, brush: "threat" });
  }
  return shapes;
}

/** A line as pages: the board after each move, with its arrow and a sentence. */
function linePages(start: Chess, line: NormalMove[], viewer: Color | null): { frames: StepFrame[]; texts: string[] } {
  const story = talkLine(start, line, viewer);
  const frames = line.map((move, i) => ({ position: story.positions[i + 1], shapes: moveShapes(story.positions[i], move, viewer) }));
  return { frames, texts: story.texts };
}

/** More pages for a card that is still open (a line Stockfish has just found). */
function extendPages(card: Stepper | null, frames: StepFrame[], texts: string[], chapter: number) {
  if (!card || stepper !== card || !frames.length) return;
  card.frames!.push(...frames);
  card.texts.push(...texts);
  card.chapterOf!.push(...frames.map(() => chapter));
  refresh();
}

/** A card of pages in parts ("Why", "What it allows", ...), opening on its first page. */
function startStory(first: StepFrame, text: string, mood: Mood, chapters: string[]): Stepper {
  closeOverlay(false);
  stepper = { positions: [], moves: [], texts: [text], step: 1, mood, frames: [first], chapters, chapterOf: [0] };
  refresh();
  return stepper;
}

/** A slip, in three parts: why it isn't the best, what it allows, better was. */
async function explainSlip(ply: number, review: Review) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const beforeEval = analyser.evals.get(fenOf(before));
  const afterEval = analyser.evals.get(fenOf(after));
  const info = openingInfo();
  const danger = dangerAfter(review, before, after, beforeEval, afterEval, !!info[ply - 1]?.book, viewer);
  const reply = after.isEnd() ? undefined : afterEval?.best;
  // Why: what it costs, and their idea as an arrow
  const swing = beforeEval && afterEval ? ` Before it, ${verdictWords(beforeEval.score)}; after it, ${verdictWords(afterEval.score)}.` : "";
  const idea = reply ? ` The ${mine ? "red" : "blue"} arrow shows what it lets ${mine ? "them" : "you"} do.` : "";
  // (the chips above the text name each part, so the text needn't)
  const why = `${danger ? danger.text : "It's a small slip."}${swing}${idea}`;
  const shapes = moveShapes(before, played, viewer).slice(0, 1);
  if (reply) {
    shapes.push({ orig: makeSquare(reply.from) as Key, dest: arrowEnd(after, reply), brush: mine ? "them" : "you" });
    if (after.board.get(reply.to)) shapes.push({ orig: makeSquare(reply.to) as Key, brush: "threat" });
  }
  const theirSlip = !mine && viewer !== null;
  const card = startStory({ position: after, shapes }, why, moodForRating(review.rating),
    theirSlip ? ["Why", "What you can do", "Better for them"] : ["Why", "What it allows", "Better was"]);
  moveSound(makeSan(before, played), before.turn);
  try {
    // What it allows: Stockfish's best line after the move
    if (reply) {
      const punish = await coachLine(after, 1.5);
      const line = wholeLine(after, punish?.pv ?? [], 3);
      if (punish && line.length) {
        const pages = linePages(after, line, viewer);
        pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(after, line, punish.score, opposite(mover), viewer)}`;
        extendPages(card, pages.frames, pages.texts, 1);
      }
    }
    // Better was: the best move, and how it goes on
    const best = parseSan(before, review.bestSan!) as NormalMove | undefined;
    if (!best) return;
    const better = await coachLine(before, 1.5, [best]);
    const line = wholeLine(before, better?.pv.length ? better.pv : [best], 3);
    const pages = linePages(before, line, viewer);
    pages.texts[0] = cap(moveInWords(before, best, viewer));
    if (better && line.length > 1) pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(before, line, better.score, mover, viewer)}`;
    extendPages(card, pages.frames, pages.texts, 2);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    refresh();
  }
}

/** See the best move: for a good move that wasn't the top one, a card that
 *  says why the move is good, then (one tap on) the best move and how the
 *  game would go on. */
async function showBestLine(ply: number) {
  const review = ratingsOn() ? reviews()[ply - 1] : undefined;
  if (!review?.bestSan) return;
  const before = game.positionAt(ply - 1);
  const best = parseSan(before, review.bestSan) as NormalMove | undefined;
  if (!best) return;
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const why = `${cap(whyMove(before, played, viewer))}.`;
  const card = startStory({ position: positionAfter(before, played), shapes: moveShapes(before, played, viewer) }, why,
    moodForRating(review.rating), [mine ? "Why it's good" : "Their idea", "Best move"]);
  try {
    const line = await coachLine(before, 1.5, [best]);
    const moves = wholeLine(before, line?.pv.length ? line.pv : [best], 3);
    const pages = linePages(before, moves, viewer);
    pages.texts[0] = cap(moveInWords(before, best, viewer));
    if (line && moves.length > 1) pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(before, moves, line.score, mover, viewer)}`;
    extendPages(card, pages.frames, pages.texts, 1);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    refresh();
  }
}

const MATERIAL: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const NAME: Record<string, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };

/** Material of one side minus the other's. */
function materialFor(position: Chess, side: Color): number {
  let total = 0;
  for (const square of position.board.occupied) {
    const piece = position.board.get(square)!;
    total += (piece.color === side ? 1 : -1) * MATERIAL[piece.role];
  }
  return total;
}

/** How a line ends for `side`, in words: checkmate, the biggest piece won, or
 *  the verdict ("you" when `side` is the viewer's, "they" when it isn't). */
function lineOutcome(start: Chess, line: NormalMove[], score: Score, side: Color, viewer: Color | null): string {
  const you = side === viewer;
  const positions = [start];
  for (const move of line) positions.push(positionAfter(positions[positions.length - 1], move));
  const end = positions[positions.length - 1];
  if (end.isCheckmate()) return "it's checkmate!";
  const gain = materialFor(end, side) - materialFor(start, side);
  if (gain >= 3) {
    // the most valuable piece of theirs that went missing
    const them = opposite(side);
    const lost = (["queen", "rook", "bishop", "knight"] as PieceRole[]).find((role) => end.board.pieces(them, role).size() < start.board.pieces(them, role).size());
    const named = viewer === null; // watching: "White wins Black's queen"
    const who = named ? colourName(side) : you ? "you" : "they";
    const win = named ? "wins" : "win";
    const come = named ? "comes" : "come";
    if (lost === "queen") return `${who} ${win} ${whoseOf(them, viewer)} queen.`;
    return gain >= 5 ? `${who} ${come} out well ahead in material.` : `${who} ${come} out a ${lost ? NAME[lost] : "piece"} up.`;
  }
  return `${verdictWords(score)}.`;
}

/** The first `count` moves of a line, carried on while pieces are still
 *  being taken, so it never stops in the middle of an exchange. */
function wholeLine(start: Chess, pv: NormalMove[], count: number): NormalMove[] {
  let walk = start;
  const line: NormalMove[] = [];
  for (const move of pv) {
    const capture = walk.board.get(move.to) !== undefined;
    if (line.length >= count && !capture) break;
    if (line.length >= count + 3) break;
    line.push(move);
    walk = positionAfter(walk, move);
  }
  return line;
}

/** "your" / "their" from the viewer's side, or "White's" / "Black's" when watching. */
function whoseOf(side: Color, viewer: Color | null): string {
  if (viewer === null) return side === "white" ? "White's" : "Black's";
  return side === viewer ? "your" : "their";
}

/** The moves of a line from a position, with a sentence for each. */
function talkLine(start: Chess, line: NormalMove[], viewer: Color | null): { positions: Chess[]; texts: string[] } {
  const positions = [start];
  const texts: string[] = [];
  for (const move of line) {
    texts.push(narrateMove(positions[positions.length - 1], move, viewer));
    positions.push(positionAfter(positions[positions.length - 1], move));
  }
  return { positions, texts };
}

/** Add more moves (and what's said about them) to the open step-through card,
 *  if it's still the one they belong to. */
function extendStepper(card: Stepper | null, positions: Chess[], moves: NormalMove[], texts: string[]) {
  if (!card || stepper !== card || !moves.length) return;
  card.positions.push(...positions);
  card.moves.push(...moves);
  card.texts.push(...texts);
  refresh();
}

/** Tell me more about a brilliant move: the piece it offers, and what
 *  happens if they take it - the trap it sets, played out on the board.
 *  The card opens at once with the move; Stockfish's line follows. */
async function explainBrilliant(ply: number) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const offered = isSacrifice(before, played, after);
  const piece = offered !== undefined ? after.board.get(offered) : undefined;
  const takes: NormalMove[] = [];
  if (offered !== undefined) {
    for (const [from, dests] of after.allDests()) if (dests.has(offered)) takes.push({ from, to: offered });
  }
  const whose = whoseOf(mover, viewer);
  const intro = `Brilliant! ${narrateMove(before, played, viewer)}`;
  const trapped = piece !== undefined && takes.length > 0;
  let first = `${intro} A bold move that Stockfish confirms.`;
  if (trapped) {
    // who can take it: the cheapest piece that can
    const taker = takes.map((m) => after.board.get(m.from)!.role).sort((a, b) => MATERIAL[a] - MATERIAL[b])[0];
    const theirs = whoseOf(opposite(mover), viewer);
    first = offered === played.to
      ? `Brilliant! ${cap(whose)} ${NAME[piece!.role]} goes where ${theirs} ${NAME[taker]} can take it, but taking it is a trap.`
      : `${intro} It leaves ${whose} ${NAME[piece!.role]} to be taken, but taking it is a trap.`;
  }
  startStepper([before, after], [played], [first], "happy");
  const card = stepper;
  try {
    const taken = trapped ? await coachLine(after, 1.5, takes) : undefined;
    if (taken?.pv.length) {
      const line = wholeLine(after, taken.pv, 5);
      const story = talkLine(after, line, viewer);
      const best = await coachLine(after, 1);
      const trap = best?.pv[0] && makeUci(best.pv[0]) !== makeUci(line[0]);
      const texts = story.texts.map((text, i) => i === 0 ? `If ${viewer === null ? colourName(opposite(mover)) : "they"} take${viewer === null ? "s" : ""} it: ${lowerFirst(text)}` : text);
      texts[texts.length - 1] += ` In the end, ${lineOutcome(after, line, taken.score, mover, viewer)}`;
      if (trap) texts[texts.length - 1] += viewer === null ? ` So ${colourName(opposite(mover))} shouldn't take it.` : " So they shouldn't take it.";
      extendStepper(card, story.positions.slice(1), line, texts);
      return;
    }
    // no piece to take: show what the move sets up
    const best = await coachLine(after, 1.5);
    if (!best?.pv.length) return;
    const line = wholeLine(after, best.pv, 4);
    const story = talkLine(after, line, viewer);
    const texts = [...story.texts];
    texts[texts.length - 1] += ` In the end, ${lineOutcome(after, line, best.score, mover, viewer)}`;
    extendStepper(card, story.positions.slice(1), line, texts);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    refresh();
  }
}

/** Tell me more about a great move: it was the only good one, and the board
 *  plays out the opportunity it creates. The card opens at once. */
async function explainGreat(ply: number) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const why = whyMove(before, played, viewer);
  // why it had to be this move: the piece was under attack, or what it does
  const piece = before.board.get(played.from)!;
  const attacked = before.kingAttackers(played.from, opposite(mover), before.board.occupied).nonEmpty();
  const reason = attacked && piece.role !== "king" ? `It gets ${whoseOf(mover, viewer)} ${NAME[piece.role]} out of danger.` : why && why !== "it's a useful waiting move" ? `${cap(why)}.` : "";
  const intro = `Great move! ${narrateMove(before, played, viewer)} ${reason} It was the only good move here: everything else was clearly worse.`.replace(/  +/g, " ");
  startStepper([before, after], [played], [intro], "happy");
  const card = stepper;
  try {
    const best = await coachLine(after, 1.5);
    const line = wholeLine(after, best?.pv ?? [], 3);
    if (!best || !line.length) return;
    const story = talkLine(after, line, viewer);
    const texts = [...story.texts];
    // still worse after the only move: it keeps you in the game
    const behind = winningChance(best.score, mover) < 45;
    texts[texts.length - 1] += behind
      ? ` ${cap(verdictWords(best.score))}, but this move keeps ${viewer === null ? colourName(mover) : mover === viewer ? "you" : "them"} in the game.`
      : ` In the end, ${lineOutcome(after, line, best.score, mover, viewer)}`;
    extendStepper(card, story.positions.slice(1), line, texts);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    refresh();
  }
}

/** The reviews of the game's moves (the same ones the move list shows). */
function reviews(): (Review | undefined)[] {
  return moveReviews();
}

// -- The stepper: a line of moves, talked through one move at a time -----------

interface Stepper {
  positions: Chess[]; // before the first move, then after each
  moves: NormalMove[];
  texts: string[];
  step: number; // 1 = after the first move
  mood: Mood;
  extra?: CoachButton | CoachButton[];
  illustration?: boolean; // one move, with what the piece controls
  frames?: StepFrame[]; // lesson pages (or illustrations) instead of moves
  chapters?: string[]; // the parts of the story ("Why", "What it allows", "Better was")
  chapterOf?: number[]; // each page's part
}

interface StepFrame {
  position: Chess;
  shapes: DrawShape[];
  odds?: LikelyMove[]; // their likely moves, with chances
  others?: number; // the chance of anything else
}

let stepper: Stepper | null = null;

function startStepper(positions: Chess[], moves: NormalMove[], texts: string[], mood: Mood, extra?: CoachButton, illustration = false) {
  if (!moves.length) return;
  closeOverlay(false);
  stepper = { positions, moves, texts, step: 1, mood, extra, illustration };
  moveSound(makeSan(positions[0], moves[0]), positions[0].turn);
  refresh();
}

const stepCount = () => (stepper?.frames ? stepper.frames.length : stepper?.moves.length ?? 0);

function stepTo(step: number) {
  if (!stepper) return;
  const next = Math.max(1, Math.min(step, stepCount()));
  if (next > stepper.step && !stepper.frames) moveSound(makeSan(stepper.positions[next - 1], stepper.moves[next - 1]), stepper.positions[next - 1].turn);
  stepper.step = next;
  refresh();
}

function closeStepper() {
  stepper = null;
  silentJump = false;
  if (lesson) {
    // leaving a lesson goes back to the list
    lesson = null;
    showMenu();
    homeChoice = "train";
    showScreen("train");
    showLessonList();
    return;
  }
  refresh();
}

const stepTyper = new Typer($("step-text"));

function drawStepper() {
  const box = $("stepper");
  const area = document.querySelector<HTMLElement>(".board-area")!;
  area.classList.toggle("stepping", stepper !== null);
  box.hidden = !stepper;
  if (!stepper) return;
  $("step-count").textContent = stepCount() > 1 ? `${stepper.step}/${stepCount()}` : "";
  // the parts of the story, the current one lit (a tap jumps to it)
  const chapters = $("step-chapters");
  const card = stepper;
  chapters.hidden = !card.chapters;
  chapters.replaceChildren(...(card.chapters ?? []).map((label, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    const first = card.chapterOf?.indexOf(i) ?? -1;
    chip.classList.toggle("on", card.chapterOf?.[card.step - 1] === i);
    chip.disabled = first < 0; // (still being worked out)
    chip.addEventListener("click", () => stepTo(first + 1));
    return chip;
  }));
  for (const id of ["step-back", "step-next"]) $(id).hidden = stepCount() < 2;
  stepTyper.type(stepper.texts[stepper.step - 1] ?? "");
  const frame = stepper.frames?.[stepper.step - 1];
  const odds = $("step-odds");
  odds.hidden = !frame?.odds?.length;
  odds.replaceChildren(...(frame?.odds ?? []).map((o) => {
    const row = document.createElement("div");
    row.className = "odds-row";
    row.innerHTML = `<b></b><span class="odds-bar"><i style="width:${o.chance}%"></i></span><span>${o.chance}%</span>`;
    row.querySelector("b")!.textContent = `${frame!.position.turn === "black" ? "..." : ""}${o.san}`;
    return row;
  }));
  if (frame?.odds?.length && frame.others) {
    const row = document.createElement("div");
    row.className = "odds-row others";
    row.innerHTML = `<b>Others</b><span class="odds-bar"><i style="width:${frame.others}%"></i></span><span>${frame.others}%</span>`;
    odds.append(row);
  }
  setFace($("step-face"), stepper.mood, 34);
  $<HTMLButtonElement>("step-back").disabled = stepper.step <= 1;
  $<HTMLButtonElement>("step-next").disabled = stepper.step >= stepCount();
  // the extra button (e.g. "Try it") only on the last page of a lesson
  const extra = stepper.extra && (!stepper.frames || stepper.step >= stepCount()) ? [stepper.extra].flat().map(labelledButton) : [];
  $("step-extra").replaceChildren(...extra);
}

/** On the board while stepping: the move just played, and what it hits. */
function stepperShapes(): DrawShape[] {
  if (stepper?.frames) return stepper.frames[stepper.step - 1].shapes;
  if (!stepper || stepper.step < 1) return [];
  const before = stepper.positions[stepper.step - 1];
  const after = stepper.positions[stepper.step];
  const move = stepper.moves[stepper.step - 1];
  const mover = before.board.get(move.from)?.color;
  const yours = mover === (listener() ?? orientation);
  const shapes: DrawShape[] = [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: yours ? "you" : "them" }];
  const landing = isCastling(before, move) ? undefined : move.to;
  if (landing !== undefined && stepper.illustration) {
    // What the piece controls from its new square
    for (const square of controlledSquares(after, landing)) {
      shapes.push({ orig: makeSquare(landing) as Key, dest: makeSquare(square) as Key, brush: "control" });
    }
  } else if (landing !== undefined) {
    for (const square of targetsOf(after, landing)) shapes.push({ orig: makeSquare(square) as Key, brush: "threat" });
  }
  return shapes;
}

// -- Strategy: straight to the main idea --------------------------------------

/** If the position is in one of the opening demos, the next few moves of
 *  that line (with the demo's notes where it has them). */
function demoLineFrom(position: Chess): { moves: NormalMove[]; texts: string[]; name: string } | undefined {
  const key = fenOf(position).split(" ").slice(0, 4).join(" ");
  const preferred = match?.myOpening?.name;
  const order = [...DEMOS].sort((a, b) => Number(b.opening === preferred) - Number(a.opening === preferred));
  for (const d of order) {
    for (let i = 0; i < d.lines.length; i++) {
      const steps = demoSteps(d, i);
      let board = Chess.default();
      for (let k = 0; k < steps.length; k++) {
        if (fenOf(board).split(" ").slice(0, 4).join(" ") === key) {
          const rest = steps.slice(k, k + 4);
          const positions = [position];
          for (const step of rest) positions.push(positionAfter(positions[positions.length - 1], step.move));
          return {
            name: d.opening,
            moves: rest.map((step) => step.move),
            texts: rest.map((step, n) => step.note?.replace(/Transposition:.*$/, "").trim() || narrateMove(positions[n], step.move, listener())),
          };
        }
        board = positionAfter(board, steps[k].move);
      }
    }
  }
  return undefined;
}

const QUIZ: CoachButton = { ico: "quiz", label: "Quiz me: spot their idea", run: () => { closeStepper(); void startTask("quiz"); }, kind: "accent" };

/** The playing style chosen in the settings (positional unless changed). */
const playStyle = (): Style => (planModeBox.value === "attacking" ? "attacking" : "positional");

/** Strategy: the opening's main line if we're in one, otherwise Stockfish's
 *  plan - then, where there is one, a good alternative in your playing style. */
async function openStrategy() {
  if (busy) return;
  const position = base();
  const style = playStyle();
  const known = demoLineFrom(position);
  setBusy(true, "Let me find the best plan...");
  try {
    const lines = await coachAnalysis.analyse(position, 1.5, 5);
    const found = styleAlternative(position, lines, style);
    let positions: Chess[];
    let moves: NormalMove[];
    let texts: string[];
    if (known) {
      moves = known.moves;
      texts = [...known.texts];
      texts[0] = `The ${known.name.replace(/ \(.*\)$/, "")} plan: ${lowerFirst(texts[0])}`;
      positions = [position];
      for (const move of moves) positions.push(positionAfter(positions[positions.length - 1], move));
    } else {
      const plan = await planAhead(coachAnalysis, position);
      moves = plan.steps.slice(0, 4).map((step) => step.move);
      positions = plan.positions.slice(0, moves.length + 1);
      // spoken to the side to move, unless you've picked a side
      const viewer = listener() ?? position.turn;
      texts = moves.map((move, i) => narrateMove(positions[i], move, viewer));
      if (moves.length && isSacrifice(positions[0], moves[0], positions[1])) texts[0] = `There's a brilliant idea here! ${texts[0]}`;
      else if (texts.length) texts[0] = `The best plan: ${lowerFirst(texts[0])}`;
    }
    setBusy(false);
    // (the plan's own first move isn't an alternative to itself)
    const alternative = found && !(moves[0] && makeUci(found.move) === makeUci(moves[0])) ? found : undefined;
    const extra: CoachButton = alternative
      ? { ico: style === "attacking" ? "hazard" : "bulb", label: style === "attacking" ? "A sharper way" : "A more positional way",
          kind: "accent", labelled: true, run: () => showStyleAlternative(position, alternative.pv, style) }
      : QUIZ;
    if (alternative && texts.length) texts[texts.length - 1] += ` There's also a ${style === "attacking" ? "sharper" : "more positional"} way that's nearly as good.`;
    startStepper(positions, moves, texts, "talk", extra);
  } catch (error) {
    errorText = `Something went wrong: ${error}`;
    setBusy(false);
    refresh();
  }
}

/** The playing style's alternative, played out: nearly as strong as the best
 *  move, and closer to how you like to play. */
function showStyleAlternative(position: Chess, pv: NormalMove[], style: Style) {
  const viewer = listener() ?? position.turn;
  const line = wholeLine(position, pv, 3);
  if (!line.length) return;
  const story = talkLine(position, line, viewer);
  const texts = [...story.texts];
  texts[0] = style === "attacking"
    ? `A sharper way: ${lowerFirst(moveInWords(position, line[0], viewer))} It's nearly as strong, and it puts more pressure on their king.`
    : `A more positional way: ${lowerFirst(moveInWords(position, line[0], viewer))} It's nearly as strong, and it keeps your position solid.`;
  startStepper(story.positions, line, texts, "talk", QUIZ);
}

// -- The move strip (phones) and the views (board, statistics, history) --------

let currentView: "board" | "stats" | "history" = "board";

function drawMoveStrip(list: (Review | undefined)[], info: OpeningInfo[]) {
  const strip = $("move-strip");
  const current = currentPly();
  strip.replaceChildren(...game.moves.map((played, i) => {
    const ply = i + 1;
    const position = game.positionAt(i);
    const button = document.createElement("button");
    button.type = "button";
    const number = position.turn === "white" ? `${position.fullmoves}.` : "";
    const review = list[i];
    const mark = review && !info[i]?.book ? MOVE_MARKS[review.rating] : undefined; // book moves stay plain
    if (number) button.append(Object.assign(document.createElement("span"), { className: "ms-num", textContent: number }));
    button.append(`${played.san}${mark && !played.san.endsWith("#") ? mark : ""}`);
    button.className = ply === current ? "cur" : "";
    if (mark !== undefined) button.classList.add(ratingClass(review!.rating));
    button.addEventListener("click", () => goTo(ply));
    return button;
  }));
  strip.hidden = game.length === 0;
  strip.querySelector(".cur")?.scrollIntoView({ inline: "center", block: "nearest" });
}

function applyView() {

  for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tabs button")) {
    tab.classList.toggle("on", tab.dataset.view === currentView);
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-view-panel]")) {
    panel.hidden = panel.dataset.viewPanel !== currentView;
  }
  document.body.dataset.view = currentView;
  if (currentView === "stats") drawStats();
  if (currentView === "history") drawHistory();
}

// -- Statistics: accuracy per phase, every grade counted, an estimated rating ---

const GRADES = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced", "Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"];
let statsMore = false;

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A message from the coach in a tab with nothing to show yet. */
function tabMessage(box: HTMLElement, text: string, button?: CoachButton) {
  const say = element("div", "tab-message");
  const face = element("div", "coach-face big");
  face.innerHTML = avatarSvg("talk", 64);
  say.append(face, element("p", "", text));
  if (button) {
    const action = iconButton(button, 18);
    action.classList.add("labelled");
    action.append(element("span", "", button.label));
    say.append(action);
  }
  box.append(say);
}

function drawStats() {
  const box = $("stats");
  box.replaceChildren();
  if (mode === "play") {
    if (match) tabMessage(box, "Your statistics appear when the game is over. No peeking during a real game!");
    else if (canReview) tabMessage(box, "Shall we go through the game? Then your statistics appear here.", { ico: "search", label: "Review the game", run: onReviewGame, kind: "accent" });
    else tabMessage(box, "Play a game and your statistics appear here.");
    return;
  }
  if (game.length < 4) {
    tabMessage(box, "Play a few moves and I'll show the statistics here.");
    return;
  }
  const list = reviews();
  const positions = Array.from({ length: game.length + 1 }, (_, ply) => game.positionAt(ply));
  const scores = gameScores();
  const start = positions[0].turn;
  const overall = gameAccuracy(start, scores);
  const phases = phaseAccuracy(start, positions, scores);
  const ratings = estimateRating(start, scores);
  const { done, total } = analyser.progress();
  // Until Stockfish has checked every move, show ?? rather than numbers that keep changing
  const pending = done < total || scores.some((score) => !score) || list.some((review) => !review);
  if (pending) {
    const bar = element("div", "stats-progress");
    const fill = element("div", "stats-progress-fill");
    const fraction = total ? done / total : 0;
    fill.style.width = `${Math.round(fraction * 100)}%`;
    const track = element("div", "stats-progress-track");
    track.append(fill);
    bar.append(element("span", "", "Stockfish is checking the game..."), track);
    box.append(bar);
  }

  // Both players side by side (you first when it's your game)
  const first: Color = listener() ?? "white";
  const sides: Color[] = [first, opposite(first)];
  const name = (colour: Color) => barName(colour);

  const card = element("div", "stats-card");
  const table = element("div", "stats-table");
  const row = (label: string | HTMLElement, cells: (HTMLElement | string)[], className = "") => {
    const line = element("div", `stats-row ${className}`);
    line.append(typeof label === "string" ? element("span", "stats-label", label) : label);
    for (const cell of cells) line.append(typeof cell === "string" ? element("span", "stats-cell", cell) : cell);
    table.append(line);
  };
  const percent = (value: number | undefined, big = false) => {
    const cell = element("span", `stats-cell ${big ? "big" : ""}`);
    if (pending) cell.textContent = "??";
    else if (value === undefined || Number.isNaN(value)) cell.textContent = "-";
    else {
      cell.textContent = value.toFixed(1); // (like chess.com: 96.3)
      cell.classList.add(ratingClass(accuracyRating(value)));
    }
    return cell;
  };
  row("", sides.map((c) => element("span", "stats-cell stats-name", name(c))), "head");
  row("Accuracy", sides.map((c) => percent(overall[c], true)));
  row("Opening", sides.map((c) => percent(phases.opening[c])));
  row("Middlegame", sides.map((c) => percent(phases.middlegame[c])));
  row("Endgame", sides.map((c) => percent(phases.endgame[c])));

  // More: how many moves got each grade
  const toggle = element("button", "stats-more", statsMore ? "More ▴" : "More ▾");
  toggle.addEventListener("click", () => {
    statsMore = !statsMore;
    drawStats();
  });
  row(toggle, ["", ""]);
  if (statsMore) {
    const counts: Record<Color, Record<string, number>> = { white: {}, black: {} };
    const graded = withBook(list);
    graded.forEach((review, i) => {
      if (!review) return;
      const colour = game.moverOf(i + 1);
      counts[colour][review.rating] = (counts[colour][review.rating] ?? 0) + 1;
    });
    for (const grade of GRADES) {
      const label = element("span", "stats-label stats-grade");
      label.append(element("span", `grade-dot ${ratingClass(grade)}`), element("span", "", grade));
      row(label, sides.map((c) => {
        const cell = element("span", "stats-cell");
        const chip = element("span", `count-chip ${ratingClass(grade)}`, pending ? "??" : String(counts[c][grade] ?? 0));
        if (!pending && counts[c][grade]) {
          // tap: the board at the first such move, illustrated; tap again for the next
          chip.classList.add("tappable");
          chip.setAttribute("role", "button");
          chip.tabIndex = 0;
          chip.addEventListener("click", () => jumpToGrade(c, grade, graded));
        }
        cell.append(chip);
        return cell;
      }));
    }
  }
  card.append(table);
  // Where each phase began, so the scores make sense
  const division = divide(positions);
  const moveNumber = (ply: number) => positions[ply].fullmoves;
  const phasesNote = division.middle === undefined
    ? "The game stayed in the opening phase."
    : [`Middlegame from move ${moveNumber(division.middle)}`,
       division.end !== undefined ? `endgame from move ${moveNumber(division.end)}` : "no endgame"].join(" · ") +
      ". A phase needs 3 moves from a player to be scored.";
  card.append(element("p", "stats-note", phasesNote));
  if (reviewing) {
    const start = element("div", "stats-start");
    const button = iconButton({ ico: "play", label: "Start the review", run: startReview, kind: "accent" }, 18);
    button.classList.add("labelled");
    button.append(element("span", "", "Start the review"));
    start.append(button);
    box.append(start);
  }

  // The rating, in its own table
  const rating = element("div", "stats-card rating-card");
  const line = element("div", "stats-row");
  line.append(element("span", "stats-label", "Rating"));
  for (const colour of sides) {
    const cell = element("span", "stats-cell");
    cell.append(element("span", "rating-block", pending ? "??" : ratings[colour] ? String(ratings[colour]) : "-"));
    line.append(cell);
  }
  rating.append(line);
  box.append(card, rating);
  updateHistoryAccuracy(overall);
}

// -- Game history: your games against Stockfish, saved on this device -----------

interface SavedGame {
  id: string;
  date: string; // ISO
  pgn: string;
  user: Color;
  level: number;
  opening: string;
  timeControl: string;
  result: "win" | "draw" | "loss";
  accuracy?: number;
  mode: Mode;
}

const HISTORY_KEY = "chess-trainer-history";
let currentGameId: string | null = null;
let historyColour: Color | "all" = "all";
const historyResults = new Set<SavedGame["result"]>();

function loadHistory(): SavedGame[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(games: SavedGame[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(games.slice(0, 500)));
  } catch {
    // storage full or blocked: the record just isn't kept
  }
}

/** The opening's family name, e.g. "Italian Game" from "C50 Italian Game: ...". */
function openingFamily(): string {
  if (!book || !isStartPosition(game.positionAt(0))) return "";
  const named = book.gameOpenings(game.positionAt(0), gameMoves()).map((i) => i.opening).filter(Boolean);
  const last = named[named.length - 1];
  return last ? mainFamily([last[1]]) : "";
}

/** A match has ended: keep it in the game history. */
function recordGame() {
  if (!match || game.length === 0) return;
  const result = gameHeaders.Result;
  const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : result === "1/2-1/2" ? null : undefined;
  if (winner === undefined) return;
  const outcome: SavedGame["result"] = winner === null ? "draw" : winner === match.user ? "win" : "loss";
  const entry: SavedGame = {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    pgn: writePgn(game, gameHeaders, clockTimes),
    user: match.user,
    level: match.level,
    opening: openingFamily(),
    timeControl: gameHeaders.TimeControl ?? "",
    result: outcome,
    mode,
  };
  currentGameId = entry.id;
  saveHistory([entry, ...loadHistory()]);
}

/** Once Stockfish has checked the game, note your accuracy in the history. */
function updateHistoryAccuracy(overall: Partial<Record<Color, number>>) {
  if (!currentGameId) return;
  const { done, total } = analyser.progress();
  if (done < total) return;
  const games = loadHistory();
  const entry = games.find((g) => g.id === currentGameId);
  if (!entry || entry.accuracy !== undefined) return;
  const accuracy = overall[entry.user];
  if (accuracy === undefined) return;
  entry.accuracy = Math.round(accuracy);
  saveHistory(games);
}

function timeControlLabel(value: string): string {
  if (!value) return "no clock";
  const [base, inc] = value.split("+").map(Number);
  return `${Math.round(base / 60 * 10) / 10}+${inc}`;
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function drawHistory() {
  const box = $("history");
  box.replaceChildren();
  const games = loadHistory();
  if (!games.length) {
    tabMessage(box, "No games yet. Play against Stockfish and your record builds up here.");
    return;
  }
  // Colour: all, White or Black
  const colours = element("div", "seg history-colours");
  for (const [value, label] of [["all", "All"], ["white", "White"], ["black", "Black"]] as const) {
    const button = element("button", value === historyColour ? "on" : "", label);
    button.addEventListener("click", () => {
      historyColour = value;
      drawHistory();
    });
    colours.append(button);
  }
  // Results: wins, draws and losses, as filters that combine with the colour
  const ofColour = games.filter((g) => historyColour === "all" || g.user === historyColour);
  const record = element("div", "history-record");
  for (const [value, label] of [["win", "Wins"], ["draw", "Draws"], ["loss", "Losses"]] as const) {
    const button = element("button", `history-result ${value} ${historyResults.has(value) ? "on" : ""}`);
    button.append(element("b", "", String(ofColour.filter((g) => g.result === value).length)), element("span", "", label));
    button.setAttribute("aria-pressed", String(historyResults.has(value)));
    button.addEventListener("click", () => {
      if (historyResults.has(value)) historyResults.delete(value);
      else historyResults.add(value);
      drawHistory();
    });
    record.append(button);
  }
  const shown = ofColour.filter((g) => !historyResults.size || historyResults.has(g.result));
  const list = element("div", "history-list");
  for (const saved of shown) {
    const item = element("button", "history-game");
    const mark = element("span", `history-mark ${saved.result}`, saved.result === "win" ? "W" : saved.result === "loss" ? "L" : "D");
    const text = element("span", "history-text");
    text.append(
      element("span", "history-title", `vs Stockfish · ${shortName(LEVELS[saved.level] ?? LEVELS[0])}`),
      element("span", "history-meta", [saved.opening || "Game", saved.user === "white" ? "White" : "Black",
        timeControlLabel(saved.timeControl), saved.accuracy !== undefined ? `${saved.accuracy}%` : ""].filter(Boolean).join(" · ")),
    );
    item.append(mark, text, element("span", "history-date", shortDate(saved.date)));
    item.addEventListener("click", () => openSavedGame(saved));
    list.append(item);
  }
  if (!shown.length) list.append(element("p", "stats-note", "No games match these filters."));
  box.append(colours, record, list);
}

/** Replay a saved game with the coach. */
function openSavedGame(saved: SavedGame) {
  const [parsed] = readPgn(saved.pgn);
  if (!parsed) return;
  const { game: loaded } = parsed.load();
  mode = "practice";
  resetBoard(loaded, parsed.headers);
  currentGameId = saved.id;
  canReview = false;
  reviewing = true;
  reviewTitle = "";
  orientation = saved.user;
  gameOrigin = saved.mode === "play" ? "play" : "practice";
  viewPly = loaded.length ? 0 : null;
  restoreAnalysis();
  currentView = "board";
  refresh();
}

const inProgress = () => match !== null && game.length > 0 && !game.outcome();

/** What New starts again, in the mode you're in: "game", "match", "review"... */
function newWhat(): string {
  switch (gameOrigin) {
    case "practice": return "match";
    case "analysis": return "review";
    case "learn": return drill ? "drill" : "lesson";
    case "train": return puzzle ? "puzzles" : lesson ? "lesson" : "position";
    default: return "game";
  }
}

/** New game (or match, review...): the setup screen of the mode you're in. */
async function onNewGame() {
  if (inProgress() && !(await message(`New ${newWhat()}?`, "Are you sure? This game will end.", true))) return;
  const learning = demo ? demo.demo.opening : drill ? drill.demo.opening : null;
  const screen: HomeChoice | null = gameOrigin === "learn" ? "train" : gameOrigin;
  if (screen === "train") $("lesson-list").hidden = true;
  endGame();
  showMenu();
  if (!screen) return;
  homeChoice = screen;
  if (gameOrigin === "learn") {
    trainTab = "openings";
    if (learning) {
      learnOpening = learning;
      learnColour = REPERTOIRE.find((o) => o.name === learning)?.colour ?? "white";
    }
  }
  showScreen(screen);
  drawTrainScreen();
}

/** Home: the coach's welcome. It ends whatever was on the board (asking
 *  first if a game is still being played). */
async function onHome() {
  if (inProgress() && !(await message("Leave this game?", "Are you sure? This game will end.", true))) return;
  endGame();
  showMenu();
}

/** Leave the game for good: the clock stops and the board is cleared. */
function endGame() {
  if (preparing) stopPreparing();
  clock?.stop();
  resetBoard(new Game());
  refresh();
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
  const what = newWhat();
  newButton.querySelector(".ng-long")!.textContent = ` ${what}`;
  newButton.setAttribute("aria-label", `New ${what}`);

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

const pgnText = $<HTMLTextAreaElement>("pgn-text");
const pgnPick = $<HTMLSelectElement>("pgn-pick");
const pgnStatus = $("pgn-status");
let pgnGames: PgnGame[] = [];

/** "Open PGN": the Game review screen. */
function openPgnDialog() {
  showMenu();
  homeChoice = "analysis";
  showScreen("analysis");
  readPgnText();
  pgnText.focus();
}

/** Look for games in the text box (as you type or paste, or after opening a file). */
function readPgnText() {
  const text = pgnText.value.trim();
  pgnGames = text ? readPgn(text).filter((g) => g.load().game.length > 0 || g.headers.FEN) : [];
  pgnPick.replaceChildren(...pgnGames.map((g, i) => new Option(`${i + 1}. ${g.title}`, String(i))));
  $("pgn-pick-row").hidden = pgnGames.length < 2;
  drawHome();
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
  // Only finished games: a game still being played could be used to cheat
  const result = chosen.headers.Result;
  const outcome = loaded.outcome();
  const over = result === "1-0" || result === "0-1" || result === "1/2-1/2" || (outcome !== undefined && loaded.position.isEnd());
  if (!over) {
    await message("This game isn't finished",
      "It has no result yet, so it's still being played. To keep things fair, only finished games can be analysed. Come back once it's over.");
    return;
  }
  const side = await pickSide(chosen.headers);
  if (side === "cancel") return;
  mode = "practice";
  resetBoard(loaded, chosen.headers);
  canReview = false;
  reviewing = true;
  reviewTitle = `Reviewing: ${chosen.title}`;
  reviewSide = side;
  gameOrigin = "analysis";
  viewPly = loaded.length ? 0 : null; // start from the first position and step through
  orientation = side ?? "white";
  currentView = "stats";
  if (menuOpen) hideMenu();
  startPreparing();
  refresh();
  if (problem) await message("PGN", problem);
}

/** Whose side are you on in this game? (A name that matches yours is suggested.) */
async function pickSide(headers: Record<string, string>): Promise<Color | null | "cancel"> {
  const ask = $<HTMLDialogElement>("side-pick");
  const named = (value?: string) => (value && value !== "?" ? value : "");
  const white = named(headers.White);
  const black = named(headers.Black);
  const mine = playerName().trim().toLowerCase();
  $("side-pick-white").textContent = white ? `I'm White: ${white}` : "I'm White";
  $("side-pick-black").textContent = black ? `I'm Black: ${black}` : "I'm Black";
  $("side-pick-white").classList.toggle("accent", !!mine && white.toLowerCase() === mine);
  $("side-pick-black").classList.toggle("accent", !!mine && black.toLowerCase() === mine);
  const result = headers.Result === "1-0" ? "White won" : headers.Result === "0-1" ? "Black won" : headers.Result === "1/2-1/2" ? "A draw" : "";
  $("side-pick-note").textContent = [headers.Site && headers.Site !== "?" ? headers.Site : "", result].filter(Boolean).join(" · ") +
    (result ? ". " : "") + "I'll talk about the game from your side.";
  ask.showModal();
  return new Promise((resolve) => {
    const buttons = [...ask.querySelectorAll<HTMLButtonElement>("button[value]")];
    const done = (value: string) => {
      for (const button of buttons) button.onclick = null;
      ask.oncancel = null;
      ask.close();
      resolve(value === "white" || value === "black" ? value : value === "neither" ? null : "cancel");
    };
    for (const button of buttons) button.onclick = (event) => { event.preventDefault(); done(button.value); };
    ask.oncancel = (event) => { event.preventDefault(); done("cancel"); };
  });
}

/** What the download button saves: the game on screen, or (on the History
 *  tab) all your games. */
function saveTarget(): { title: string; note: string; name: string; text: string } | null {
  if (currentView === "history") {
    const games = loadHistory();
    if (!games.length) return null;
    return {
      title: "Save all your games",
      note: `${games.length} game${games.length === 1 ? "" : "s"} against Stockfish, in one PGN.`,
      name: `chess-trainer-games-${today().replace(/\./g, "-")}.pgn`,
      text: games.map((g) => g.pgn.trim()).join("\n\n") + "\n",
    };
  }
  if (!game.length) return null;
  const outcome = game.outcome();
  const headers = { ...gameHeaders };
  if (!headers.Result || headers.Result === "*") {
    headers.Result = !outcome ? "*" : !outcome.winner ? "1/2-1/2" : outcome.winner === "white" ? "1-0" : "0-1";
  }
  const name = `${headers.White ?? "White"}-vs-${headers.Black ?? "Black"}-${(headers.Date ?? today()).replace(/\./g, "-")}`
    .replace(/[^A-Za-z0-9-]+/g, "_");
  return { title: "Save this game", note: `${game.length} moves, as PGN.`, name: `${name}.pgn`, text: writePgn(game, headers, clockTimes) };
}

function openSave() {
  const target = saveTarget();
  if (!target) return;
  $("save-title").textContent = target.title;
  $("save-note").textContent = target.note;
  $("save-status").textContent = "";
  $<HTMLDialogElement>("save-dialog").showModal();
}

async function saveCopy() {
  const target = saveTarget();
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target.text);
    $("save-status").textContent = "Copied. Paste it wherever you like (lichess, chess.com, a message...).";
  } catch {
    // No clipboard access (older browsers, or not allowed): select it for copying by hand
    const box = document.createElement("textarea");
    box.value = target.text;
    box.className = "save-text";
    box.readOnly = true;
    $("save-status").replaceChildren("Select all and copy:", box);
    box.select();
    // the older way of copying still works on plain-http pages
    try {
      if (document.execCommand("copy")) $("save-status").replaceChildren("Copied. Paste it wherever you like (lichess, chess.com, a message...).");
    } catch {
      // leave the text selected for copying by hand
    }
  }
}

function saveDownload() {
  const target = saveTarget();
  if (!target) return;
  saveFile(target.name, target.text);
  $<HTMLDialogElement>("save-dialog").close();
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

  for (const button of navButtons) button.addEventListener("click", () => navigate(button.dataset.nav as "first" | "back" | "forward" | "last"));
  $("whatif-exit").addEventListener("click", exitAnalysis);
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
  newButton.addEventListener("click", () => void onNewGame());
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
  fenInput.addEventListener("input", () => {
    readFen();
    drawHome();
  });
  $("settings-save").addEventListener("click", () => {
    settingsDialog.close();
    openSave();
  });
  $("save-copy").addEventListener("click", () => void saveCopy());
  $("save-file").addEventListener("click", saveDownload);
  window.setInterval(clockTick, 100);
  for (const control of [soundOn, soundVolume]) {
    control.addEventListener("input", () => {
      applySound();
      saveSettings();
    });
  }
  soundVolume.addEventListener("change", () => void play("move")); // let you hear the new volume
  soundStyleBox.addEventListener("change", () => {
    applySound();
    saveSettings();
    void play("move"); // let you hear the new style
  });
  // Browsers only play sound after the page has been touched or clicked
  document.addEventListener("pointerdown", unlockSounds, { once: true });
  document.addEventListener("keydown", unlockSounds, { once: true });
  $("open-pgn").addEventListener("click", openPgnDialog);
  for (const gear of document.querySelectorAll(".gear-button")) {
    gear.addEventListener("click", () => {
      // Saving the game is only offered in a game with something to save
      const target = menuOpen ? null : saveTarget();
      const save = $("settings-save");
      save.hidden = !target;
      save.lastChild!.textContent = currentView === "history" ? " Save all your games (PGN)" : " Save this game (PGN)";
      settingsDialog.showModal();
    });
  }
  settingsDialog.addEventListener("close", () => refresh());
  playerNameBox.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  for (const help of document.querySelectorAll<HTMLElement>(".help-button")) {
    help.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHelp(help);
    });
  }
  document.addEventListener("pointerdown", (event) => {
    const menuBox = $("help-menu");
    if (!menuBox.hidden && !menuBox.contains(event.target as Node) && !(event.target as Element).closest?.(".help-button")) menuBox.hidden = true;
  });

  showDemoButton.addEventListener("click", () => void onShowDemo());
  demoPlay.addEventListener("click", onDemoPlay);
  $("demo-back").addEventListener("click", () => goTo(currentPly() - 1));
  $("demo-next").addEventListener("click", () => goTo(currentPly() + 1));
  $("demo-next-line").addEventListener("click", () => demo && loadDemoLine(demo.line + 1));
  demoPick.addEventListener("change", () => loadDemoLine(Number(demoPick.value)));
  $("demo-try").addEventListener("click", onDemoTry);
  $("strip-face").addEventListener("click", () => openMore());
  for (const button of document.querySelectorAll(".nav-play")) button.addEventListener("click", onNavPlay);
  for (const button of document.querySelectorAll(".var-prev")) button.addEventListener("click", () => demo && demo.line > 0 && loadDemoLine(demo.line - 1));
  for (const button of document.querySelectorAll(".var-next")) button.addEventListener("click", () => demo && demo.line + 1 < demo.demo.lines.length && loadDemoLine(demo.line + 1));
  $("home-button").addEventListener("click", () => void onHome());
  $("prep-back").addEventListener("click", () => { stopPreparing(); showMenu(); });
  $("stats-back").addEventListener("click", backToStats);
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tabs button")) {
    tab.addEventListener("click", () => {
      currentView = tab.dataset.view as typeof currentView;
      refresh();
    });
  }
  $("step-back").addEventListener("click", () => stepper && stepTo(stepper.step - 1));
  $("step-next").addEventListener("click", () => stepper && stepTo(stepper.step + 1));
  $("step-close").addEventListener("click", closeStepper);
  overlay().addEventListener("click", (event) => {
    if (event.target === overlay()) closeOverlay();
  });
  drawIcons();
  $("demo-exit").addEventListener("click", onDemoExit);

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
        event.target instanceof HTMLTextAreaElement || settingsDialog.open) return;
    if (event.key === " " && event.target instanceof HTMLButtonElement) return; // the button's own click
    if (stepper && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Escape")) {
      event.preventDefault();
      if (event.key === "Escape") closeStepper();
      else stepTo(stepper.step + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (overlayOpen() && event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (preview ? stepPreview(-1) : navigate("back")),
      ArrowRight: () => (preview ? stepPreview(1) : navigate("forward")),
      Home: () => navigate("first"),
      End: () => navigate("last"),
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
    demo: () => demo, startDemo, DEMOS, demoSteps, showTour, drill: () => drill, startDrill,
    puzzle: () => puzzle, editor: () => editor, startPuzzles, startEditor, startLesson, editorTap,
    outlook: (fen: string, you: Color) => whatYouGet(coachAnalysis, new Game(fen).position, you),
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
