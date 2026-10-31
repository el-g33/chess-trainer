// Turning points: the few moments that turned a reviewed game (the moves where the
// eval swung from one side to the other, or a chance to swing it was missed),
// listed on the summary, and a way through the review that stops only at those.

import type { Color } from "chessops/types";

import { colourName } from "../coach";
import { icon } from "../icons";
import { currentPly } from "../main";
import type { Review } from "../review";
import { listener, reviews } from "./coach";
import { $ } from "./dom";
import { refresh } from "./draw";
import { type Fundamental, type FundamentalKind, fundamentalEvents, fundamentalWords, fundamentalsOn } from "./fundamentals";
import { GRADE_JUMP_PAUSE, backToStats, watching, withBook } from "./matches";
import { goTo } from "./moves";
import { analysis, currentView, demo, game, reviewing, set } from "./state";

const MOST = 6;
// A big swing in the mover's winning chance (0-100) that also changes who is
// better: winning to level or losing, or level to losing. A slip that leaves
// the game where it was (still winning, still lost) isn't a turning point.
const SWING = 20;
const side = (chance: number) => (chance >= 65 ? 1 : chance <= 35 ? -1 : 0);
const turned = (review: Review | undefined) =>
  !!review && review.chanceBefore - review.chanceAfter >= SWING && side(review.chanceAfter) < side(review.chanceBefore);

const SIGNS: Record<FundamentalKind, { sign: string; ico: string }> = {
  mated: { sign: "red", ico: "hazard" },
  "mate-missed": { sign: "amber", ico: "hazard" },
  hung: { sign: "red", ico: "hazard" },
  fork: { sign: "red", ico: "hazard" },
  pawn: { sign: "orange", ico: "hazard" },
  left: { sign: "amber", ico: "gift" },
  took: { sign: "chance", ico: "gift" },
};

/** The game's turning points, in move order (up to six, the biggest swings
 *  first). A big swing only counts with a reason you can see on the board: a
 *  piece left loose or walked into a fork, a threat ignored that loses
 *  material, a checkmate walked into or missed, or a winning capture missed.
 *  (A swing the engine sees in a quiet move is left to the full review.) With
 *  the fundamentals lens, a piece left loose and taken shows as the take
 *  ("Free knight: you took it") on the move after. */
function turningPoints(list: (Review | undefined)[]): { ply: number; event?: Fundamental }[] {
  const events = fundamentalEvents(list);
  const reason = (ply: number) => events.some((e) => e.ply === ply && e.kind !== "took");
  const swings = list.flatMap((review, i) =>
    turned(review) && reason(i + 1) ? [{ ply: i + 1, size: review!.chanceBefore - review!.chanceAfter }] : []);
  const biggest = swings.sort((a, b) => b.size - a.size).slice(0, MOST).sort((a, b) => a.ply - b.ply);
  if (!fundamentalsOn()) return biggest.map(({ ply }) => ({ ply }));
  return biggest.map(({ ply }) => {
    const took = events.find((e) => e.ply === ply + 1 && e.kind === "took");
    return took ? { ply: ply + 1, event: took } : { ply, event: events.find((e) => e.ply === ply) };
  });
}

/** The plies of the game's turning points, in move order. */
export function keyMoments(list: (Review | undefined)[]): number[] {
  return turningPoints(list).map((point) => point.ply);
}

/** A moment in a few words, from your side: "Your key move", "Their slip: your chance". */
function momentWords(review: Review, viewer: Color | null, mover: Color): { text: string; sign: string; ico: string } {
  const whose = viewer === null ? `${colourName(mover)}'s` : mover === viewer ? "Your" : "Their";
  const theirs = viewer !== null && mover !== viewer;
  if (review.rating === "Brilliant") return { text: `${whose} masterstroke`, sign: "star", ico: "star" };
  if (review.rating === "Great") return { text: `${whose} key move`, sign: "star", ico: "star" };
  if (theirs) {
    if (review.rating === "Miss" || review.rating === "Missed Win") return { text: "A chance they missed", sign: "escape", ico: "shield" };
    return { text: review.rating === "Blunder" ? "Their blunder: your chance" : "Their mistake: your chance", sign: "chance", ico: "gift" };
  }
  if (review.rating === "Miss") return { text: viewer === null ? `${whose} missed chance` : "Your missed chance", sign: "amber", ico: "hazard" };
  if (review.rating === "Missed Win") return { text: viewer === null ? `${whose} missed win` : "A win you missed", sign: "orange", ico: "hazard" };
  if (review.rating === "Blunder") return { text: `${whose} blunder`, sign: "red", ico: "hazard" };
  return { text: `${whose} mistake`, sign: "orange", ico: "hazard" };
}

let moments: number[] | null = null; // going through the turning points only

export const keyMomentsOn = () => moments !== null && reviewing;

/** The turning points being gone through (none when not in that mode). */
export const turningPlies = (): number[] => (keyMomentsOn() ? moments! : []);

