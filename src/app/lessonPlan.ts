// Your lesson plan: what your recent games say to work on (src/plan.ts), a
// 4-week plan from it, and each day's session of five steps - warm-up (your
// mistakes due), learn (a lesson), drill (positions from your own games, then
// puzzles on the same theme), play (a practice match) and check (that game,
// measured against the week's focus). The checking of your games runs here,
// in the background, with its own copy of Stockfish.

import type { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import { divide } from "../accuracy";
import { Analyser } from "../analyser";
import { afterMove } from "../coach";
import { icon } from "../icons";
import { LESSONS, type LessonPhase } from "../lessons";
import { type Mistake, addMistakes, dueMistakes } from "../mistakes";
import { readPgn } from "../pgn";
import {
  type Diagnosis, FOCUS_LESSONS, FOCUS_PUZZLES, FOCUS_THEMES, FOCUS_WORDS, type Focus, type LessonPlan, type PlanGame,
  type PlanPosition, type PuzzleBand, SESSION_PHASES, SESSIONS, STEPS, WEEK_TITLES, buildPlan, diagnose, measure, planGameOf,
} from "../plan";
import { rateGame } from "../rateGame";

import { type SavedGame, element, loadHistory } from "./coach";
import { $ } from "./dom";
import { startPractice } from "./openingDemos";
import { setPlanReturn } from "./planHooks";
import { showMenu } from "./startMenu";
import { currentGameId, set } from "./state";
import { startLesson } from "./train";

// -- What's kept ----------------------------------------------------------------------

const PLAN_KEY = "chess-trainer-plan";
const CHECKED_KEY = "chess-trainer-plan-games"; // { history id: { game, positions } }
const CHECK_GAMES = 30;
const MIN_GAMES = 10;

interface Checked { game: PlanGame; positions: PlanPosition[] }

const load = <T>(key: string, empty: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return empty;
  }
};
const keep = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: it's worked out again next time
  }
};

export const loadPlan = (): LessonPlan | null => load<LessonPlan | null>(PLAN_KEY, null);
const savePlan = (plan: LessonPlan | null) => (plan ? keep(PLAN_KEY, plan) : localStorage.removeItem(PLAN_KEY));
const loadChecked = (): Record<string, Checked> => load<Record<string, Checked>>(CHECKED_KEY, {});

// -- Checking your games ----------------------------------------------------------------

let checking: { done: number; total: number; stop: boolean } | null = null;
let checkAnalyser: Analyser | null = null;
let diagnosis: Diagnosis | null = null; // the last one worked out, for the screen
let chosenGoal: Focus | undefined;

/** Your games to check: the latest, played by you (with a result). */
const yourGames = (count = CHECK_GAMES): SavedGame[] => loadHistory().filter((g) => g.result).slice(0, count);

/** One game, rated the way a review rates it (with one second look, to be quick), as the plan sees it. */
async function checkGame(saved: SavedGame, stop: () => boolean): Promise<Checked | null> {
  const [parsed] = readPgn(saved.pgn);
  if (!parsed) return null;
  const { game } = parsed.load();
  if (game.length < 8) return null;
  // (light: shallower and with no second looks - checked against full reviews,
  // it finds the same priorities, several times faster)
  if (!checkAnalyser) {
    checkAnalyser = new Analyser(() => {});
    checkAnalyser.depth = "light";
  }
  checkAnalyser.forget();
  const ratings = await rateGame(game, checkAnalyser, 0, stop);
  if (!ratings) return null;
  const positions: Chess[] = Array.from({ length: game.length + 1 }, (_, i) => game.positionAt(i));
  const moves = game.moves.map((m) => m.move as NormalMove);
  const sans = game.moves.map((m) => m.san);
  const division = divide(positions);
  const phaseOf = (ply: number) => (division.middle === undefined || ply < division.middle ? "opening"
    : division.end !== undefined && division.end <= ply ? "endgame" : "middlegame") as "opening" | "middlegame" | "endgame";
  const timeout = /on time/i.test(parsed.headers.Termination ?? "");
  return planGameOf(saved.id, saved.user, saved.result, positions, moves, sans, checkAnalyser.evals, ratings, phaseOf, timeout);
}

