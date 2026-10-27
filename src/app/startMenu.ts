// The start menu

import type { Color } from "chessops/types";

import { PRESETS } from "../clock";
import { enhanceSelects } from "../dropdown";
import { DEFAULT_LEVEL, LEVELS } from "../levels";
import { type Mode, NO_OPENING, STOCKFISH_DECIDES, SUGGESTED, applyArrowStyle } from "../main";
import { REPERTOIRE, menuName } from "../openings";
import { PIECE_CHOICES, setPalette } from "../pieces";
import { SOUND_STYLES, type SoundStyle, play, setSound, soundForMove } from "../sounds";
import { setTypeSpeed } from "../talk";

import {
  $, arrowStyleBox, clockTickBox, coachSpeedBox, colourBox, evalCheck, levelBox, menu, menuCard, myOpeningBox,
  opponentBox, piecesBox, planModeBox, playerNameBox, lichessUserBox, chesscomUserBox, rateMovesBox, reviewDepthBox,
  sfOpeningBox, soundOn,
  soundStyleBox, soundVolume, tcIncrement, tcMinutes, themeBox, timeControlBox, uiThemeBox,
} from "./dom";
import { setupLookPickers } from "./lookPickers";
import { loadSettings } from "./settings";
import { drawHome, pickGreeting, setupHome, showScreen } from "./startScreens";
import { orientation, set } from "./state";
import { PUZZLE_LEVELS, type PuzzleLevel } from "./train";

declare const __BUILD__: string; // see vite.config.ts
export const menuMode = (): Mode =>
  (menuCard.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value as Mode) ?? "play";

export function buildMenu() {
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
  set.matchColour(REPERTOIRE.find((o) => menuName(o) === myOpeningBox.value)?.colour ?? (saved.colour === "Black" ? "black" : "white"));
  if (saved.rateMoves !== undefined) rateMovesBox.checked = saved.rateMoves;
  if (saved.evalBar !== undefined) evalCheck.checked = saved.evalBar;
  if (saved.boardTheme) themeBox.value = saved.boardTheme;
  if (saved.planMode) planModeBox.value = saved.planMode;
  reviewDepthBox.value = saved.reviewDepth === "deep" ? "deep" : "quick";
  arrowStyleBox.value = saved.arrowStyle === "colourblind" ? "colourblind" : "standard";
  coachSpeedBox.value = ["50", "33", "16", "0"].includes(saved.coachSpeed ?? "") ? saved.coachSpeed! : "33";
  if (PUZZLE_LEVELS.some(([v]) => v === saved.puzzleLevel)) set.puzzleLevel(saved.puzzleLevel as PuzzleLevel);
  applyArrowStyle();
  setTypeSpeed(Number(coachSpeedBox.value));
  if (planModeBox.selectedIndex < 0) planModeBox.selectedIndex = 0;
  if (saved.soundOn !== undefined) soundOn.checked = saved.soundOn;
  if (saved.soundVolume !== undefined) soundVolume.value = String(saved.soundVolume);
  for (const [value, label] of Object.entries(SOUND_STYLES)) soundStyleBox.add(new Option(label, value));
  soundStyleBox.value = saved.soundStyle && saved.soundStyle in SOUND_STYLES ? saved.soundStyle : "original";
  if (saved.playerName) playerNameBox.value = saved.playerName;
  if (saved.lichessUser) lichessUserBox.value = saved.lichessUser;
  if (saved.chesscomUser) chesscomUserBox.value = saved.chesscomUser;
  if (saved.timeControl) timeControlBox.value = saved.timeControl;
  if (timeControlBox.selectedIndex < 0) timeControlBox.selectedIndex = 0;
  if (saved.tcMinutes) tcMinutes.value = String(saved.tcMinutes);
  if (saved.tcIncrement !== undefined) tcIncrement.value = String(saved.tcIncrement);
  if (saved.clockTick !== undefined) clockTickBox.checked = saved.clockTick;
  applySound();
  $("app-version").textContent = `Version ${__BUILD__}`;
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
  setupLookPickers();
}

/** Sound effects on or off, how loud, and in which style. */
export function applySound() {
  setSound(soundOn.checked, Number(soundVolume.value) / 100, soundStyleBox.value as SoundStyle);
  soundVolume.disabled = !soundOn.checked;
  soundStyleBox.disabled = !soundOn.checked;
}

/** A move's sound: a little lower when it's their move (the side at the top of the board). */
export function moveSound(san: string, mover: Color) {
  void play(soundForMove(san), mover !== orientation);
}

/** The board theme: "wood" or "grey" (a class on the board). */
// Each look comes with a board that suits it (the Board box can still change it)
export const DEFAULT_THEME = "stone";
export const THEME_BOARDS: Record<string, string> = {
  classic: "wood", ember: "slate", stone: "walnut", violet: "lavender", forest: "green", rose: "rose",
};
export const THEME_BARS: Record<string, string> = {
  classic: "#fafafa", ember: "#16181e", stone: "#9a908a", violet: "#33365e", forest: "#1d2b24", rose: "#e8d5d2",
};

/** The colours of the whole page: Classic, Midnight ember, Warm stone or Violet glass. */
export function applyUiTheme() {
  const theme = uiThemeBox.value;
  document.documentElement.dataset.ui = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BARS[theme] ?? "#fafafa");
}

export function applyTheme() {
  const board = $("board");
  for (const option of themeBox.options) board.classList.toggle(option.value, option.value === themeBox.value);
}

/** Grey out the options that don't apply to the chosen mode. */
export function updateMenu() {
  drawHome();
}

export function showMenu() {
  set.menuOpen(true);
  set.homeChoice(null);
  set.greeting(pickGreeting());
  showScreen("welcome");
  menu.hidden = false;
}
