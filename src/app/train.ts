// Train: principles, puzzles and your own positions

import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Board } from "chessops/board";
import { Chess } from "chessops/chess";
import { makeBoardFen, makeFen, parseFen } from "chessops/fen";
import { defaultSetup } from "chessops/setup";
import type { Color, NormalMove, Piece, Role as PieceRole } from "chessops/types";
import { makeSquare, makeUci, opposite, parseSquare, parseUci } from "chessops/util";

import { moodForRating } from "../avatar";
import { type Score, colourName, isCastling, afterMove as positionAfter } from "../coach";
import { BANDS, type Band, likelyMoves, pickLikely } from "../explore";
import { Game } from "../game";
import { icon } from "../icons";
import { LESSONS, type Lesson, type LessonPhase, type TrainPhase } from "../lessons";
import { LEVELS, shortName } from "../levels";
import { analyser, base, coachAnalysis, currentPly, ground } from "../main";
import { controlledSquares, moveInWords, narrateMove, quietIdea, ratingWords, verdict } from "../narrate";
import { readPgn, today } from "../pgn";
import { type Review, fenOf } from "../review";
import { play } from "../sounds";
import { planAhead } from "../strategy";

import { type CoachButton, type CoachSay, type StepFrame, TELL_MORE, closeStepper, coachVerdict, startStepper } from "./coach";
import { $, levelBox, menu } from "./dom";
import { arrowEnd, refresh } from "./draw";
import { afterMove } from "./matches";
import { drawMistakesCard, practiseMistakes } from "./openingDemos";
import { playerName } from "./playerBars";
import { message } from "./popups";
import { saveSettings } from "./settings";
import { moveSound, showMenu } from "./startMenu";
import { hideMenu, resetBoard } from "./startScreens";
import {
  busy, editor, explore, exploreBand, game, menuOpen, puzzle, puzzleLevel, set, stepper, trainPhase, trainTab,
  viewPly,
} from "./state";
import { setBusy } from "./strategyCoach";

export type PuzzleLevel = "beginner" | "club" | "advanced" | "expert" | "master";
export const PUZZLE_LEVELS: [PuzzleLevel, string][] = [["beginner", "Beginner"], ["club", "Club"], ["advanced", "Advanced"], ["expert", "Expert"], ["master", "Master"]];
export type PuzzleRow = [id: string, fen: string, moves: string, rating: number, themes: string];

// The puzzle sets: opening traps, and the middlegame and endgame
export type PuzzleSet = "openings" | TrainPhase;
export const puzzleFiles = new Map<PuzzleSet, Promise<Record<PuzzleLevel, PuzzleRow[]>>>();

export interface PuzzleState {
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
  check?: boolean[]; // finding your level: right first time, puzzle by puzzle
}

// Your position: the coach helps you analyse it. You play your side, and the
// other side is played by you or by "an opponent" of the chosen strength.
export interface ExploreState {
  user: Color;
  band: Band;
  auto: boolean; // they reply by themselves after your move (pause to move for them)
  thinking: boolean; // their reply is being chosen (the board stays free meanwhile)
}

export const AUTO_REPLY_DELAY = 1800; // ms: time to see your move's rating first

export function loadPuzzles(phase: PuzzleSet) {
  if (!puzzleFiles.has(phase)) {
    puzzleFiles.set(phase, fetch(`${import.meta.env.BASE_URL}puzzles/${phase}.json`).then((r) => r.json()));
  }
  return puzzleFiles.get(phase)!;
}