/** Check the games not checked yet (the rest are kept from before), then work out what they say. */
async function checkYourGames(games: SavedGame[], then: () => void) {
  if (checking) return;
  const kept = loadChecked();
  const todo = games.filter((g) => !kept[g.id]);
  checking = { done: games.length - todo.length, total: games.length, stop: false };
  const state = checking;
  drawPlan();
  for (const saved of todo) {
    const found = await checkGame(saved, () => state.stop);
    if (state.stop) break;
    if (found) {
      const all = loadChecked();
      all[saved.id] = found;
      keep(CHECKED_KEY, trimChecked(all));
    }
    state.done++;
    drawPlan();
  }
  checking = null;
  if (!state.stop) then();
  drawPlan();
}

/** The checked games kept: the latest 60, so storage stays small. */
function trimChecked(all: Record<string, Checked>): Record<string, Checked> {
  const recent = new Set(loadHistory().slice(0, 60).map((g) => g.id));
  return Object.fromEntries(Object.entries(all).filter(([id]) => recent.has(id)));
}

function workOutDiagnosis(games: SavedGame[]) {
  const kept = loadChecked();
  const planGames = games.flatMap((g) => (kept[g.id] ? [kept[g.id].game] : []));
  diagnosis = planGames.length ? diagnose(planGames) : null;
}

/** Puzzles at about your level: from your opponents' ratings, else your puzzle level. */
function bandFor(): PuzzleBand {
  const ratings = loadHistory().flatMap((g) => (g.opponentRating ? [g.opponentRating] : [])).slice(0, 40).sort((a, b) => a - b);
  const typical = ratings[ratings.length >> 1];
  if (typical) return typical < 900 ? "first" : typical < 1200 ? "beginner" : typical < 1600 ? "club" : "advanced";
  return "beginner";
}

// -- The screen ----------------------------------------------------------------------------

const FOCUS_HOW: Record<Focus, string> = {
  safety: "Before every move, three questions: what did this piece guard? Is its new square safe? What does their last move attack?",
  tactics: "Every move, look for checks, captures and threats: is anything of theirs loose, can a knight hit two things at once?",
  conversion: "When you're winning: trade pieces, deal with their threats first, and don't rush.",
  endgame: "Bring your king into the game, push your passed pawns, put rooks behind passed pawns.",
  opening: "The centre, knights and bishops out, castle; don't move the same piece twice.",
  time: "Keep time in hand: quick on the obvious moves, slow on the ones that decide the game.",
};

const GOALS: [Focus, string][] = [
  ["safety", "Stop losing pieces"], ["tactics", "Spot tactics"], ["conversion", "Win won games"],
  ["opening", "My openings"], ["endgame", "Endgames"], ["time", "My clock"],
];

const button = (label: string, kind: "accent" | "soft" | "" , run: () => void, ico?: string) => {
  const b = element("button", `plan-button ${kind}`.trim(), "");
  b.type = "button";
  b.innerHTML = ico ? `${icon(ico, 18)} ` : "";
  b.append(label);
  b.addEventListener("click", run);
  return b;
};

/** Your lesson plan screen, in whatever state it's in. */
export function drawPlan() {
  const box = $("plan-body");
  box.replaceChildren();
  const plan = loadPlan();
  if (checking) return drawChecking(box, checking);
  if (diagnosis && !plan) return drawDiagnosis(box, diagnosis);
  if (!plan) return drawStart(box);
  if (sessionOpen) return drawSession(box, plan);
  drawOverview(box, plan);
}

function drawStart(box: HTMLElement) {
  const games = yourGames();
  const card = element("div", "progress-card plan-hero");
  card.append(element("h3", "", "Build it from my games"));
  card.append(element("p", "setup-note", games.length >= MIN_GAMES
    ? `I'll check your last ${games.length} games and find what costs you the most points. It takes a few minutes the first time.`
    : `I need at least ${MIN_GAMES} of your games: play some here, or bring yours in from Game history (Get my games or Import PGN). You have ${games.length}.`));
  const go = button("Check my games", "accent", () => {
    chosenGoal = undefined;
    void checkYourGames(games, () => workOutDiagnosis(games));
  }, "search");
  go.disabled = games.length < MIN_GAMES;
  card.append(go);
  box.append(card);
  box.append(element("p", "plan-label", "Or choose what to work on"));
  const goals = element("div", "plan-goals");
  for (const [focus, label] of GOALS) {
    goals.append(button(label, "", () => {
      chosenGoal = focus;
      if (games.length >= MIN_GAMES) void checkYourGames(games, () => makePlan(games, focus));
      else makePlan([], focus);
    }));
  }
  box.append(goals);
}