/** The summary's list of moments, with the two ways into the review. */
export function keyMomentsCard(list: (Review | undefined)[], startReview: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "key-moments";
  const points = turningPoints(list);
  const plies = points.map((point) => point.ply);
  const viewer: Color | null = watching() ? null : listener();
  const events = new Map(points.flatMap((point) => (point.event ? [[point.ply, point.event] as const] : [])));
  if (plies.length) {
    const title = document.createElement("p");
    title.className = "key-moments-title";
    title.textContent = "Turning points";
    box.append(title);
    for (const ply of plies) {
      const event = events.get(ply);
      const words = event ? { text: fundamentalWords(event, viewer), ...SIGNS[event.kind] } : momentWords(list[ply - 1]!, viewer, game.moverOf(ply));
      const row = document.createElement("button");
      row.type = "button";
      row.className = "key-moment";
      row.innerHTML = `<span class="moment-sign ${words.sign}">${icon(words.ico, 16)}</span><span class="moment-words"><b></b> · <span></span></span><span class="moment-go">›</span>`;
      row.querySelector("b")!.textContent = `Move ${Math.ceil(ply / 2)}`;
      row.querySelector(".moment-words span")!.textContent = words.text;
      row.addEventListener("click", () => showMoment(ply, plies));
      box.append(row);
    }
  }
  const start = document.createElement("div");
  start.className = "stats-start";
  if (plies.length) start.append(startButton(`Turning points (${plies.length})`, "accent", () => showMoment(plies[0], plies)));
  start.append(startButton(plies.length ? "Every move" : "Start the review", plies.length ? "soft" : "accent", () => {
    moments = null;
    startReview();
  }));
  box.append(start);
  return box;
}

function startButton(label: string, kind: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `round labelled ${kind}`;
  button.innerHTML = icon("play", 18);
  const words = document.createElement("span");
  words.textContent = label;
  button.append(words);
  button.addEventListener("click", run);
  return button;
}

/** On the board at a moment: the position before it, then the move plays in. */
export function showMoment(ply: number, plies: number[] = moments ?? []) {
  moments = plies;
  set.currentView("board");
  goTo(ply - 1);
  set.silentJump(true);
  refresh();
  setTimeout(() => {
    if (moments && currentPly() === ply - 1) goTo(ply);
  }, GRADE_JUMP_PAUSE);
}

/** Where the board is among the turning points: the one on screen (its move,
 *  or the position just before it), else the ones either side. */
function around(list: number[], now: number): { at: number; previous?: number; next?: number } {
  const at = list.findIndex((ply) => now === ply || now === ply - 1);
  if (at >= 0) return { at, previous: list[at - 1], next: list[at + 1] };
  return { at: -1, previous: [...list].reverse().find((ply) => ply < now), next: list.find((ply) => ply > now) };
}

/** The big buttons while going through the turning points: the previous or
 *  next one (past the last: back to the summary). The move buttons above them
 *  still step one move at a time. False when not going through them. */
export function momentJump(where: "back" | "forward"): boolean {
  if (!keyMomentsOn()) return false;
  const { previous, next } = around(moments!, currentPly());
  if (where === "back") {
    if (previous) showMoment(previous);
  } else if (next) showMoment(next);
  else {
    moments = null;
    backToStats();
  }
  return true;
}

/** The review bar above the board, and the big buttons under it while going
 *  through the turning points (the move buttons make way for them). */
export function drawMomentsBar() {
  if (!reviewing) moments = null;
  const show = reviewing && currentView === "board" && !analysis && !demo;
  $("review-bar").hidden = !show;
  const on = show && keyMomentsOn();
  document.querySelector(".board-area")?.classList.toggle("moments", on);
  $("moment-nav").hidden = !on;
  if (!show) return;
  const plies = keyMoments(withBook(reviews()));
  $("review-label").textContent = on ? "Turning points" : "Reviewing";
  $("review-switch").textContent = on ? "Full review ›" : "Turning points ›";
  $("review-switch").hidden = !on && !plies.length;
  if (!on) return;
  const list = moments!;
  const { at, previous, next } = around(list, currentPly());
  const shown = at >= 0 ? at : list.indexOf(previous ?? list[0]);
  $("moment-count").textContent = `${shown + 1} of ${list.length}`;
  $("moment-move").textContent = `Move ${game.positionAt(list[shown] - 1).fullmoves}`;
  // (no greyed-out button to mistake for the move buttons: the first has no Previous)
  $("moment-prev").hidden = previous === undefined;
  $("moment-next").textContent = next === undefined ? "Back to summary ›" : "Next turning point ›";
}

/** The review bar's button: from the turning points to the full review (every
 *  move, from the one on screen), or back into the turning points. */
export function switchReview() {
  if (keyMomentsOn()) {
    moments = null;
    refresh();
    return;
  }
  const plies = keyMoments(withBook(reviews()));
  if (!plies.length) return;
  const now = currentPly();
  showMoment(plies.find((ply) => ply >= now) ?? plies[0], plies);
}
