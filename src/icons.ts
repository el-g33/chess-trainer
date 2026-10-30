// Small line icons, drawn for this app (24x24, stroke = currentColor), so
// they take the theme's colours. Any element with data-ico="name" gets one.

const PATHS: Record<string, string> = {
  gear:
    '<circle cx="12" cy="12" r="8.2" stroke-width="3.4" stroke-dasharray="3.2 3.24" stroke-linecap="butt"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6.5 9.5V20h11V9.5M10 20v-5.5h4V20"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" fill-opacity=".9"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  replay: '<path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4"/>',
  skipPrev: '<path d="M6 5v14M18 5l-9 7 9 7z"/>',
  skipNext: '<path d="M18 5v14M6 5l9 7-9 7z"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  first: '<path d="M18 5l-7 7 7 7M11 5l-7 7 7 7"/>',
  last: '<path d="M6 5l7 7-7 7M13 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  knight:
    '<path d="M7 20h11M8.5 20c-.3-3 .7-5.2 3-7.2-2.3.4-4 .2-5.3-.8L8 8.5c1-2.6 3.3-4.3 6.3-4.3 2.6 2.5 3.6 7.4 2.7 15.8"/><circle cx="11.5" cy="8" r=".6"/>',
  school: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3.2 2.4 7.8 2.4 11 0v-4.5M21.5 9.5v5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  bullet: '<path d="M9 20.5h6V11c0-3.6-1.3-6.4-3-8.5-1.7 2.1-3 4.9-3 8.5z"/><path d="M8 20.5h8M9 11h6"/>',
  blitz: '<path d="M13.5 2.5L5.5 13.5h5.5l-1 8 8-11h-5.5z"/>',
  rapid: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5v3.5M18.5 6.5l1.5-1.5"/>',
  infinity: '<path d="M12 12c-2-2.6-3.6-4-5.4-4a4 4 0 0 0 0 8c1.8 0 3.4-1.4 5.4-4zm0 0c2 2.6 3.6 4 5.4 4a4 4 0 0 0 0-8c-1.8 0-3.4 1.4-5.4 4z"/>',
  shuffle: '<path d="M4 7h3.5c3.5 0 5.5 10 9 10H20M4 17h3.5c1.5 0 2.7-1.8 3.7-3.8M20 7h-3.5c-1.5 0-2.7 1.8-3.7 3.8M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>',
  dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  target: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4.5"/><circle cx="11" cy="13" r="1"/><path d="M11 13l8.5-8.5M16.5 4.5h3v3"/>',
  hazard: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5c4.5-2 7.5 2 13 0v9c-5.5 2-8.5-2-13 0"/>',
  chart: '<path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v3.5h3.5"/><path d="M12 8v4.5l3 2"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/><path d="M4 4h8v8H4zM12 12h8v8h-8z" fill="currentColor" fill-opacity=".25" stroke="none"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  gift: '<path d="M4 11h16v9.5H4zM3 7.5h18V11H3zM12 7.5v13M12 7.5C10.5 4 7 3.5 7 5.8 7 7.5 12 7.5 12 7.5zM12 7.5c1.5-3.5 5-4 5-1.7 0 1.7-5 1.7-5 1.7z"/>',
  setup: '<path d="M4 19v-4.5a6 6 0 0 1 6-6h9.5M15.5 4.5l4 4-4 4"/>',
  bulb: '<path d="M9 18h6M10 21h4M8.5 14.5C7 13.3 6 11.5 6 9.5a6 6 0 0 1 12 0c0 2-1 3.8-2.5 5-.8.7-1 1.4-1 2.5h-5c0-1.1-.2-1.8-1-2.5z"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 4M12 17v.3"/>',
  undo: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-2"/>',
  flip: '<path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  puzzle: '<path d="M9 4.5h3.2a1.8 1.8 0 1 1 3.6 0H19v4.2a1.8 1.8 0 1 1 0 3.6V19.5h-4.2a1.8 1.8 0 1 0-3.6 0H7v-4a1.8 1.8 0 1 0 0-3.6V4.5z"/>',
  book: '<path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eraser: '<path d="M8.5 19.5h11M4.5 15l9-9a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L12 18.5H8z"/><path d="M8.5 11l5.5 5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>',
};

/** An icon as an SVG string. */
export function icon(name: string, size = 20): string {
  const path = PATHS[name] ?? "";
  return `<svg class="ico-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Fill every [data-ico] element (once) with its icon. */
export function drawIcons(root: ParentNode = document) {
  for (const element of root.querySelectorAll<HTMLElement>("[data-ico]")) {
    if (element.dataset.icoDrawn) continue;
    element.insertAdjacentHTML("afterbegin", icon(element.dataset.ico!, Number(element.dataset.icoSize) || 20));
    element.dataset.icoDrawn = "1";
  }
}
