// The phone's back gesture (Android's back button or swipe): one step back
// within the app - a popup closes, then the card, then Trying moves, then the
// view you came from, then the menu screen's own back - and only at Home does
// it leave the app. One extra history entry catches each back press.

import { closeOverlay, closeStepper, onNewGame, overlayOpen } from "./coach";
import { $, menu } from "./dom";
import { refresh } from "./draw";
import { analysis, currentView, menuOpen, reviewing, set, stepper, viewTrail } from "./state";

/** One step back inside the app; false when there's nowhere left to go (Home). */
export function stepBack(): boolean {
  // a popup on top: close it, as its own close or cancel would
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")];
  const top = dialogs[dialogs.length - 1];
  if (top) {
    if (top.dispatchEvent(new Event("cancel", { cancelable: true }))) top.close();
    return true;
  }
  if (overlayOpen()) {
    closeOverlay();
    return true;
  }
  if (stepper) {
    closeStepper();
    return true;
  }
  if (analysis) {
    $("whatif-exit").click();
    return true;
  }
  if (menuOpen) {
    // the screen's own way back: a list's back first, then its Home link
    const visible = (element: HTMLElement) => element.offsetParent !== null;
    const links = [...menu.querySelectorAll<HTMLElement>(".home-link, .setup-back")].filter(visible);
    const back = links.find((link) => !link.classList.contains("setup-back")) ?? links[0];
    if (!back) return false; // Home itself
    back.click();
    return true;
  }
  // in a game: the view you came from; a review's board goes back to its summary;
  // else the screen it was started from, as New game does (asking first if a game is on)
  const previous = viewTrail.pop() ?? (reviewing && currentView === "board" ? "stats" : undefined);
  if (previous) {
    set.viewBack(previous);
    refresh();
  } else void onNewGame("Leave this game?");
  return true;
}

export function setupBackGesture() {
  if (!window.history?.pushState) return;
  const catcher = () => history.pushState({ backCatcher: true }, "");
  catcher();
  window.addEventListener("popstate", () => {
    if (stepBack()) catcher();
    else history.back(); // at Home: let the phone leave the app
  });
}
