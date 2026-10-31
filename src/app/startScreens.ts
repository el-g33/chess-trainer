// The start screens: the coach's welcome, then the setup for each mode

import type { Color } from "chessops/types";
import { opposite } from "chessops/util";

import { DEMOS } from "../demos";
import { syncDropdowns } from "../dropdown";
import { Game } from "../game";
import { drawIcons } from "../icons";
import { LEVELS, shortName } from "../levels";
import { type Mode, ground } from "../main";
import { REPERTOIRE, menuName } from "../openings";
import { type Headers, today } from "../pgn";

import { closeOverlay, setFace } from "./coach";
import { drawYourGames } from "./onlineGames";
import {
  $, colourBox, levelBox, menu, menuCard, myOpeningBox, opponentBox, playerNameBox, sfOpeningBox, tcIncrement,
  tcMinutes, timeControlBox,
} from "./dom";
import { refresh } from "./draw";
import { showReviewSetupTour, showTour } from "./featureTour";
import { maybeOpponentMove, startMatch, useDepth } from "./matches";
import { startAnalysis } from "./moves";
import { drawProgress, openingShortName, startDemo } from "./openingDemos";
import { saveSettings } from "./settings";
import { menuMode } from "./startMenu";
import {
  demo, fenPosition, freshViewTrail, greeting, homeChoice, learnColour, learnOpening, matchColour, mode, pgnGames, set,
} from "./state";
import { drawTrainScreen, levelCheckDone, setupTrain } from "./train";

export type HomeScreen = "welcome" | "play" | "practice" | "analysis" | "train" | "progress";
export type HomeChoice = "play" | "practice" | "analysis" | "train";

// Where the game on screen came from, so New game goes back to that setup

// Openings added lately: marked New until their lesson has been opened
export const NEW_OPENINGS = new Set(["French Defence", "Scandinavian Defence", "Nimzo-Indian Defence",
  "Anti-English (vs 1.c4 and 1.Nf3)", "English Opening", "Scotch Game"]);
export const SEEN_KEY = "chess-trainer-openings-seen";

export function openingsSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function markOpeningSeen(name: string) {
  if (!NEW_OPENINGS.has(name) || openingsSeen().includes(name)) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...openingsSeen(), name]));
  } catch {
    // storage blocked: the badge just stays
  }
}