function drawChecking(box: HTMLElement, state: { done: number; total: number }) {
  const card = element("div", "progress-card");
  card.append(element("h3", "", "Checking your games"));
  card.append(element("p", "setup-note", `${state.done} of ${state.total}. Games checked before are kept, so next time is quick.`));
  const track = element("div", "stats-progress-track");
  const fill = element("div", "stats-progress-fill");
  fill.style.width = `${Math.round((state.done / Math.max(1, state.total)) * 100)}%`;
  track.append(fill);
  card.append(track, button("Stop", "soft", () => {
    if (checking) checking.stop = true;
  }));
  box.append(card);
}

const perGame = (value: number) => value.toFixed(value >= 10 ? 0 : 1);

function drawDiagnosis(box: HTMLElement, d: Diagnosis) {
  const head = element("div", "progress-card");
  head.append(element("h3", "", `Your last ${d.games} games`));
  head.append(element("p", "", `${d.results.win} won, ${d.results.loss} lost${d.results.draw ? `, ${d.results.draw} drawn` : ""}.`));
  box.append(head);
  const top = d.priorities.filter((p) => p.cost > 0.01).slice(0, 3);
  top.forEach((p, i) => {
    const card = element("div", "progress-card plan-priority");
    card.append(element("h3", "", `${i + 1} · ${FOCUS_WORDS[p.focus]}${p.detail ? `: ${p.detail}` : ""}`));
    const value = p.focus === "conversion" ? `${Math.round(p.value * 100)}%` : p.focus === "opening" ? `${Math.round(p.value)}%` : perGame(p.value);
    card.append(element("p", "plan-number", value), element("p", "setup-note", `${p.metric}. ${FOCUS_HOW[p.focus]}`));
    box.append(card);
  });
  const quiet = d.perGame["missed-other"] ?? 0;
  if (quiet >= 0.5) {
    box.append(element("p", "setup-note", `Not counted: about ${perGame(quiet)} quieter chances a game (a better square, a pawn break). They're the next step, once the above are rarer.`));
  }
  const games = yourGames();
  if (d.close && top.length > 1) {
    box.append(element("p", "plan-label", "These two are close. Which first?"));
    const pick = element("div", "plan-goals");
    pick.append(button(FOCUS_WORDS[top[0].focus], "accent", () => makePlan(games, top[0].focus)), button(FOCUS_WORDS[top[1].focus], "", () => makePlan(games, top[1].focus)));
    box.append(pick);
  } else {
    box.append(button("Make my 4-week plan", "accent", () => makePlan(games, chosenGoal), "flag"));
  }
}

function makePlan(games: SavedGame[], goal?: Focus) {
  if (games.length) workOutDiagnosis(games);
  const d = diagnosis ?? diagnose([]);
  const plan = buildPlan(d, bandFor(), goal, d.perGame["missed-other"] ?? 0);
  savePlan(plan);
  diagnosis = null;
  drawPlan();
}

function weekTitle(plan: LessonPlan, i: number): string {
  const week = plan.weeks[i];
  return week.focus === "together" && week.pair ? `${FOCUS_WORDS[week.pair[0]]} + ${FOCUS_WORDS[week.pair[1]].toLowerCase()}` : WEEK_TITLES[week.focus];
}

function drawOverview(box: HTMLElement, plan: LessonPlan) {
  const done = plan.week >= plan.weeks.length;
  // what the last session's game showed
  if (checkNote) box.append(element("p", "plan-check-note", checkNote));
  plan.weeks.forEach((week, i) => {
    const card = element("div", `progress-card plan-week${i === plan.week ? " current" : ""}${i < plan.week ? " past" : ""}`);
    card.append(element("h3", "", `Week ${i + 1} · ${weekTitle(plan, i)}`));
    const dots = element("div", "plan-dots");
    for (let s = 0; s < SESSIONS; s++) dots.append(element("span", s < week.done ? "on" : ""));
    card.append(dots);
    const focus = week.focus === "together" ? week.pair?.[0] : week.focus;
    if (week.results.length && focus) {
      const now = week.results.reduce((a, b) => a + b, 0) / week.results.length;
      card.append(element("p", "setup-note", `Before: ${perGame(week.baseline)} · in this week's games: ${perGame(now)}`));
    } else if (i === plan.week && focus) {
      card.append(element("p", "setup-note", FOCUS_HOW[focus]));
    }
    box.append(card);
  });
  if (!done) {
    box.append(button(`Today's session · Week ${plan.week + 1}, session ${plan.weeks[plan.week].done + 1} of ${SESSIONS}`, "accent", () => openSession(), "play"));
  } else {
    box.append(element("p", "setup-note", "That's your four weeks done. Check your games again for a new plan: the numbers show what changed."));
  }
  if (plan.next.length) {
    box.append(element("p", "plan-label", "After this"));
    for (const step of plan.next) {
      const card = element("div", "progress-card plan-next");
      card.append(element("h3", "", step.title), element("p", "setup-note", step.text));
      box.append(card);
    }
  }
  box.append(button("Start a new plan", "soft", () => {
    savePlan(null);
    drawPlan();
  }));
}

