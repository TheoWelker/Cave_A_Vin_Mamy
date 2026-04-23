"use strict";

const STORAGE_KEY = "caveMamyBottlesV1";
const YEAR_MIN = 1900;
const YEAR_MAX = new Date().getFullYear() + 1;
const ALLOWED_SIZES = new Set(["grande", "demi"]);

const state = {
  bottles: [],
  searchText: "",
  sortMode: "recent",
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  mapRefs();
  restoreBottles();
  bindEvents();
  render();
  registerServiceWorker();
});

function mapRefs() {
  refs.form = document.getElementById("addBottleForm");
  refs.nameInput = document.getElementById("wineName");
  refs.yearInput = document.getElementById("wineYear");
  refs.sizeInput = document.getElementById("wineSize");
  refs.quantityInput = document.getElementById("wineQuantity");
  refs.searchInput = document.getElementById("searchInput");
  refs.sortSelect = document.getElementById("sortSelect");
  refs.bottleList = document.getElementById("bottleList");
  refs.totalCount = document.getElementById("totalCount");
  refs.emptyState = document.getElementById("emptyState");

  refs.yearInput.max = String(YEAR_MAX);
}

function bindEvents() {
  refs.form.addEventListener("submit", onAddBottle);
  refs.searchInput.addEventListener("input", (event) => {
    state.searchText = event.target.value.trim().toLowerCase();
    render();
  });
  refs.sortSelect.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    render();
  });
}

function onAddBottle(event) {
  event.preventDefault();

  const name = refs.nameInput.value.trim();
  const year = Number.parseInt(refs.yearInput.value, 10);
  const size = refs.sizeInput.value;
  const quantity = Number.parseInt(refs.quantityInput.value, 10);

  if (!name) {
    alert("Veuillez entrer le nom du vin.");
    refs.nameInput.focus();
    return;
  }

  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
    alert(`Veuillez entrer une annee valide (${YEAR_MIN} a ${YEAR_MAX}).`);
    refs.yearInput.focus();
    return;
  }

  if (!ALLOWED_SIZES.has(size)) {
    alert("Veuillez choisir un format valide.");
    refs.sizeInput.focus();
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    alert("Veuillez entrer une quantite valide (1 a 99).");
    refs.quantityInput.focus();
    return;
  }

  const existingBottle = findBottleByType(name, year, size);
  if (existingBottle) {
    existingBottle.quantity += quantity;
    // Met a jour la date pour garder le tri "ajout recent" logique.
    existingBottle.addedAt = new Date().toISOString();
  } else {
    const bottle = {
      // L'id unique aide pour suppression sans ambiguite.
      id: createId(),
      name,
      year,
      size,
      quantity,
      // La date d'ajout est automatique, au format ISO pour un tri fiable.
      addedAt: new Date().toISOString(),
    };
    state.bottles.unshift(bottle);
  }

  persistBottles();

  refs.form.reset();
  refs.quantityInput.value = "1";
  refs.nameInput.focus();
  render();
}

function onDeleteBottle(id) {
  const bottle = state.bottles.find((item) => item.id === id);
  if (!bottle) return;

  const confirmDelete = window.confirm(`Retirer 1 bouteille de "${bottle.name}" ?`);
  if (!confirmDelete) return;

  if (bottle.quantity > 1) {
    bottle.quantity -= 1;
  } else {
    state.bottles = state.bottles.filter((item) => item.id !== id);
  }

  persistBottles();
  render();
}

function normalizeBottle(item) {
  if (!item || typeof item !== "object") return null;

  const name = String(item.name ?? "").trim();
  const year = Number.parseInt(item.year, 10);
  const addedAt = parseDate(item.addedAt);

  if (!name || !Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX || !addedAt) {
    return null;
  }

  return {
    id: typeof item.id === "string" && item.id ? item.id : createId(),
    name,
    year,
    size: normalizeSize(item.size),
    quantity: normalizeQuantity(item.quantity),
    addedAt: addedAt.toISOString(),
  };
}

function normalizeSize(value) {
  if (typeof value === "string" && ALLOWED_SIZES.has(value)) return value;
  return "grande";
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity < 1) return 1;
  return quantity;
}

function findBottleByType(name, year, size) {
  const normalizedName = name.trim().toLowerCase();
  return state.bottles.find(
    (item) =>
      item.year === year &&
      item.size === size &&
      item.name.trim().toLowerCase() === normalizedName
  );
}

function parseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function render() {
  const filtered = getFilteredAndSortedBottles();
  refs.bottleList.innerHTML = "";

  refs.totalCount.textContent = formatCount(getTotalBottleUnits());
  refs.emptyState.hidden = filtered.length > 0;

  for (const bottle of filtered) {
    const li = document.createElement("li");
    li.className = "bottle-item";

    const name = document.createElement("p");
    name.className = "bottle-name";
    name.textContent = bottle.name;

    const meta = document.createElement("p");
    meta.className = "bottle-meta";
    meta.textContent = `Annee: ${bottle.year} | Format: ${formatSize(bottle.size)} | Quantite: ${bottle.quantity} | Ajoutee le ${formatDate(bottle.addedAt)}`;

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const removeButton = document.createElement("button");
    removeButton.className = "btn btn-delete";
    removeButton.type = "button";
    removeButton.textContent = "Bouteille bue";
    removeButton.addEventListener("click", () => onDeleteBottle(bottle.id));

    actions.appendChild(removeButton);
    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(actions);
    refs.bottleList.appendChild(li);
  }
}

function getFilteredAndSortedBottles() {
  // Filtre simple par nom, puis tri choisi par l'utilisateur.
  const list = state.bottles.filter((item) =>
    item.name.toLowerCase().includes(state.searchText)
  );

  const sorted = [...list];
  switch (state.sortMode) {
    case "yearDesc":
      sorted.sort((a, b) => b.year - a.year || b.addedAt.localeCompare(a.addedAt));
      break;
    case "yearAsc":
      sorted.sort((a, b) => a.year - b.year || b.addedAt.localeCompare(a.addedAt));
      break;
    case "nameAsc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
      break;
    case "recent":
    default:
      sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      break;
  }
  return sorted;
}

function formatDate(isoDateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDateString));
}

function formatCount(total) {
  return total > 1 ? `${total} bouteilles` : `${total} bouteille`;
}

function getTotalBottleUnits() {
  return state.bottles.reduce((total, item) => total + normalizeQuantity(item.quantity), 0);
}

function formatSize(size) {
  return size === "demi" ? "Demi (37,5 cl)" : "Grande (75 cl)";
}

function persistBottles() {
  // Sauvegarde locale, sans serveur.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bottles));
}

function restoreBottles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.bottles = [];
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      state.bottles = [];
      return;
    }

    state.bottles = mergeBottlesByType(parsed.map(normalizeBottle).filter(Boolean));
  } catch (error) {
    console.error("Chargement localStorage impossible:", error);
    state.bottles = [];
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Active le mode hors-ligne en cache local (PWA).
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker non enregistre:", error);
    });
  });
}

function mergeBottlesByType(list) {
  const map = new Map();

  for (const bottle of list) {
    const key = makeBottleKey(bottle.name, bottle.year, bottle.size);
    const current = map.get(key);

    if (!current) {
      map.set(key, { ...bottle });
      continue;
    }

    current.quantity += normalizeQuantity(bottle.quantity);
    if (bottle.addedAt > current.addedAt) {
      current.addedAt = bottle.addedAt;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

function makeBottleKey(name, year, size) {
  return `${name.trim().toLowerCase()}|${year}|${size}`;
}