export function drawTrainScreen() {
  for (const tab of menu.querySelectorAll<HTMLButtonElement>("[data-train-tab]")) {
    const on = tab.dataset.trainTab === trainTab;
    tab.classList.toggle("on", on);
    tab.setAttribute("aria-selected", String(on));
  }
  drawMistakesCard();
  // Every tab: its principles first. Openings: then the lessons by colour and the
  // opening traps; the phases: then puzzles. (Your position is on the Game review screen.)
  const openings = trainTab === "openings";
  $("train-openings").hidden = !openings;
  $("puzzles-title").textContent = openings ? "Opening traps" : "Puzzles";
  const lessons = LESSONS[lessonPhase()];
  $("principles-note").textContent = lessons.length ? `${lessons.length} short lessons` : "Being written";
  // The puzzles row opens the levels; choosing one starts them
  const chips = $("puzzle-levels");
  chips.replaceChildren(...PUZZLE_LEVELS.map(([value, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    chip.classList.toggle("on", value === puzzleLevel);
    chip.addEventListener("click", () => {
      set.puzzleLevel(value);
      saveSettings();
      showPuzzleLevels(false);
      void startPuzzles(trainTab, value);
    });
    return chip;
  }));
}

/** Show or hide the level choice under the puzzles row. */
function showPuzzleLevels(open: boolean) {
  $("puzzle-pick").hidden = !open;
  $("puzzles-open").setAttribute("aria-expanded", String(open));
  $("train-puzzles").classList.toggle("open", open);
}

export function setupTrain() {
  for (const tab of menu.querySelectorAll<HTMLButtonElement>("[data-train-tab]")) {
    tab.addEventListener("click", () => {
      set.trainTab(tab.dataset.trainTab as "openings" | TrainPhase);
      if (trainTab !== "openings") set.trainPhase(trainTab);
      $("lesson-list").hidden = true;
      $("train-cards").hidden = false;
      showPuzzleLevels(false);
      drawTrainScreen();
    });
  }
  $("puzzles-open").addEventListener("click", () => showPuzzleLevels($("puzzle-pick").hidden === true));
  $("train-mistakes").addEventListener("click", practiseMistakes);
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

export const THEME_HINTS: [string, string][] = [
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

export function puzzleHint(themes: string[]): string {
  return THEME_HINTS.find(([theme]) => themes.includes(theme))?.[1] ?? "Look at checks, captures and threats first.";
}

export async function startPuzzles(phase: PuzzleSet, level: PuzzleLevel, themes: string[] = []) {
  const all = await loadPuzzles(phase);
  let list = all[level];
  if (themes.length) {
    const wanted = Object.values(all).flat().filter((row) => themes.some((t) => row[4].split(" ").includes(t)));
    if (wanted.length) list = wanted;
  }
  // a different order each time
  list = [...list].sort(() => Math.random() - 0.5);
  const streak = puzzle?.streak ?? 0;
  set.puzzle({ phase, level, list, index: -1, side: "white", solution: [], step: 0, state: "solving", missed: false, hints: 0, themes: [], streak, note: "" });
  showPuzzle(0);
}

export function showPuzzle(index: number) {
  if (!puzzle) return;
  const keep = puzzle;
  const row = keep.list[index % keep.list.length];
  const [, fen, moves] = row;
  const all = moves.split(" ").map((uci) => parseUci(uci) as NormalMove);
  set.mode("play"); // no eval bar or ratings to give it away
  resetBoard(new Game(fen), { White: "?", Black: "?", Event: "Puzzle" });
  set.puzzle(keep);
  set.gameOrigin("train");
  set.currentView("board");
  const start = game.position.clone();
  start.play(all[0]);
  Object.assign(puzzle, {
    index, side: start.turn, solution: all.slice(1), step: 0, state: "solving", missed: false, hints: 0,
    themes: row[4].split(" "), note: `${colourName(start.turn)} to move: find the strongest move.`,
  });
  set.orientation(start.turn);
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

export function puzzleMove(move: NormalMove) {
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

export function puzzleSolved() {
  if (!puzzle) return;
  puzzle.check?.push(!puzzle.missed);
  puzzle.state = "solved";
  if (!puzzle.missed) puzzle.streak++;
  puzzle.note = puzzle.missed ? "Solved! Next one?" : puzzle.streak > 1 ? `Solved! That's ${puzzle.streak} in a row.` : "Solved! Well done.";
  void play("right");
  refresh();
}

export function puzzleHintStep() {
  if (!puzzle || puzzle.state !== "solving") return;
  puzzle.hints++;
  puzzle.missed = true;
  puzzle.note = puzzle.hints === 1 ? puzzleHint(puzzle.themes) : "This piece moves.";
  refresh();
}

/** Show the rest of the solution, one move at a time. */
export function puzzleShowSolution() {
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

export function nextPuzzle() {
  if (!puzzle) return;
  if (puzzle.check) {
    // finding your level: five puzzles, or stop after two misses
    const misses = puzzle.check.filter((right) => !right).length;
    if (puzzle.index + 1 >= puzzle.list.length || misses >= 2) return finishLevelCheck();
  }
  showPuzzle(puzzle.index + 1);
}

// -- Find your level: five puzzles from easy to hard, the first time ----------------

export const LEVEL_CHECK_KEY = "chess-trainer-level-check";

export function levelCheckDone(): boolean {
  try {
    return localStorage.getItem(LEVEL_CHECK_KEY) !== null;
  } catch {
    return true;
  }
}

export function noteLevelCheck(how: "done" | "skipped") {
  try {
    localStorage.setItem(LEVEL_CHECK_KEY, how);
  } catch {
    // storage blocked: the offer may come again
  }
}

/** One middlegame puzzle from each level, easiest first. */
export async function startLevelCheck() {
  const all = await loadPuzzles("middlegame");
  const list = PUZZLE_LEVELS.map(([level]) => all[level][Math.floor(Math.random() * all[level].length)]);
  resetBoard(new Game());
  set.puzzle({ phase: "middlegame", level: "beginner", list, index: -1, side: "white", solution: [], step: 0, state: "solving",
    missed: false, hints: 0, themes: [], streak: 0, note: "", check: [] });
  showPuzzle(0);
}

/** The result: puzzle level and Stockfish's strength to match. */
export function finishLevelCheck() {
  const results = puzzle?.check ?? [];
  const right = results.filter(Boolean).length;
  const levels: PuzzleLevel[] = ["beginner", "beginner", "club", "advanced", "expert", "master"];
  set.puzzleLevel(levels[right]);
  levelBox.selectedIndex = Math.min(LEVELS.length - 1, right);
  noteLevelCheck("done");
  saveSettings();
  const puzzleName = PUZZLE_LEVELS.find(([v]) => v === puzzleLevel)?.[1] ?? "";
  void message("Your level", `You solved ${right} of ${results.length} first time. I've set your puzzles to ${puzzleName} ` +
    `and Stockfish to ${shortName(LEVELS[levelBox.selectedIndex])}. You can change both any time.`).then(() => {
    resetBoard(new Game());
    refresh();
    showMenu();
  });
}

export function puzzleSays(): CoachSay {
  const p = puzzle!;
  const level = PUZZLE_LEVELS.find(([v]) => v === p.level)?.[1] ?? "";
  const hint: CoachButton = { ico: "bulb", label: "Hint", run: puzzleHintStep };
  const show: CoachButton = { ico: "eye", label: "Show the solution", run: () => {
    if (p.state === "solving") p.check?.push(false);
    puzzleShowSolution();
  }, kind: "soft" };
  const next: CoachButton = { ico: "skipNext", label: "Next puzzle", run: nextPuzzle, kind: "accent" };
  void level;
  if (p.state === "solving") return { mood: p.missed ? "think" : "talk", text: p.note, buttons: [hint, show] };
  return { mood: p.state === "solved" ? "wow" : "talk", text: p.note, buttons: [next] };
}

/** A circle on the piece to move, after the second hint. */
export function puzzleShapes(): DrawShape[] {
  if (!puzzle || puzzle.state !== "solving" || puzzle.hints < 2) return [];
  const move = puzzle.solution[puzzle.step];
  return move ? [{ orig: makeSquare(move.from) as Key, brush: "you" }] : [];
}

// -- Your position: set it up, then the coach takes a side ---------------------

export interface EditorState {
  board: Board;
  turn: Color;
  pick: Piece | "erase" | null;
}


export const PIECE_LETTERS: [PieceRole, string][] = [["king", "K"], ["queen", "Q"], ["rook", "R"], ["bishop", "B"], ["knight", "N"], ["pawn", "P"]];

export function startEditor(fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1") {
  set.mode("practice");
  resetBoard(new Game());
  set.gameOrigin("train");
  set.currentView("board");
  set.editor({ board: Board.empty(), turn: "white", pick: null });
  editorLoad(fen);
  set.orientation("white");
  if (menuOpen) hideMenu();
  drawPalette();
  refresh();
}

export function editorLoad(fen: string) {
  if (!editor) return;
  const setup = parseFen(fen);
  if (setup.isErr) return;
  editor.board = setup.value.board.clone();
  editor.turn = setup.value.turn;
  refresh();
}

export function editorTap(key: Key) {
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
export function editorSync() {
  if (!editor || editor.pick) return;
  const board = Board.empty();
  for (const [key, piece] of ground.state.pieces) board.set(parseSquare(key)!, { role: piece.role, color: piece.color });
  if (makeBoardFen(board) === makeBoardFen(editor.board)) return;
  editor.board = board;
  refresh();
}

export function drawPalette() {
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

export function drawEditor() {
  const panel = $("editor-panel");
  panel.hidden = !editor;
  document.body.classList.toggle("editing", editor !== null);
  if (!editor) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>("#editor-turn button")) {
    button.classList.toggle("on", button.dataset.turn === editor.turn);
  }
}

/** Castling rights where king and rook still stand on their home squares. */
export function castlingFen(board: Board): string {
  const has = (sq: string, role: PieceRole, color: Color) => {
    const piece = board.get(parseSquare(sq)!);
    return piece?.role === role && piece.color === color;
  };
  let rights = "";
  if (has("e1", "king", "white")) rights += (has("h1", "rook", "white") ? "K" : "") + (has("a1", "rook", "white") ? "Q" : "");
  if (has("e8", "king", "black")) rights += (has("h8", "rook", "black") ? "k" : "") + (has("a8", "rook", "black") ? "q" : "");
  return rights || "-";
}

export async function editorDone() {
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
export function drawBandChips() {
  const chips = $("band-chips");
  chips.replaceChildren(...(Object.keys(BANDS) as Band[]).map((band) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = BANDS[band].name;
    chip.classList.toggle("on", band === exploreBand);
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      set.exploreBand(band);
      drawBandChips();
    });
    return chip;
  }));
  const info = BANDS[exploreBand];
  $("band-note").textContent = `${info.name}: rated ${info.ratings}, like ${info.stockfish}.`;
}

export function openPaste() {
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
export function startExplore(fen: string, user: Color) {
  set.mode("practice");
  const opponent = `Opponent · ${BANDS[exploreBand].name}`;
  resetBoard(new Game(fen), { White: user === "white" ? playerName() : opponent, Black: user === "black" ? playerName() : opponent, Date: today() });
  set.gameOrigin("train");
  set.explore({ user, band: exploreBand, auto: true, thinking: false });
  set.orientation(user);
  refresh();
  // You go first: the best moves wait until you ask (the bulb). If it's their
  // move, they make it.
  autoReply();
}

/** Playing a move from an earlier point replaces the moves after it. */
export function exploreMove(move: NormalMove) {
  const from = currentPly();
  while (game.length > from) game.undo();
  game.play(move);
  afterMove();
  autoReply();
}

/** When it's their move at the end of the line, they reply by themselves
 *  after a moment - unless auto-reply is paused or you've moved on (stepped
 *  back, played something, opened the coach's card) in the meantime. */
export function autoReply() {
  if (!explore?.auto || viewPly !== null) return;
  if (game.position.turn === explore.user || game.position.isEnd()) return;
  const length = game.length;
  const state = explore;
  setTimeout(() => {
    if (explore !== state || !explore.auto || game.length !== length || viewPly !== null || stepper) return;
    void letThemReply();
  }, AUTO_REPLY_DELAY);
}

export const SIMULATE: CoachButton = {
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
export async function showIdeas() {
  if (!explore || busy) return;
  const { user, band } = explore;
  const position = base();
  setBusy(true, "Let me look at the position…");
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
      if (line.length) moveFrame(position, line[0], `Here's the strongest move. ${moveInWords(position, line[0], user)}`, line.length === 1);
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
      texts.push(line.length ? `${who} would most likely answer with one of these.` : `It's their move. ${who} would most likely play one of these.`);
      const others = 100 - odds.reduce((sum, o) => sum + o.chance, 0);
      frames.push({ position: after, shapes, odds, others: others >= 10 ? others : undefined });
    }
    // The rest of a forcing line, move by move
    let walk = after;
    line.slice(1).forEach((move, i) => {
      const mine = walk.turn === user;
      // (the board shows the order: each move in one plain sentence)
      const text = i === 0 && !mine ? `${narrateMove(walk, move, user)} That's their best defence.` : narrateMove(walk, move, user);
      moveFrame(walk, move, text, false);
      walk = positionAfter(walk, move);
    });
    if (line.length > 1 && score) texts[texts.length - 1] += ` In the end, ${coachVerdict(score, user)}.`;
    setBusy(false);
    if (!frames.length || !explore) return refresh();
    set.stepper({ positions: frames.map((f) => f.position), moves: [], texts, step: 1, mood: "talk", extra: SIMULATE, frames });
    refresh();
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    setBusy(false);
    refresh();
  }
}

/** The start of the best line: your first move, then on while your moves are
 *  forcing (checks and captures), with their replies in between. */
export function forcingStart(position: Chess, line: NormalMove[]): NormalMove[] {
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
export async function letThemReply() {
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
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

/** What the coach says in your position, and the buttons it offers. */
export function exploreSays(reviews: (Review | undefined)[]): CoachSay {
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
      : "Your move. I'll rate it; the bulb shows mine.";
    return { mood: "talk", text, buttons };
  }
  const review = reviews[ply - 1];
  if (!review) return { mood: "think", text: "Let me check that move…", buttons };
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

export interface LessonState {
  phase: LessonPhase;
  index: number;
}

/** The principles on the tab on screen: the opening ones on the Openings tab. */
const lessonPhase = (): LessonPhase => (trainTab === "openings" ? "opening" : trainPhase);


export function showLessonList() {
  const list = $("lesson-list");
  const phase = lessonPhase();
  const lessons = LESSONS[phase];
  list.replaceChildren();
  const back = document.createElement("button");
  back.type = "button";
  back.className = "home-link";
  back.innerHTML = `${icon("back", 16)} ${{ opening: "Openings", middlegame: "Middlegame", endgame: "Endgame" }[phase]}`;
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
    card.addEventListener("click", () => startLesson(phase, i));
    list.append(card);
  });
  $("train-cards").hidden = true;
  list.hidden = false;
}

export function startLesson(phase: LessonPhase, index: number) {
  const item: Lesson | undefined = LESSONS[phase][index];
  if (!item) return;
  set.mode("play");
  resetBoard(new Game(item.steps[0].fen), { White: "?", Black: "?", Event: item.title });
  set.gameOrigin("train");
  set.lesson({ phase, index });
  set.currentView("board");
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
    run: () => { closeStepper(); set.lesson(null); void startPuzzles(phase === "opening" ? "openings" : phase, puzzleLevel, item.themes); },
  };
  set.stepper({
    positions: frames.map((f) => f.position), moves: [], texts: item.steps.map((s) => s.text),
    step: 1, mood: "talk", extra: item.themes.length ? tryIt : undefined, frames,
  });
  set.orientation(frames[0].position.turn);
  refresh();
}
