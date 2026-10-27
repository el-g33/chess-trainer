// The What's new card: after an update (the versions you haven't seen yet),
// and from Settings (this version's)

import { icon } from "../icons";
import { RELEASES, type Release, newSinceLastVisit, shortVersion } from "../whatsNew";

import { setFace } from "./coach";
import { $, settingsDialog } from "./dom";

declare const __BUILD__: string; // see vite.config.ts

const card = () => $<HTMLDialogElement>("whats-new");

export function showWhatsNew(releases: Release[]) {
  if (!releases.length) return;
  setFace($("wn-face"), "happy", 48);
  $("wn-title").textContent = `What's new in ${releases[0].version}`;
  $("wn-version").textContent = `Version ${__BUILD__}`;
  const items = $("wn-items");
  items.replaceChildren();
  releases.forEach((release, i) => {
    if (i > 0) items.append(Object.assign(document.createElement("p"), { className: "wn-also", textContent: `Also new in ${release.version}` }));
    for (const item of release.items) {
      const row = document.createElement("div");
      row.className = "wn-item";
      const text = document.createElement("span");
      text.append(Object.assign(document.createElement("b"), { textContent: item.title }), item.text);
      row.innerHTML = icon(item.icon, 20);
      row.append(text);
      items.append(row);
    }
  });
  if (!card().open) card().showModal();
  $("wn-ok").focus();
}

export function setupWhatsNew() {
  $("wn-ok").addEventListener("click", () => card().close());
  $("whats-new-open").addEventListener("click", () => {
    settingsDialog.close();
    const current = shortVersion(__BUILD__);
    showWhatsNew(RELEASES.filter((r) => r.version === current).concat(RELEASES.filter((r) => r.version !== current)).slice(0, 1));
  });
  // After an update: what's new since the version you last saw
  showWhatsNew(newSinceLastVisit(shortVersion(__BUILD__)));
}
