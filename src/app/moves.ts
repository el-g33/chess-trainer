// Moves on the board

import type { Key } from "@lichess-org/chessground/types";
import { Chess, normalizeMove } from "chessops/chess";
import { parseFen } from "chessops/fen";
import type { Color, NormalMove, Role } from "chessops/types";
import { opposite, parseSquare } from "chessops/util";

import { colourName, variationSan } from "../coach";
import { Game } from "../game";
import { icon } from "../icons";
import { analysing, base, currentPly, freeBoard, ground, quizWaiting } from "../main";
import { fenOf } from "../review";

import { overlayOpen } from "./coach";
import { $, fenInput } from "./dom";
import { refresh } from "./draw";
import { afterMove, coachMyOpening, maybeOpponentMove } from "./matches";
import { drillMove, practiceMove } from "./openingDemos";
import { reviewPgnGame } from "./pgnScreens";
import { moveSound } from "./startMenu";
import { hideMenu, resetBoard } from "./startScreens";
import {
  analysis, busy, clock, clockHistory, clockTimes, demo, demoStepping, drill, editor, explore, fenPosition, game,
  match, menuOpen, mode, orientation, pgnGames, plyNotes, practice, preview, puzzle, quiz, replayStepping, replaying, set,
  stepper, thinking, viewPly,
} from "./state";
import { answerQuiz } from "./strategyCoach";
import { autoReply, exploreMove, puzzleMove } from "./train";

/** The position your moves are made in: in a quiz, your opponent's turn (your
 *  move skipped); in analysis, the position on screen; otherwise the game. */
export function clickPosition(): Chess {
  if (quizWaiting()) return quiz!.threat!.passed!;
  return analysing() ? base() : game.position;
}

/** Can pieces be moved right now, and which side's? */
export function movableColour(): Color | undefined {
  if (busy || thinking || preview || menuOpen || quiz?.lineStep || demo || stepper || overlayOpen() || editor) return undefined;
  if (drill) {
    return drill.state === "playing" && !drill.waiting && viewPly === null && game.position.turn === drill.user ? drill.user : undefined;
  }
  if (practice) return practice.state === "solving" && !practice.waiting && viewPly === null ? game.position.turn : undefined;
  if (puzzle) {
    return puzzle.state === "solving" && viewPly === null && game.length > 0 && game.position.turn === puzzle.side ? puzzle.side : undefined;
  }
  if (quizWaiting()) return quiz!.threat!.them;
  if (analysing()) return base().turn;
  if (viewPly !== null) return undefined; // looking back in Play mode
  if (match) return game.position.turn === match.user ? match.user : undefined;
  return game.outcome() ? undefined : game.position.turn; // a free board
}

/** In a timed game against the coach: while it thinks, you can set up your
 *  next move (a premove), played the moment it has moved. */
export function premoveColour(): Color | undefined {
  if (!match || !clock || mode !== "play" || viewPly !== null || menuOpen || overlayOpen() || game.outcome()) return undefined;
  return game.position.turn !== match.user ? match.user : undefined;
}

let playingPremove = false;

/** Play the move set up while the coach was thinking, if it's still legal. */
export function playPremove() {
  playingPremove = true;
  try {
    ground.playPremove();
  } finally {
    playingPremove = false;
  }
}

export function onBoardMove(from: Key, to: Key) {
  if (editor) return; // setting up a position: editorSync keeps track
  const position = clickPosition();
  const given: NormalMove = { from: parseSquare(from)!, to: parseSquare(to)! };
  // A pawn reaching the last rank: you choose what it becomes (nothing chosen: the move is taken back)
  if (position.board.get(given.from)?.role === "pawn" && (to[1] === "8" || to[1] === "1")) {
    // a premove becomes a queen (no time to ask while the clock runs)
    if (playingPremove) return playBoardMove(position, { ...given, promotion: "queen" });
    void choosePromotion(to, position.turn).then((role) => {
      if (!role) return refresh();
      playBoardMove(position, { ...given, promotion: role });
    });
    return;
  }
  playBoardMove(position, given);
}

