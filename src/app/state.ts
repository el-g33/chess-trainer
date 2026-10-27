// The app's shared state: what's on the board, which mode and screen, what
// the coach is doing. Read it by name anywhere (imports are live); change it
// with set, e.g. set.game(new Game()) - one place to see what can change.
import type { Chess } from "chessops/chess";
import type { Color } from "chessops/types";

import type { DeepMove } from "../analyser";
import type { Clock, Times } from "../clock";
import type { Engine } from "../engine";
import type { Band } from "../explore";
import { Game } from "../game";
import type { TrainPhase } from "../lessons";
import type { OpeningBook, OpeningInfo } from "../openings";
import type { Headers, PgnGame } from "../pgn";
import type { Review } from "../review";
import type { Mode, Match, Analysis, DemoState, Quiz } from "../main";
import type { DrillState, Practice } from "./openingDemos";
import type { EditorState, ExploreState, LessonState, PuzzleLevel, PuzzleState } from "./train";
import type { CoachButton, Speech, Stepper } from "./coach";
import type { HomeChoice } from "./startScreens";

export let coachEngine: Engine | null = null;
export let mode: Mode = "practice";
export let game = new Game();
export let match: Match | null = null; // the game against Stockfish, while it goes on
export let matchCounter = 0;
export let viewPly: number | null = null; // looking back at this move; null = the live position
export let analysis: Analysis | null = null;
export let preview: { baseFen: string; step: number } | null = null; // stepping through Stockfish's line
export let orientation: Color = "white";
export let thinking = false; // Stockfish is choosing its move
export let result = ""; // how the last match ended, e.g. "You resigned - Stockfish wins"
export let menuOpen = true;
export let clock: Clock | null = null; // the chess clock, in a match with a time control
export let clockTimes: number[] = []; // each move's time left afterwards (for the PGN)
export let clockHistory: Times[] = []; // the clocks after each move (for Undo)
export let lastTickSecond = -1;
export let demo: DemoState | null = null;
export let demoStepping = false; // the demo itself is moving on (not you)
export let canReview = false; // a finished Play game can be reviewed in Practice mode
export let reviewing = false; // reviewing a Play game in Practice mode
export let reviewTitle = ""; // for a game opened from PGN, e.g. "Reviewing: Carlsen - Nakamura (1-0)"
export let reviewSide: Color | null = null; // a PGN game: the side you played (null: just watching)
export let preparing = false; // Stockfish is checking the whole game before the review opens
export let preparingSince = 0;
export let stopLoading: (() => void) | null = null;
export let showReply = false; // in a match, the review shows Stockfish's reply instead of your move
export let plyNotes = new Map<number, string[]>(); // opening notes for a move (1 = the first)
export let gameHeaders: Headers = {}; // the game's PGN headers: who played, when, the result
export let quiz: Quiz | null = null;
export let busy = false;
export let busySince = 0;
export let statusMessage = "";
export let errorText = "";
export let lastFraction = 0.5; // eval bar position shown while waiting
export let book: OpeningBook | null = null;
export let openingCache: { key: string; info: OpeningInfo[] } = { key: "", info: [] };
export let homeChoice: HomeChoice | null = null;
export let greeting = "";
export let learnColour: Color = "white";
export let matchColour: Color = "white"; // your side in a practice match
export let learnOpening: string | null = null;
export let gameOrigin: HomeChoice | "learn" | null = null;
export let prepWorked = false; // Stockfish had something to check (a game seen before opens at once)
export let prepWatch = 0; // a timer that checks on the progress
export let prepProgress = { key: "", since: 0 }; // the last progress seen, and when
export let gradeJump = { key: "", next: 0 };
export let silentJump = false; // from the statistics: the top bubble says nothing, the card below does the talking
export let fromStats = false; // jumped to a move from the statistics: a bar leads back
export let fenPosition: Chess | null = null; // the position typed on the analysis screen, if it's valid
export let trainPhase: TrainPhase = "middlegame";
export let trainTab: "openings" | TrainPhase = "openings"; // the tab on screen (openings, or a phase)
export let puzzleLevel: PuzzleLevel = "club";
export let puzzle: PuzzleState | null = null;
export let explore: ExploreState | null = null;
export let exploreBand: Band = "club";
export let editor: EditorState | null = null;
export let lesson: LessonState | null = null;
export let replaying = false;
export let replayStepping = false; // the replay itself is moving (not you)
export let drill: DrillState | null = null;
export let practice: Practice | null = null;
export let savedFromReview: { key: string; ids: string[]; added: number; plies: number[] } | null = null;
export let deepening: { before: string[]; done: boolean; changes: string[] } | null = null;
export let busyTimer: number | undefined;
export let deepNeeded: Chess[] = []; // positions waiting for that second look
export let deepMoves: DeepMove[] = []; // moves waiting for it
export let fall: { fen: string; colour: Color; step: number; timer?: number } | null = null;
export let speech: Speech = { key: "", pieces: [""], index: 0, hold: 0, done: true };
export let stripButtons: CoachButton[] = [];
export let lastReviews: (Review | undefined)[] = [];
export let stepper: Stepper | null = null;
export let currentView: "board" | "stats" | "history" = "board";
export let statsMore = false;
export let currentGameId: string | null = null;
export let historyColour: Color | "all" = "all";
export let checkingUpdates = false;
export let pgnGames: PgnGame[] = [];
export let answerDialog: ((ok: boolean) => void) | null = null;

