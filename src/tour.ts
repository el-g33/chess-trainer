// The feature tour: callout bubbles that point at each part of the screen in
// turn, with Back / Next / No thanks and a "Don't show this again" tick box.
// The rest of the page is dimmed and can't be clicked while it's open. The
// coach pops up on the card, so it's clear on every theme that a tour is on.

import { avatarSvg } from "./avatar";

export interface TourStep {
  target: string; // CSS selector; steps whose target isn't on screen are skipped
  title: string;
  text: string;
}

export interface TourEnd {
  finished: boolean; // went through to the end
  neverAgain: boolean; // the tick box
}

let open: { close: (finished: boolean) => void } | null = null;

export const tourOpen = () => open !== null;

const visible = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement && element.offsetParent !== null && element.getClientRects().length > 0;

/** Show the tour; resolves when it's closed. */
export function runTour(steps: TourStep[], title: string): Promise<TourEnd> {
  open?.close(false);
  const shown = steps.filter((step) => visible(document.querySelector(step.target)));
  if (!shown.length) return Promise.resolve({ finished: true, neverAgain: false });

  const blocker = document.createElement("div");
  blocker.className = "tour-blocker";
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const bubble = document.createElement("div");
  bubble.className = "tour-bubble";
  bubble.setAttribute("role", "dialog");
  bubble.setAttribute("aria-label", title);
  bubble.innerHTML = `
    <div class="tour-coach">${avatarSvg("talk", 44)}</div>
    <div class="tour-count"></div>
    <h3 class="tour-title"></h3>
    <p class="tour-text"></p>
    <label class="check tour-never"><input type="checkbox" /> Don't show this again</label>
    <div class="tour-buttons">
      <button type="button" class="tour-skip">No thanks</button>
      <span class="tour-gap"></span>
      <button type="button" class="tour-back">&lsaquo; Back</button>
      <button type="button" class="tour-next accent">Next &rsaquo;</button>
    </div>`;
  document.body.append(blocker, spot, bubble);
  const q = <T extends HTMLElement>(selector: string) => bubble.querySelector<T>(selector)!;
  const never = q<HTMLInputElement>(".tour-never input");
  let index = 0;

  function place() {
    const target = document.querySelector(shown[index].target);
    if (!visible(target)) return;
    const rect = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      left: `${rect.left - pad}px`, top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`,
    });
    const width = Math.min(340, window.innerWidth - 32);
    bubble.style.width = `${width}px`;
    const height = bubble.offsetHeight;
    const gap = 14;
    let top: number;
    const coach = 22; // the coach sticks out above the card
    if (rect.bottom + gap + coach + height <= window.innerHeight - 8) top = rect.bottom + gap + coach; // below
    else if (rect.top - gap - height >= 8) top = rect.top - gap - height; // above
    else top = Math.max(8, window.innerHeight - height - 8); // over it, at the bottom of the screen
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  function show() {
    const step = shown[index];
    q(".tour-count").textContent = `${title} - ${index + 1} of ${shown.length}`;
    q(".tour-title").textContent = step.title;
    q(".tour-text").textContent = step.text;
    q<HTMLButtonElement>(".tour-back").disabled = index === 0;
    q(".tour-next").innerHTML = index === shown.length - 1 ? "Done" : "Next &rsaquo;";
    const target = document.querySelector(step.target) as HTMLElement;
    target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    place();
    q<HTMLButtonElement>(".tour-next").focus();
  }

  return new Promise((resolve) => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    function close(finished: boolean) {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey, true);
      blocker.remove();
      spot.remove();
      bubble.remove();
      open = null;
      resolve({ finished, neverAgain: never.checked });
    }
    function step(direction: number) {
      if (index + direction >= shown.length) return close(true);
      index = Math.max(0, index + direction);
      show();
    }
    open = { close };
    q(".tour-next").addEventListener("click", () => step(1));
    q(".tour-back").addEventListener("click", () => step(-1));
    q(".tour-skip").addEventListener("click", () => close(false));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey, true); // before the page's own keys
    show();
  });
}
