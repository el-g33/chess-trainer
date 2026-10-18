// Themed dropdowns: each <select> gets a button showing its choice and a list
// drawn in the theme's colours, instead of the browser's own popup (which
// flashes white before it opens on some systems). The <select> stays in the
// page, hidden, so the rest of the app reads and sets it as before; call
// syncDropdowns() after changing a select's value or options in code.

interface Dropdown {
  select: HTMLSelectElement;
  button: HTMLButtonElement;
}

const dropdowns: Dropdown[] = [];
let openList: { list: HTMLElement; owner: Dropdown } | null = null;

const ARROW = '<svg class="dd-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/** Turn every <select> under `root` (not yet done) into a themed dropdown. */
export function enhanceSelects(root: ParentNode = document) {
  for (const select of root.querySelectorAll<HTMLSelectElement>("select")) {
    if (select.dataset.themed) continue;
    select.dataset.themed = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dd-button";
    button.setAttribute("aria-haspopup", "listbox");
    if (select.id) {
      const label = document.querySelector(`label[for="${select.id}"]`);
      if (label) label.setAttribute("for", "");
      button.id = `${select.id}-button`;
      if (label) label.addEventListener("click", () => button.click());
    }
    if (select.getAttribute("aria-label")) button.setAttribute("aria-label", select.getAttribute("aria-label")!);
    select.classList.add("dd-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.after(button);
    const dropdown = { select, button };
    dropdowns.push(dropdown);
    button.addEventListener("click", () => (openList?.owner === dropdown ? closeList() : openDropdown(dropdown)));
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!openList) openDropdown(dropdown);
      }
    });
    select.addEventListener("change", () => syncOne(dropdown));
    syncOne(dropdown);
  }
}

function syncOne({ select, button }: Dropdown) {
  const chosen = select.selectedOptions[0];
  button.innerHTML = `<span class="dd-label"></span>${ARROW}`;
  button.querySelector(".dd-label")!.textContent = chosen ? chosen.text : "";
  button.disabled = select.disabled;
}

/** Show each dropdown's current choice (after code changed a select). */
export function syncDropdowns() {
  for (const dropdown of dropdowns) syncOne(dropdown);
}

function closeList() {
  if (!openList) return;
  openList.list.remove();
  openList.owner.button.setAttribute("aria-expanded", "false");
  openList = null;
}

function openDropdown(dropdown: Dropdown) {
  closeList();
  const { select, button } = dropdown;
  const list = document.createElement("div");
  list.className = "dd-list";
  list.setAttribute("role", "listbox");
  const options: HTMLButtonElement[] = [];
  const add = (option: HTMLOptionElement) => {
    if (option.hidden) return;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "dd-option";
    item.setAttribute("role", "option");
    item.textContent = option.text;
    item.disabled = option.disabled;
    const selected = option.selected;
    item.setAttribute("aria-selected", String(selected));
    if (selected) item.classList.add("on");
    item.addEventListener("click", () => {
      select.value = option.value;
      closeList();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncOne(dropdown);
      button.focus();
    });
    options.push(item);
    list.append(item);
  };
  for (const child of select.children) {
    if (child instanceof HTMLOptGroupElement) {
      const visible = [...child.children].some((o) => !(o as HTMLOptionElement).hidden);
      if (!visible) continue;
      const head = document.createElement("div");
      head.className = "dd-group";
      head.textContent = child.label;
      list.append(head);
      for (const option of child.children) add(option as HTMLOptionElement);
    } else if (child instanceof HTMLOptionElement) {
      add(child);
    }
  }
  // Inside a dialog the list must live in the dialog (the top layer)
  (button.closest("dialog") ?? document.body).append(list);
  const rect = button.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const height = Math.min(320, Math.max(below, above));
  list.style.minWidth = `${rect.width}px`;
  list.style.maxHeight = `${height}px`;
  list.style.left = `${Math.min(rect.left, window.innerWidth - Math.max(rect.width, 200) - 8)}px`;
  if (below >= Math.min(220, above) || below >= list.scrollHeight) list.style.top = `${rect.bottom + 4}px`;
  else list.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  button.setAttribute("aria-expanded", "true");
  openList = { list, owner: dropdown };
  const current = options.find((o) => o.classList.contains("on")) ?? options[0];
  current?.scrollIntoView({ block: "nearest" });
  current?.focus();
  list.addEventListener("keydown", (event) => {
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") options[Math.min(options.length - 1, index + 1)]?.focus();
    else if (event.key === "ArrowUp") options[Math.max(0, index - 1)]?.focus();
    else if (event.key === "Escape" || event.key === "Tab") {
      closeList();
      button.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });
}

// Clicking anywhere else, scrolling the page or resizing closes the list
document.addEventListener("pointerdown", (event) => {
  if (openList && !openList.list.contains(event.target as Node) && event.target !== openList.owner.button &&
      !openList.owner.button.contains(event.target as Node)) closeList();
}, true);
window.addEventListener("resize", closeList);