function playBoardMove(position: Chess, given: NormalMove) {
  const move = normalizeMove(position, given) as NormalMove;
  if (drill) {
    drillMove(move);
  } else if (practice) {
    void practiceMove(move);
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

const PROMOTIONS: Role[] = ["queen", "knight", "rook", "bishop"];

/** What the pawn becomes: the four pieces in a column on its square (as on
 *  Lichess). Tapping anywhere else cancels. */
function choosePromotion(to: Key, colour: Color): Promise<Role | null> {
  const board = document.querySelector<HTMLElement>("#board cg-board");
  if (!board) return Promise.resolve("queen");
  const rect = board.getBoundingClientRect();
  const size = rect.width / 8;
  const file = to.charCodeAt(0) - 97;
  const rank = Number(to[1]);
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 8 - rank : rank - 1;
  const down = row === 0; // from the top edge the pieces go down, from the bottom edge up
  const cover = document.createElement("div");
  cover.className = "promotion-pick";
  Object.assign(cover.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  return new Promise((resolve) => {
    const done = (role: Role | null) => {
      cover.remove();
      resolve(role);
    };
    PROMOTIONS.forEach((role, i) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "promotion-choice";
      choice.setAttribute("aria-label", cap(role));
      Object.assign(choice.style, {
        left: `${column * size}px`, top: `${(down ? row + i : row - i) * size}px`, width: `${size}px`, height: `${size}px`,
      });
      choice.append(Object.assign(document.createElement("span"), { className: `mini-piece ${role} ${colour}` }));
      choice.addEventListener("click", (event) => {
        event.stopPropagation();
        done(role);
      });
      cover.append(choice);
    });
    cover.addEventListener("click", () => done(null));
    document.body.append(cover);
    cover.querySelector<HTMLButtonElement>("button")?.focus();
  });
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// -- Analysis: "what if I'd moved differently?" -----------------------------

export function analysisMove(move: NormalMove) {
  let line = analysis;
  if (!line) {
    line = { fromPly: currentPly(), line: new Game(fenOf(base())), ahead: [] };
    set.analysis(line);
    set.quiz(null);
  }
  const played = line.line.play(move);
  line.ahead = []; // a new move replaces the ones stepped back over
  moveSound(played.san, opposite(line.line.position.turn));
  set.preview(null);
  refresh();
}

/** The analysis moves so far, e.g. "14. Nf3 Bg4 15. h3". */
export function analysisLineText(): string {
  if (!analysis || !analysis.line.length) return "";
  return variationSan(analysis.line.positionAt(0), analysis.line.moves.map((m) => m.move));
}

/** Take back the last analysis move; with none left, leave analysis. */
export function analysisTakeBack() {
  if (!analysis || !analysis.line.length) return;
  const undone = analysis.line.moves[analysis.line.length - 1].move;
  analysis.line.undo();
  analysis.ahead.unshift(undone);
  set.preview(null);
  refresh();
}

export function analysisForward() {
  if (!analysis || !analysis.ahead.length) return;
  const played = analysis.line.play(analysis.ahead.shift()!);
  moveSound(played.san, opposite(analysis.line.position.turn));
  set.preview(null);
  refresh();
}

/** The step buttons and arrow keys: in a What-if they move through the
 *  What-if moves, never the game. */
export function navigate(where: "first" | "back" | "forward" | "last") {
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

export function drawWhatIf() {
  const bar = $("whatif-bar");
  bar.hidden = !analysis;
  document.querySelector(".board-area")!.classList.toggle("whatif", analysis !== null);
  if (!analysis) return;
  $("whatif-text").innerHTML = `${icon("search", 18)}<span>Trying moves</span>`;
}

export function exitAnalysis() {
  if (!analysis) return;
  set.analysis(null);
  set.preview(null);
  refresh();
}

// -- Stepping through the game ------------------------------------------------

export function goTo(ply: number) {
  set.stepper(null);
  set.silentJump(false);
  if (demo && !demoStepping) {
    clearTimeout(demo.timer);
    if (demo.playing) demo.interrupted = true;
    demo.playing = false;
    if (demo.intro) {
      // out of the introduction's setup and into the line itself
      demo.intro = false;
      set.game(new Game());
      for (const step of demo.steps) game.play(step.move);
    }
  }
  if (replaying && !replayStepping) set.replaying(false);
  ply = Math.max(0, Math.min(ply, game.length));
  if (ply === currentPly() + 1 && !analysis) moveSound(game.moves[ply - 1].san, game.positionAt(ply - 1).turn);
  set.analysis(null); // moving through the game leaves any analysis line
  set.viewPly(ply === game.length ? null : ply);
  refresh();
  if (explore && viewPly === null) autoReply(); // back at the end: they carry on
}

export function onUndo() {
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
  set.viewPly(null);
  refresh();
  if (match) void maybeOpponentMove();
}


/** Check the position box on the analysis screen. */
export function readFen() {
  const text = fenInput.value.trim();
  set.fenPosition(null);
  if (text) {
    try {
      set.fenPosition(Chess.fromSetup(parseFen(text).unwrap()).unwrap());
    } catch {
      set.fenPosition(null);
    }
  }
  const status = $("fen-status");
  status.classList.toggle("problem", !!text && !fenPosition);
  status.textContent = !text ? "" : fenPosition ? `A position with ${colourName(fenPosition.turn)} to move.` : "That doesn't look like a valid FEN position.";
}

/** Explore the position from the analysis screen. */
export function loadFenPosition() {
  if (!fenPosition) return;
  set.mode("practice");
  resetBoard(new Game(fenOf(fenPosition)));
  set.gameOrigin("analysis");
  set.orientation(fenPosition.turn);
  set.canReview(false);
  set.reviewing(false);
  if (menuOpen) hideMenu();
  refresh();
}

/** Start on the analysis screen: the game, the position, or ask which. */
export async function startAnalysis(event: Event) {
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
