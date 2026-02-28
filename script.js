// script.js
const STORAGE_KEY = "kanban_board_v1";

/** @typedef {{ id: string, title: string }} Card */
/** @typedef {{ id: string, title: string, cardIds: string[] }} Column */
/** @typedef {{ columns: Column[], cards: Record<string, Card> }} BoardState */

const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

// Theme toggle (Lights Off / On)
const THEME_KEY = "kanban_theme_lights_on";

function applyTheme(isLightsOn) {
  document.body.classList.toggle("lights-on", isLightsOn);

  const btn = document.getElementById("themeToggle");
  const modeText = document.getElementById("modeText");

  if (btn) {
    btn.textContent = isLightsOn ? "Turn Lights Off" : "Turn Lights On";
    btn.setAttribute("aria-pressed", String(isLightsOn));
  }
  if (modeText) {
    modeText.textContent = isLightsOn ? "Lights On" : "Lights Off";
  }

  try {
    localStorage.setItem(THEME_KEY, isLightsOn ? "1" : "0");
  } catch {}
}

function initThemeToggle() {
  let isLightsOn = false;
  try {
    isLightsOn = localStorage.getItem(THEME_KEY) === "1";
  } catch {}

  applyTheme(isLightsOn);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      isLightsOn = !document.body.classList.contains("lights-on");
      applyTheme(isLightsOn);
    });
  }
}

initThemeToggle();

/** @returns {BoardState} */
function defaultState() {
  return {
    columns: [
      { id: "todo", title: "To do", cardIds: ["c1", "c2"] },
      { id: "doing", title: "Doing", cardIds: ["c3"] },
      { id: "done", title: "Done", cardIds: [] },
    ],
    cards: {
      c1: { id: "c1", title: "Set up project" },
      c2: { id: "c2", title: "Design data model" },
      c3: { id: "c3", title: "Build drag & drop" },
    },
  };
}

/** @returns {BoardState} */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    // light validation
    if (!parsed || !Array.isArray(parsed.columns) || typeof parsed.cards !== "object") {
      return defaultState();
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

/** @param {BoardState} state */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

let state = loadState();

// Drag state
let dragCardId = null;

const boardEl = document.getElementById("board");
const ghostEl = document.getElementById("drag-ghost");

if (!boardEl) throw new Error("Missing #board element in index.html");
if (!ghostEl) throw new Error("Missing #drag-ghost element in index.html");

function findColumnByCard(cardId) {
  return state.columns.find((c) => c.cardIds.includes(cardId)) || null;
}

function removeCardEverywhere(cardId) {
  state.columns = state.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  }));
}

function deleteCard(cardId) {
  const nextCards = { ...state.cards };
  delete nextCards[cardId];
  state.cards = nextCards;
  removeCardEverywhere(cardId);
  saveState(state);
  render();
}

function addCard(columnId, title) {
  const id = uid("card");
  state.cards[id] = { id, title };
  state.columns = state.columns.map((c) =>
    c.id === columnId ? { ...c, cardIds: [id, ...c.cardIds] } : c
  );
  saveState(state);
  render();
}

/**
 * Move card to a column and optionally insert before a card id.
 * @param {string} cardId
 * @param {string} toColId
 * @param {string|null} beforeCardId
 */
function moveCard(cardId, toColId, beforeCardId) {
  const toCol = state.columns.find((c) => c.id === toColId);
  if (!toCol) return;

  // Remove from all columns (ensures no duplicates)
  state.columns = state.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  }));

  // Insert into destination column
  state.columns = state.columns.map((c) => {
    if (c.id !== toColId) return c;

    const next = [...c.cardIds];

    if (beforeCardId && next.includes(beforeCardId)) {
      next.splice(next.indexOf(beforeCardId), 0, cardId);
    } else {
      next.push(cardId);
    }

    return { ...c, cardIds: next };
  });

  saveState(state);
  render();
}

function setGhost(text, x, y) {
  ghostEl.textContent = text || "";
  ghostEl.style.top = `${y + 10}px`;
  ghostEl.style.left = `${x + 10}px`;
}

function hideGhost() {
  ghostEl.style.top = "-9999px";
  ghostEl.style.left = "-9999px";
  ghostEl.textContent = "";
}

function render() {
  boardEl.innerHTML = "";

  for (const col of state.columns) {
    const colEl = document.createElement("section");
    colEl.className = "column";
    colEl.dataset.columnId = col.id;

    // Header
    const head = document.createElement("div");
    head.className = "col-head";

    const title = document.createElement("div");
    title.className = "col-title";
    title.textContent = col.title;

    const count = document.createElement("div");
    count.className = "col-count";
    count.textContent = String(col.cardIds.length);

    head.append(title, count);

    // Add card UI
    const addRow = document.createElement("div");
    addRow.className = "add-row";

    const input = document.createElement("input");
    input.placeholder = "Add a card…";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Add";

    const commit = () => {
      const t = input.value.trim();
      if (!t) return;
      addCard(col.id, t);
      input.value = "";
      input.focus();
    };

    btn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
    });

    addRow.append(input, btn);

    // Cards container
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "cards";
    cardsWrap.dataset.columnId = col.id;

    // Column drop (empty space -> append)
    cardsWrap.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    cardsWrap.addEventListener("drop", (e) => {
      e.preventDefault();
      const toColId = cardsWrap.dataset.columnId;
      if (!dragCardId || !toColId) return;
      moveCard(dragCardId, toColId, null);
    });

    // Build cards
    for (const cardId of col.cardIds) {
      const card = state.cards[cardId];
      if (!card) continue;

      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.draggable = true;
      cardEl.dataset.cardId = card.id;

      // Drop on card -> insert before
      cardEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        cardEl.style.outline = "2px dashed var(--border)";
        cardEl.style.outlineOffset = "2px";
      });

      cardEl.addEventListener("dragleave", () => {
        cardEl.style.outline = "";
        cardEl.style.outlineOffset = "";
      });

      cardEl.addEventListener("drop", (e) => {
        e.preventDefault();
        cardEl.style.outline = "";
        cardEl.style.outlineOffset = "";
        const toColId = cardEl.closest(".cards")?.dataset.columnId;
        const beforeId = cardEl.dataset.cardId;
        if (!dragCardId || !toColId || !beforeId) return;
        moveCard(dragCardId, toColId, beforeId);
      });

      cardEl.addEventListener("dragstart", (e) => {
        dragCardId = card.id;
        cardEl.classList.add("dragging");

        setGhost(card.title, e.clientX, e.clientY);

        // Hide default drag image
        const img = new Image();
        img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
        e.dataTransfer.setDragImage(img, 0, 0);
      });

      cardEl.addEventListener("dragend", () => {
        dragCardId = null;
        cardEl.classList.remove("dragging");
        hideGhost();
      });

      const text = document.createElement("div");
      text.className = "card-title";
      text.textContent = card.title;

      const x = document.createElement("button");
      x.className = "card-x";
      x.textContent = "✕";
      x.title = "Delete";
      x.setAttribute("aria-label", "Delete card");
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteCard(card.id);
      });

      cardEl.append(text, x);
      cardsWrap.append(cardEl);
    }

    colEl.append(head, addRow, cardsWrap);
    boardEl.append(colEl);
  }
}

// Track cursor for ghost
window.addEventListener("dragover", (e) => {
  if (!dragCardId) return;
  setGhost(ghostEl.textContent, e.clientX, e.clientY);
});

// Initial render
render();
