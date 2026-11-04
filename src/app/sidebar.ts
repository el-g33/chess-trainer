// On a computer (a wide screen) the board takes the full height on the left,
// and everything that sits above and below it on a phone - the players, the
// coach, the review bar, the moves, the explanations and the buttons - moves
// into a sidebar on the right, top to bottom. On a narrower screen each part
// goes back to where it was.

const WIDE = window.matchMedia("(min-width: 1000px) and (orientation: landscape)");

// The sidebar's parts, in order from top to bottom
const PARTS = [
  "#bar-top", "#coach-strip", "#review-bar", "#whatif-bar", ".moves-area", "#stepper", "#editor-panel",
  "#drill-setup", "#demo-panel", "#moment-nav", ".board-controls", "#bar-bottom",
];

const homes = new Map<HTMLElement, Comment>(); // where each part sits on a phone

export const sidebarOn = () => WIDE.matches;

export function setupSidebar() {
  const area = document.querySelector<HTMLElement>(".board-area");
  if (!area) return;
  const side = document.createElement("aside");
  side.className = "board-side";
  area.append(side);
  const parts = PARTS.map((selector) => document.querySelector<HTMLElement>(selector)).filter((el): el is HTMLElement => !!el);
  for (const part of parts) {
    const home = document.createComment(part.id || part.className.split(" ")[0]);
    part.before(home);
    homes.set(part, home);
  }
  const place = () => {
    document.body.classList.toggle("sidebar", WIDE.matches);
    for (const part of parts) {
      if (WIDE.matches) side.append(part);
      else homes.get(part)!.after(part);
    }
  };
  place();
  WIDE.addEventListener("change", place);
}