// -- A session ------------------------------------------------------------------------------

let sessionOpen = false;

export function openPlan() {
  showMenu();
  sessionOpen = false;
  showPlanScreen();
}

export function openSession() {
  sessionOpen = true;
  drawPlan();
}

function showPlanScreen() {
  set.homeChoice(null);
  for (const section of document.querySelectorAll<HTMLElement>("#menu .screen")) section.hidden = section.dataset.screen !== "plan";
  drawPlan();
}

/** The week's focus (in a "both" week, the session alternates between the two). */
function sessionFocus(plan: LessonPlan): Focus {
  const week = plan.weeks[plan.week];
  if (week.focus !== "together") return week.focus;
  return week.pair![week.done % 2];
}

function drawSession(box: HTMLElement, plan: LessonPlan) {
  const week = plan.weeks[plan.week];
  const focus = sessionFocus(plan);
  // (a warm-up with nothing due, or no lesson for this one: on to the next step)
  const empty = (step: number) => (step === 0 && !dueMistakes().length) || (step === 1 && !lessonFor(focus, week.done));
  if (empty(plan.step)) {
    while (plan.step < 2 && empty(plan.step)) plan.step++;
    savePlan(plan);
  }
  const head = element("div", "progress-card");
  head.append(element("h3", "", `Week ${plan.week + 1}, session ${week.done + 1} · ${FOCUS_WORDS[focus]}`));
  head.append(element("p", "setup-note", FOCUS_HOW[focus]));
  box.append(head);
  const list = element("div", "plan-steps");
  STEPS.forEach((name, i) => {
    const row = element("div", `plan-step${i < plan.step ? " done" : i === plan.step ? " now" : ""}`);
    row.append(element("span", "plan-step-mark", i < plan.step ? "✓" : String(i + 1)));
    const words = element("span", "plan-step-words");
    words.append(element("b", "", name), element("small", "", stepNote(plan, i)));
    row.append(words);
    list.append(row);
  });
  box.append(list);
  if (checkNote) box.append(element("p", "plan-check-note", checkNote));
  if (plan.step < STEPS.length) box.append(button(`${plan.step ? "Continue" : "Start"}: ${STEPS[plan.step]}`, "accent", () => void runStep(plan), "play"));
  box.append(button("Back to the plan", "soft", () => {
    sessionOpen = false;
    drawPlan();
  }));
}

let checkNote = ""; // what the Check step found

function stepNote(plan: LessonPlan, step: number): string {
  const focus = sessionFocus(plan);
  const session = plan.weeks[plan.week].done;
  switch (step) {
    case 0: {
      const due = dueMistakes().length;
      return due ? `${Math.min(5, due)} of your mistakes due today` : "Nothing due today: skipped";
    }
    case 1: return lessonFor(focus, session)?.title ?? "No lesson for this one yet: skipped";
    case 2: {
      const phase = SESSION_PHASES[session % SESSION_PHASES.length];
      return `10 positions${phase ? ` from the ${phase}` : ""}: yours first, then puzzles`;
    }
    case 3: return "A practice match against the coach, with this week's focus in mind";
    default: return "That game, checked against this week's focus";
  }
}

function lessonFor(focus: Focus, session: number): { title: string; phase: LessonPhase; index: number } | undefined {
  const titles = FOCUS_LESSONS[focus];
  for (let k = 0; k < titles.length; k++) {
    const title = titles[(session + k) % titles.length];
    for (const phase of ["opening", "middlegame", "endgame"] as LessonPhase[]) {
      const index = LESSONS[phase].findIndex((l) => l.title === title);
      if (index >= 0) return { title, phase, index };
    }
  }
  return undefined;
}