/** Five ways to say hello, so it doesn't feel the same every time. */
export function pickGreeting(): string {
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

export const MODE_LINES: Record<HomeChoice, string> = {
  play: "A real game: no hints until it's over, then we go through it together.",
  practice: "A game with help along the way: ratings, hints and plans.",
  analysis: "Got a game you'd like to analyse? Let's take a look together.",
  train: "Lessons and puzzles for openings, middlegame and endgame.",
};

// The time controls under each icon (values as in the clock's PRESETS)
export const TC_KINDS: Record<string, [string, string][]> = {
  bullet: [["60+0", "1+0"], ["120+1", "2+1"]],
  blitz: [["180+0", "3+0"], ["180+2", "3+2"], ["300+0", "5+0"]],
  rapid: [["600+0", "10+0"], ["900+10", "15+10"], ["1800+0", "30+0"], ["custom", "Custom"]],
  none: [],
};

export const tcKindOf = (value: string) =>
  Object.entries(TC_KINDS).find(([, presets]) => presets.some(([v]) => v === value))?.[0] ?? "none";

export function showScreen(screen: HomeScreen) {
  for (const section of menu.querySelectorAll<HTMLElement>(".screen")) section.hidden = section.dataset.screen !== screen;
  if (screen === "analysis") {
    drawYourGames();
    requestAnimationFrame(() => void showReviewSetupTour(false)); // the first time: how a game gets in
  }
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
export function stickinessNote(): string {
  const level = levelBox.selectedIndex;
  const name = shortName(LEVELS[level]);
  if (level <= 2) return `At ${name} level Stockfish sticks to its opening even when that costs it a little.`;
  if (level <= 4) return `At ${name} level Stockfish keeps to its opening unless that would cost it material.`;
  return `At ${name} level Stockfish only plays its opening moves when they're as good as anything else, and punishes mistakes.`;
}

export function drawHome() {
  // Welcome
  setFace($("home-face"), homeChoice ? "talk" : "wave", 96);
  $("home-bubble").textContent = homeChoice ? MODE_LINES[homeChoice] : greeting;
  $("level-check").hidden = levelCheckDone() || homeChoice !== null;
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
    // The short name only ("Italian", "Caro-Kann / Slav"); the lesson's intro says the rest
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.classList.toggle("on", d.opening === learnOpening);
    tile.innerHTML = `<span class="tile-name"></span>`;
    tile.querySelector(".tile-name")!.textContent = openingShortName(d.opening);
    tile.title = d.opening;
    if (NEW_OPENINGS.has(d.opening) && !openingsSeen().includes(d.opening)) {
      tile.querySelector(".tile-name")!.append(Object.assign(document.createElement("span"), { className: "new-dot", title: "New" }));
      tile.setAttribute("aria-label", `${d.opening} (new)`);
    }
    tile.addEventListener("click", () => {
      markOpeningSeen(d.opening);
      set.learnOpening(d.opening);
      set.gameOrigin("learn");
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

export function setupHome() {
  drawIcons();
  for (const button of menu.querySelectorAll<HTMLButtonElement>(".mode-choice")) {
    button.addEventListener("click", () => {
      set.homeChoice(button.dataset.choice as HomeChoice);
      drawHome();
    });
  }
  $("home-next").addEventListener("click", () => homeChoice && showScreen(homeChoice));
  $("home-progress").addEventListener("click", () => {
    showScreen("progress");
    drawProgress();
  });
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
      set.matchColour(button.dataset.colour as Color);
      drawHome();
      saveSettings();
    });
  }
  for (const button of menu.querySelectorAll<HTMLButtonElement>("#learn-colour button")) {
    button.addEventListener("click", () => {
      set.learnColour(button.dataset.colour as Color);
      set.learnOpening(null);
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
    set.mode("practice");
    resetBoard(new Game());
    set.gameOrigin("analysis");
    set.orientation("white");
    set.canReview(false);
    set.reviewing(false);
    hideMenu();
    refresh();
  });
}

export function setMode(value: Mode) {
  const radio = menuCard.querySelector<HTMLInputElement>(`input[name="mode"][value="${value}"]`);
  if (radio) radio.checked = true;
}

export function startFromHome(kind: "play" | "practice") {
  set.gameOrigin(kind);
  setMode(kind);
  opponentBox.selectedIndex = 0;
  if (kind === "practice") {
    colourBox.value = matchColour === "white" ? "White" : "Black";
  }
  saveSettings();
  onStartGame();
}

export function hideMenu() {
  set.menuOpen(false);
  freshViewTrail(); // a game opened from the menu: back starts from here
  menu.hidden = true;
  // The board may have changed size while hidden
  requestAnimationFrame(() => {
    ground.redrawAll();
    refresh();
  });
}

export function onStartGame() {
  set.mode(menuMode());
  set.canReview(false);
  set.reviewing(false);
  if (mode === "practice" && opponentBox.selectedIndex === 1) {
    resetBoard(new Game()); // a free board: you move both sides
    set.orientation("white");
  } else {
    startMatch();
  }
  hideMenu();
  refresh();
  void maybeOpponentMove(); // if you're Black, Stockfish moves first
  setTimeout(() => void showTour(false), 500); // the first time only
}

/** A fresh game from a position, with nothing else going on. */
export function resetBoard(newGame: Game, headers: Headers = { White: "?", Black: "?", Date: today() }) {
  ground.cancelPremove();
  set.gameHeaders({ ...headers });
  set.currentGameId(null);
  set.puzzle(null);
  set.drill(null);
  set.practice(null);
  set.deepening(null);
  useDepth("quick");
  set.editor(null);
  set.lesson(null);
  set.explore(null);
  set.fromStats(false);
  set.stepper(null);
  closeOverlay(false);
  set.currentView("board");
  if (demo) clearTimeout(demo.timer);
  set.demo(null);
  set.clock(null);
  set.clockTimes([]);
  set.clockHistory([]);
  set.match(null);
  set.analysis(null);
  set.viewPly(null);
  set.preview(null);
  set.quiz(null);
  set.thinking(false);
  set.result("");
  set.showReply(false);
  set.plyNotes(new Map());
  set.game(newGame);
}
