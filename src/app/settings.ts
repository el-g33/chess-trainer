// Settings remembered between visits (only on this device)

import type { Mode } from "../main";

import {
  arrowStyleBox, clockTickBox, coachSpeedBox, colourBox, evalCheck, levelBox, myOpeningBox, opponentBox, piecesBox,
  planModeBox, playerNameBox, rateMovesBox, reviewDepthBox, sfOpeningBox, soundOn, soundStyleBox, soundVolume,
  tcIncrement, tcMinutes, themeBox, timeControlBox, uiThemeBox,
} from "./dom";
import { menuMode } from "./startMenu";
import { puzzleLevel } from "./state";

export const SETTINGS_KEY = "chess-trainer-settings";

export interface Settings {
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
  reviewDepth?: string;
  arrowStyle?: string;
  coachSpeed?: string;
  puzzleLevel?: string;
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

export function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveSettings() {
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
    reviewDepth: reviewDepthBox.value,
    arrowStyle: arrowStyleBox.value,
    coachSpeed: coachSpeedBox.value,
    puzzleLevel,
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