/** Change the shared state: set.name(value) (it gives back the value, like an assignment). */
export const set = {
  coachEngine: (value: typeof coachEngine) => (coachEngine = value),
  mode: (value: typeof mode) => (mode = value),
  game: (value: typeof game) => (game = value),
  match: (value: typeof match) => (match = value),
  matchCounter: (value: typeof matchCounter) => (matchCounter = value),
  viewPly: (value: typeof viewPly) => (viewPly = value),
  analysis: (value: typeof analysis) => (analysis = value),
  preview: (value: typeof preview) => (preview = value),
  orientation: (value: typeof orientation) => (orientation = value),
  thinking: (value: typeof thinking) => (thinking = value),
  result: (value: typeof result) => (result = value),
  menuOpen: (value: typeof menuOpen) => (menuOpen = value),
  clock: (value: typeof clock) => (clock = value),
  clockTimes: (value: typeof clockTimes) => (clockTimes = value),
  clockHistory: (value: typeof clockHistory) => (clockHistory = value),
  lastTickSecond: (value: typeof lastTickSecond) => (lastTickSecond = value),
  demo: (value: typeof demo) => (demo = value),
  demoStepping: (value: typeof demoStepping) => (demoStepping = value),
  canReview: (value: typeof canReview) => (canReview = value),
  reviewing: (value: typeof reviewing) => (reviewing = value),
  reviewTitle: (value: typeof reviewTitle) => (reviewTitle = value),
  reviewSide: (value: typeof reviewSide) => (reviewSide = value),
  preparing: (value: typeof preparing) => (preparing = value),
  preparingSince: (value: typeof preparingSince) => (preparingSince = value),
  stopLoading: (value: typeof stopLoading) => (stopLoading = value),
  showReply: (value: typeof showReply) => (showReply = value),
  plyNotes: (value: typeof plyNotes) => (plyNotes = value),
  gameHeaders: (value: typeof gameHeaders) => (gameHeaders = value),
  quiz: (value: typeof quiz) => (quiz = value),
  busy: (value: typeof busy) => (busy = value),
  busySince: (value: typeof busySince) => (busySince = value),
  statusMessage: (value: typeof statusMessage) => (statusMessage = value),
  errorText: (value: typeof errorText) => (errorText = value),
  lastFraction: (value: typeof lastFraction) => (lastFraction = value),
  book: (value: typeof book) => (book = value),
  openingCache: (value: typeof openingCache) => (openingCache = value),
  homeChoice: (value: typeof homeChoice) => (homeChoice = value),
  greeting: (value: typeof greeting) => (greeting = value),
  learnColour: (value: typeof learnColour) => (learnColour = value),
  matchColour: (value: typeof matchColour) => (matchColour = value),
  learnOpening: (value: typeof learnOpening) => (learnOpening = value),
  gameOrigin: (value: typeof gameOrigin) => (gameOrigin = value),
  prepWorked: (value: typeof prepWorked) => (prepWorked = value),
  prepWatch: (value: typeof prepWatch) => (prepWatch = value),
  prepProgress: (value: typeof prepProgress) => (prepProgress = value),
  gradeJump: (value: typeof gradeJump) => (gradeJump = value),
  silentJump: (value: typeof silentJump) => (silentJump = value),
  fromStats: (value: typeof fromStats) => (fromStats = value),
  fenPosition: (value: typeof fenPosition) => (fenPosition = value),
  trainPhase: (value: typeof trainPhase) => (trainPhase = value),
  trainTab: (value: typeof trainTab) => (trainTab = value),
  puzzleLevel: (value: typeof puzzleLevel) => (puzzleLevel = value),
  puzzle: (value: typeof puzzle) => (puzzle = value),
  explore: (value: typeof explore) => (explore = value),
  exploreBand: (value: typeof exploreBand) => (exploreBand = value),
  editor: (value: typeof editor) => (editor = value),
  lesson: (value: typeof lesson) => (lesson = value),
  replaying: (value: typeof replaying) => (replaying = value),
  replayStepping: (value: typeof replayStepping) => (replayStepping = value),
  drill: (value: typeof drill) => (drill = value),
  practice: (value: typeof practice) => (practice = value),
  savedFromReview: (value: typeof savedFromReview) => (savedFromReview = value),
  deepening: (value: typeof deepening) => (deepening = value),
  busyTimer: (value: typeof busyTimer) => (busyTimer = value),
  deepNeeded: (value: typeof deepNeeded) => (deepNeeded = value),
  deepMoves: (value: typeof deepMoves) => (deepMoves = value),
  fall: (value: typeof fall) => (fall = value),
  speech: (value: typeof speech) => (speech = value),
  stripButtons: (value: typeof stripButtons) => (stripButtons = value),
  lastReviews: (value: typeof lastReviews) => (lastReviews = value),
  stepper: (value: typeof stepper) => (stepper = value),
  currentView: (value: typeof currentView) => (currentView = value),
  statsMore: (value: typeof statsMore) => (statsMore = value),
  currentGameId: (value: typeof currentGameId) => (currentGameId = value),
  historyColour: (value: typeof historyColour) => (historyColour = value),
  checkingUpdates: (value: typeof checkingUpdates) => (checkingUpdates = value),
  pgnGames: (value: typeof pgnGames) => (pgnGames = value),
  answerDialog: (value: typeof answerDialog) => (answerDialog = value),
};
