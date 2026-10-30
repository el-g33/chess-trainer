// The player bars: name, captured pieces and material lead

import { Chess } from "chessops/chess";
import type { Color, Role } from "chessops/types";
import { opposite } from "chessops/util";

import { type Phase, accuracyRating, divide, gameAccuracy, phaseAccuracy } from "../accuracy";
import { missedBrilliant } from "../brilliant";
import { formatClock } from "../clock";
import type { Score } from "../coach";
import { LESSONS } from "../lessons";
import { analyser, base, currentPly, gameMoves, ratingsOn, shown } from "../main";
import { reviewOpeningChoice } from "../openingPlan";
import { type OpeningInfo, firstMoveOf, setupProgress, systemFor } from "../openings";
import { ratingName } from "../ratingNames";
import { type Review, fenOf, isDrawnPosition } from "../review";
import { play } from "../sounds";
import { tourOpen } from "../tour";

import { overlayOpen } from "./coach";
import {
  $, clockTickBox, moveList, navButtons, openingLabel, playerNameBox, repertoireLabel, replyButton, reviewBox,
  reviewProgress, viewLabel,
} from "./dom";
import { onFlag } from "./matches";
import { goTo } from "./moves";
import { demoTitle, openingShortName } from "./openingDemos";
import { analysisReview, reviewPly } from "./ratings";
import {
  orientation, analysis, book, busy, clock, demo, drill, editor, game, gameHeaders, lastTickSecond, lesson, match,
  menuOpen, mode, plyNotes, practice, preview, puzzle, quiz, reviewing, set, showReply, stepper, viewPly,
} from "./state";
import { PUZZLE_LEVELS } from "./train";

export const VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
export const CAPTURE_ORDER: Role[] = ["pawn", "knight", "bishop", "rook", "queen"];

/** Your name from the start menu ("You" if none is set). */
export function playerName(): string {
  return playerNameBox.value.trim() || "You";
}

/** The name on a colour's bar: from the game's headers, with the rating if known. */
export function barName(colour: Color): string {
  const key = colour === "white" ? "White" : "Black";
  const name = gameHeaders[key];
  if (!name || name === "?") return colour === "white" ? "White" : "Black";
  const elo = gameHeaders[`${key}Elo`];
  return elo && elo !== "?" && elo !== "-" ? `${name} (${elo})` : name;
}

export function drawPlayerBars() {
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
      : practice && bar.id === "bar-top" ? `Your mistakes · ${Math.min(practice.index + 1, practice.list.length)} of ${practice.list.length}`
      : drill && bar.id === "bar-top" ? `${openingShortName(drill.demo.opening)} drill · Round ${drill.round}`
      : puzzle?.check && bar.id === "bar-top" ? `Find your level · ${puzzle.index + 1} of ${puzzle.list.length}`
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

export function legalMoveCount(position: Chess): number {
  let count = 0;
  for (const targets of position.allDests().values()) count += targets.size();
  return count;
}

/** Practice mode stops the clock while you use the coach, look back or
 *  analyse; both modes stop it while the menu is open. */
export function clockShouldPause(): boolean {
  if (menuOpen || tourOpen()) return true;
  if (mode !== "practice") return false;
  return busy || viewPly !== null || analysis !== null || preview !== null || quiz !== null ||
    stepper !== null || overlayOpen() || document.querySelector("dialog[open]") !== null;
}

export function drawClocks() {
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

export function clockTick() {
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
      set.lastTickSecond(second);
      void play("tick");
    }
  }
}

export function drawMoveList(reviews: (Review | undefined)[], info: OpeningInfo[]) {
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
      lines.push(`The coach is playing: ${match.sfOpening.name}${match.sfActive ? "" : " (opening phase over)"}`);
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
export function openingChoiceNote(ply: number, review: Review | undefined): string | undefined {
  if (!review || !book || !match?.myOpening || game.moverOf(ply) !== match.user) return undefined;
  const before = game.positionAt(ply - 1);
  const best = analyser.evals.get(fenOf(before))?.best;
  const first = firstMoveOf(game.positionAt(0), gameMoves().slice(0, Math.max(0, ply - 1)));
  return reviewOpeningChoice(before, game.moves[ply - 1].move, review.loss, best, match.myOpening, book, first);
}

export const RATING_ORDER = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced",
  "Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"];

/** Stockfish's score for each position of the game (White's view), where known. */
export function gameScores(): (Score | undefined)[] {
  return Array.from({ length: game.length + 1 }, (_, ply) => {
    const position = game.positionAt(ply);
    if (position.isCheckmate()) return { mate: position.turn === "black" ? 1 : -1 };
    if (isDrawnPosition(position)) return { cp: 0 };
    return analyser.evals.get(fenOf(position))?.score;
  });
}

/** The game report: each player's accuracy in each phase, coloured like the
 *  ratings, and how many moves got each rating. */
export function drawGameReport(reviews: (Review | undefined)[], info: OpeningInfo[]) {
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
      span.textContent = `${ratingName(rating)} ${tally.get(rating)}`;
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
export const ratingClass = (rating: string) => "r-" + rating.toLowerCase().replace(" ", "-");

/** The ratings worth noticing in the move list, and their marks. */
export const MOVE_MARKS: Record<string, string> = {
  Brilliant: "!!", Great: "!", Best: "◆", Inaccuracy: "?!", Mistake: "?", Miss: "⊘", "Missed Win": "⊘", Blunder: "??",
};

export function drawReview(reviews: (Review | undefined)[], info: OpeningInfo[]) {
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
    else if (!review) paragraph(ratingsOn() ? "Let me check that move…" : "Move ratings are switched off.");
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
        paragraph(moveInfo.book ? `Theory (${name})` : "Opening", "review-opening");
        paragraph(notes.map((note) => `• ${note}`).join("\n"), "review-notes");
      }
    }
    if (!ratingsOn()) paragraph("Move ratings are switched off.");
    else if (ply === 0) paragraph("Make a move, or tap a move in the list, to see what I think of it.");
    else if (!reviews[ply - 1]) paragraph("Let me check that move…");
    else {
      showRating(reviews[ply - 1]!);
      const missed = missedBrilliant(game.positionAt(ply - 1), game.moves[ply - 1].move, analyser.evals);
      if (missed) paragraph(missed, "review-missed");
    }
  }

  drawGameReport(reviews, info);
  const { done, total } = analyser.progress();
  reviewProgress.textContent = reviewing && done < total ? `Checking the game: ${done} of ${total} positions` : "";
  reviewProgress.hidden = !reviewProgress.textContent;

  // In a match the review stays on your move; this shows Stockfish's reply
  const current = currentPly();
  const live = match !== null && viewPly === null && !preview && !analysis;
  if (live && reviewPly() < current) {
    replyButton.innerHTML = "See their reply &rsaquo;";
    replyButton.disabled = false;
  } else if (live && showReply && current && game.moverOf(current) !== match!.user) {
    replyButton.innerHTML = "&lsaquo; Back to your move";
    replyButton.disabled = false;
  } else {
    replyButton.innerHTML = "See their reply &rsaquo;";
    replyButton.disabled = true;
  }
}