/** Back from a step's activity: that step done, on to the next. */
function stepDone(plan: LessonPlan) {
  const fresh = loadPlan();
  if (!fresh || fresh.made !== plan.made) return;
  fresh.step = Math.max(fresh.step, plan.step + 1);
  savePlan(fresh);
  showMenu();
  sessionOpen = true;
  showPlanScreen();
}

let playedGame: string | null = null; // the Play step's game, for the Check step

async function runStep(plan: LessonPlan) {
  const focus = sessionFocus(plan);
  const session = plan.weeks[plan.week].done;
  const back = () => stepDone(plan);
  checkNote = "";
  switch (plan.step) {
    case 0: {
      const due = dueMistakes().slice(0, 5);
      if (!due.length) return back();
      setPlanReturn(back);
      startPractice(due);
      return;
    }
    case 1: {
      const lesson = lessonFor(focus, session);
      if (!lesson) return back();
      setPlanReturn(back);
      startLesson(lesson.phase, lesson.index);
      return;
    }
    case 2: {
      const list = await drillFor(plan, focus, session);
      if (!list.length) return back();
      setPlanReturn(back);
      startPractice(list, "Drill");
      return;
    }
    case 3: {
      // the Practice match screen, ready to start; its result card comes back here
      const { showScreen } = await import("./startScreens");
      set.homeChoice("practice");
      showScreen("practice");
      playedGame = null;
      setPlanReturn(() => {
        // (the game just played, once it's in your history: a game too short to keep isn't)
        playedGame = currentGameId && loadHistory().some((g) => g.id === currentGameId) ? currentGameId : null;
        back();
      });
      return;
    }
    default:
      return void checkPlayed(plan, focus);
  }
}

/** The Check step: the game just played, checked, and measured against the week's focus. */
async function checkPlayed(plan: LessonPlan, focus: Focus) {
  const saved = playedGame ? loadHistory().find((g) => g.id === playedGame) : undefined;
  const finish = (value?: number) => {
    const fresh = loadPlan();
    if (!fresh) return;
    const week = fresh.weeks[fresh.week];
    if (value !== undefined) week.results.push(value);
    week.done++;
    fresh.step = 0;
    if (week.done >= SESSIONS) fresh.week++;
    savePlan(fresh);
    sessionOpen = false;
    drawPlan();
  };
  if (!saved) {
    checkNote = "That game was too short to check. Next session, play it through.";
    return finish();
  }
  checkNote = "Checking your game…";
  drawPlan();
  const found = await checkGame(saved, () => false);
  if (!found) {
    checkNote = "That game was too short to check. Next session, play it through.";
    return finish();
  }
  const all = loadChecked();
  all[saved.id] = found;
  keep(CHECKED_KEY, trimChecked(all));
  const week = plan.weeks[plan.week];
  // (in a "both" week, the first of the two is the one tracked)
  const tracked = week.focus === "together" && week.pair ? week.pair[0] : focus;
  const value = measure(tracked, found.game);
  const words: Record<Focus, string> = {
    safety: `${value} piece${value === 1 ? "" : "s"} left to be taken`,
    tactics: `${value} free piece${value === 1 ? "" : "s"} or tactic${value === 1 ? "" : "s"} missed`,
    endgame: `${value} endgame slip${value === 1 ? "" : "s"}`,
    conversion: value ? "a winning position not won" : "no winning position let slip",
    opening: `${Math.round(100 - value)}% winning chances after move 10`,
    time: value ? "time trouble" : "no time trouble",
  };
  checkNote = `This game: ${words[tracked]}. When the plan started: ${perGame(week.baseline)} a game.`;
  // its slips go into the drills from now on
  if (found.positions.length) toMistakes(found.positions.slice(0, 5));
  finish(value);
}

// -- The drill: your positions first, then puzzles on the same theme ------------------------

let puzzles: Promise<Record<string, Record<PuzzleBand, [string, string, string, number, string][]>>> | null = null;

