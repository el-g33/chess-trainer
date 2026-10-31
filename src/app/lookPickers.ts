// Settings: Theme, Board and Pieces chosen from pictures instead of names.
// Each row shows its choice in small; tapping it opens a picker of tiles that
// preview every option. A tile applies at once (through the hidden <select>,
// so saving and the theme's matching board and pieces work as before).

import { pieceSample } from "../pieces";

import { $, piecesBox, themeBox, uiThemeBox } from "./dom";
import { THEME_BOARDS } from "./startMenu";

// The colours behind each theme and board (as in themes.css), for the tiles
const THEME_LOOKS: Record<string, { bg: string; card: string; accent: string }> = {
  stone: { bg: "#9a908a", card: "#f2eeea", accent: "#e8743b" },
  classic: { bg: "#fafafa", card: "#ffffff", accent: "#005fb8" },
  ember: { bg: "#16181e", card: "#1f2229", accent: "#ff5a36" },
  violet: { bg: "#33365e", card: "#3f4277", accent: "#5de0e6" },
  forest: { bg: "#1d2b24", card: "#26372e", accent: "#d4a83a" },
  rose: { bg: "#e8d5d2", card: "#fff8f6", accent: "#b0285f" },
};
const BOARD_LOOKS: Record<string, [string, string]> = {
  wood: ["#b58863", "#f0d9b5"],
  grey: ["#9ea3a8", "#eeeeee"],
  slate: ["#5f687b", "#9aa3b5"],
  walnut: ["#a9805e", "#ede3d3"],
  lavender: ["#8f89cf", "#cfcbf0"],
  green: ["#6f8f55", "#e9e4c8"],
  rose: ["#c98f93", "#f7e6e2"],
};

type Kind = "theme" | "board" | "pieces";
const PICKERS: Record<Kind, { select: HTMLSelectElement; title: string }> = {
  theme: { select: uiThemeBox, title: "Theme" },
  board: { select: themeBox, title: "Board" },
  pieces: { select: piecesBox, title: "Pieces" },
};

const dialog = () => $<HTMLDialogElement>("look-picker");
let showing: Kind | null = null;

/** A small board: n×n squares in the board's colours (the wood board as its picture). */
function miniBoard(board: string, n: number, className: string): HTMLElement {
  const box = document.createElement("span");
  box.className = className;
  if (board === "wood") {
    box.classList.add("lp-wood");
    box.style.backgroundImage = `url("${import.meta.env.BASE_URL}boards/wood.jpg")`;
    return box;
  }
  const [dark, light] = BOARD_LOOKS[board] ?? BOARD_LOOKS.walnut;
  box.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  for (let i = 0; i < n * n; i++) {
    const square = document.createElement("i");
    square.style.background = (Math.floor(i / n) + (i % n)) % 2 ? dark : light;
    box.append(square);
  }
  return box;
}

function kings(choice: string): HTMLElement[] {
  return (["white", "black"] as const).map((side) => {
    const piece = document.createElement("span");
    piece.className = "lp-piece";
    const picture = pieceSample(choice, side);
    if (picture) piece.style.backgroundImage = `url("${picture}")`;
    return piece;
  });
}

/** What a tile (or a row's small preview) shows for one choice. */
function preview(kind: Kind, value: string, small = false): HTMLElement {
  if (kind === "board") return miniBoard(value, small ? 2 : 4, small ? "lp-swatch" : "lp-board");
  if (kind === "pieces") {
    const box = document.createElement("span");
    box.className = small ? "lp-swatch lp-kings" : "lp-pieces";
    const [dark, light] = BOARD_LOOKS[themeBox.value] ?? BOARD_LOOKS.walnut;
    box.style.background = `linear-gradient(90deg, ${light} 50%, ${dark} 50%)`;
    box.append(...kings(value));
    return box;
  }
  const look = THEME_LOOKS[value] ?? THEME_LOOKS.classic;
  const app = document.createElement("span");
  app.className = small ? "lp-swatch lp-dot" : "lp-app";
  app.style.background = look.bg;
  if (small) {
    app.style.borderColor = look.accent;
    return app;
  }
  const card = document.createElement("span");
  card.className = "lp-card";
  card.style.background = look.card;
  const button = document.createElement("span");
  button.className = "lp-accent";
  button.style.background = look.accent;
  card.append(miniBoard(THEME_BOARDS[value] ?? "wood", 4, "lp-mini"), button);
  app.append(card);
  return app;
}

/** The rows in Settings: each choice's name and its small preview. */
export function drawLookRows() {
  for (const [kind, { select, title }] of Object.entries(PICKERS) as [Kind, (typeof PICKERS)[Kind]][]) {
    const row = $<HTMLButtonElement>(`${select.id}-look`);
    const name = document.createElement("span");
    name.className = "lp-name";
    name.textContent = select.selectedOptions[0]?.text ?? "";
    const label = document.createElement("span");
    label.className = "lp-row-title";
    label.textContent = title;
    row.replaceChildren(label, preview(kind, select.value, true), name);
  }
}

function drawTiles() {
  if (!showing) return;
  const { select, title } = PICKERS[showing];
  $("lp-title").textContent = title;
  const kind = showing;
  $("lp-tiles").className = `lp-tiles lp-tiles-${kind}`;
  $("lp-tiles").replaceChildren(...[...select.options].map((option) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "lp-tile" + (option.value === select.value ? " on" : "");
    tile.setAttribute("aria-pressed", String(option.value === select.value));
    const label = document.createElement("span");
    label.className = "lp-label";
    label.textContent = option.text;
    tile.append(preview(kind, option.value), label);
    tile.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      drawTiles();
      drawLookRows();
    });
    return tile;
  }));
}

function openPicker(kind: Kind) {
  showing = kind;
  drawTiles();
  dialog().showModal();
}

/** Put a picture row in place of each of the three boxes (the boxes stay, hidden). */
export function setupLookPickers() {
  for (const [kind, { select }] of Object.entries(PICKERS) as [Kind, (typeof PICKERS)[Kind]][]) {
    const row = document.createElement("button");
    row.type = "button";
    row.id = `${select.id}-look`;
    row.className = "look-button wide"; // the whole row: its own label, the picture and the name
    select.after(row);
    const label = document.querySelector<HTMLElement>(`label[for="${select.id}"]`);
    if (label) label.hidden = true;
    row.addEventListener("click", () => openPicker(kind));
    select.addEventListener("change", drawLookRows);
  }
  $("lp-done").addEventListener("click", () => dialog().close());
  // Tapping outside the picker closes it too
  dialog().addEventListener("click", (event) => {
    if (event.target === dialog()) dialog().close();
  });
  drawLookRows();
}