async function drillFor(plan: LessonPlan, focus: Focus, session: number): Promise<Mistake[]> {
  const phase = SESSION_PHASES[session % SESSION_PHASES.length];
  const themes = FOCUS_THEMES[focus];
  const seen = new Set(load<string[]>("chess-trainer-plan-seen", []));
  // yours: the focus's themes, this session's phase first, ones not seen yet first
  const yours = Object.values(loadChecked()).flatMap((c) => c.positions).filter((p) => themes.includes(p.theme));
  const order = (p: PlanPosition) => (seen.has(p.fen) ? 2 : 0) + (phase && p.phase !== phase ? 1 : 0);
  const mine = [...yours].sort((a, b) => order(a) - order(b) || Math.random() - 0.5).slice(0, 5);
  // then puzzles at your level on the focus's themes, from the same phase when there are some
  puzzles ??= fetch(`${import.meta.env.BASE_URL}puzzles/themes.json`).then((r) => r.json());
  const sets = await puzzles.catch(() => ({} as Awaited<NonNullable<typeof puzzles>>));
  const rows = FOCUS_PUZZLES[focus].flatMap((t) => sets[t]?.[plan.band] ?? []);
  const fits = rows.filter((r) => !seen.has(r[0]) && (!phase || r[4].split(" ").includes(phase)));
  const pool = (fits.length >= 10 ? fits : rows).sort(() => Math.random() - 0.5).slice(0, 10 - mine.length);
  for (const p of mine) seen.add(p.fen);
  for (const r of pool) seen.add(r[0]);
  keep("chess-trainer-plan-seen", [...seen].slice(-2000));
  const list: Mistake[] = [...mine.map(positionMistake), ...pool.flatMap((r) => puzzleMistake(r))];
  // (your own positions go into Your mistakes too, to come back until you have them)
  toMistakes(mine);
  return list;
}

const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

function positionMistake(p: PlanPosition): Mistake {
  return {
    id: `${p.fen}|${p.best}`, fen: p.fen, best: p.best, kind: p.theme.startsWith("missed") ? "miss" : "mistake",
    phase: p.phase, source: "one of your games", added: today(), due: today(), stage: 0,
  };
}

/** A Lichess puzzle as a position to solve: their move first, then yours to find. */
function puzzleMistake(row: [string, string, string, number, string]): Mistake[] {
  const [id, fen, moves] = row;
  const [theirs, yours] = moves.split(" ");
  const parsed = readPgn(`[FEN "${fen}"]\n[SetUp "1"]\n\n*`)[0]?.load().game;
  const move = parseUci(theirs) as NormalMove | undefined;
  if (!parsed || !move || !yours || !parsed.position.isLegal(move)) return [];
  const after = afterMove(parsed.position, move);
  const phase = row[4].includes("endgame") ? "endgame" : row[4].includes("opening") ? "opening" : "middlegame";
  return [{ id: `puzzle:${id}`, fen: fenOfPosition(after), best: yours, kind: "drill", phase, source: "a puzzle", added: today(), due: today(), stage: 0 }];
}

function toMistakes(list: PlanPosition[]) {
  addMistakes(list.map((p) => ({ fen: p.fen, best: p.best, kind: p.theme.startsWith("missed") ? "miss" : "mistake", phase: p.phase, source: "one of your games" })));
}

const fenOfPosition = (position: Chess) => makeFen(position.toSetup());

// -- Home: today's session -------------------------------------------------------------------

/** The Today card on Home, while a plan is on. */
export function drawPlanToday() {
  const box = document.getElementById("plan-today");
  if (!box) return;
  const plan = loadPlan();
  box.hidden = !plan || plan.week >= plan.weeks.length;
  if (box.hidden || !plan) return;
  const week = plan.weeks[plan.week];
  box.replaceChildren();
  const words = element("span", "plan-today-words");
  words.append(element("small", "", `Today · Week ${plan.week + 1}, session ${week.done + 1} of ${SESSIONS}`), element("b", "", FOCUS_WORDS[sessionFocus(plan)]));
  box.append(words, button(plan.step ? "Continue" : "Start", "accent", () => {
    openPlan();
    openSession();
  }));
}

/** The Training row: your plan, or a way to make one. */
export function drawPlanRow() {
  const note = document.getElementById("plan-row-note");
  if (!note) return;
  const plan = loadPlan();
  note.textContent = !plan ? "What your games say to work on, in short daily sessions"
    : plan.week >= plan.weeks.length ? "Your four weeks are done" : `Week ${plan.week + 1}: ${FOCUS_WORDS[sessionFocus(plan)]}`;
}

export function setupPlan() {
  document.getElementById("train-plan")?.addEventListener("click", openPlan);
  document.querySelector<HTMLElement>('.screen[data-screen="plan"] .plan-back')?.addEventListener("click", () => {
    if (sessionOpen) {
      sessionOpen = false;
      drawPlan();
      return;
    }
    if (diagnosis) diagnosis = null;
    showMenu();
  });
}

