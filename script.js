"use strict";

const STORAGE_KEY = "caveMamyBottlesV1";
const YEAR_MIN = 1900;
const YEAR_MAX = new Date().getFullYear() + 1;
const ALLOWED_SIZES = new Set(["grande", "50cl", "demi"]);
const ALLOWED_COLORS = new Set(["rouge", "blanc", "alcool_fort"]);

const state = {
  bottles: [],
  sortMode: "recent",
  editingBottleId: null,
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
  refs.formTitle = document.getElementById("formTitle");
  refs.submitButton = document.getElementById("submitButton");
  refs.cancelEditButton = document.getElementById("cancelEditButton");

  refs.nameLabel = document.getElementById("wineNameLabel");
  refs.nameInput = document.getElementById("wineName");
  refs.yearGroup = document.getElementById("wineYearGroup");
  refs.yearInput = document.getElementById("wineYear");
  refs.colorInput = document.getElementById("wineColor");
  refs.sizeInput = document.getElementById("wineSize");
  refs.quantityInput = document.getElementById("wineQuantity");

  refs.sortSelect = document.getElementById("sortSelect");
  refs.bottleList = document.getElementById("bottleList");
  refs.totalCount = document.getElementById("totalCount");
  refs.emptyState = document.getElementById("emptyState");

  refs.yearInput.max = String(YEAR_MAX);
}

function bindEvents() {
  refs.form.addEventListener("submit", onSubmitForm);
  refs.cancelEditButton.addEventListener("click", resetFormMode);
  refs.colorInput.addEventListener("change", updateDynamicFields);

  refs.sortSelect.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    render();
  });

  updateDynamicFields();
}

function onSubmitForm(event) {
  event.preventDefault();

  const values = readAndValidateForm();
  if (!values) return;

  if (state.editingBottleId) {
    saveBottleEdit(values);
  } else {
    addBottle(values);
  }

  persistBottles();
  resetFormMode();
  render();
}

function readAndValidateForm() {
  const name = refs.nameInput.value.trim();
  const color = refs.colorInput.value;
  const year = color === "alcool_fort" ? null : Number.parseInt(refs.yearInput.value, 10);
  const size = refs.sizeInput.value;
  const quantity = Number.parseInt(refs.quantityInput.value, 10);

  if (!name) {
    alert(
      color === "alcool_fort"
        ? "Veuillez entrer le nom de l'alcool."
        : "Veuillez entrer le nom du vin."
    );
    refs.nameInput.focus();
    return null;
  }

  if (!ALLOWED_COLORS.has(color)) {
    alert("Veuillez choisir un type valide.");
    refs.colorInput.focus();
    return null;
  }

  if (
    color !== "alcool_fort" &&
    (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX)
  ) {
    alert(`Veuillez entrer une année valide (${YEAR_MIN} à ${YEAR_MAX}).`);
    refs.yearInput.focus();
    return null;
  }

  if (!ALLOWED_SIZES.has(size)) {
    alert("Veuillez choisir un format valide.");
    refs.sizeInput.focus();
    return null;
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    alert("Veuillez entrer une quantité valide (1 à 99).");
    refs.quantityInput.focus();
    return null;
  }

  return { name, year, color, size, quantity };
}

function addBottle({ name, year, color, size, quantity }) {
  const existingBottle = findBottleByType(name, year, color, size);
  if (existingBottle) {
    existingBottle.quantity += quantity;
    existingBottle.addedAt = new Date().toISOString();
    return;
  }

  state.bottles.unshift({
    id: createId(),
    name,
    year,
    color,
    size,
    quantity,
    addedAt: new Date().toISOString(),
  });
}

function saveBottleEdit({ name, year, color, size, quantity }) {
  const index = state.bottles.findIndex((item) => item.id === state.editingBottleId);
  if (index < 0) {
    state.editingBottleId = null;
    return;
  }

  const current = state.bottles[index];
  state.bottles[index] = {
    ...current,
    name,
    year,
    color,
    size,
    quantity,
  };

  state.bottles = mergeBottlesByType(state.bottles);
}

function onEditBottle(id) {
  const bottle = state.bottles.find((item) => item.id === id);
  if (!bottle) return;

  state.editingBottleId = id;
  refs.formTitle.textContent = "Modifier une entrée";
  refs.submitButton.textContent = "Enregistrer";
  refs.cancelEditButton.hidden = false;

  refs.nameInput.value = bottle.name;
  refs.colorInput.value = bottle.color;
  refs.sizeInput.value = bottle.size;
  refs.quantityInput.value = String(bottle.quantity);
  refs.yearInput.value = Number.isInteger(bottle.year) ? String(bottle.year) : "";

  updateDynamicFields();
  refs.nameInput.focus();
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
    if (state.editingBottleId === id) {
      resetFormMode();
    }
  }

  persistBottles();
  render();
}

function resetFormMode() {
  state.editingBottleId = null;
  refs.formTitle.textContent = "Ajouter une bouteille";
  refs.submitButton.textContent = "Ajouter";
  refs.cancelEditButton.hidden = true;

  refs.form.reset();
  refs.quantityInput.value = "1";
  updateDynamicFields();
  refs.nameInput.focus();
}

function updateDynamicFields() {
  const isSpirit = refs.colorInput.value === "alcool_fort";

  refs.yearGroup.hidden = isSpirit;
  refs.yearInput.required = !isSpirit;
  if (isSpirit) refs.yearInput.value = "";

  if (isSpirit) {
    refs.nameLabel.textContent = "Nom de l'alcool";
    refs.nameInput.placeholder = "Ex: Cognac";
  } else {
    refs.nameLabel.textContent = "Nom du vin";
    refs.nameInput.placeholder = "Ex: Bordeaux rouge";
  }
}

function normalizeBottle(item) {
  if (!item || typeof item !== "object") return null;

  const name = String(item.name ?? "").trim();
  const color = normalizeColor(item.color);
  const year = color === "alcool_fort" ? null : Number.parseInt(item.year, 10);
  const addedAt = parseDate(item.addedAt);

  const hasValidYear =
    color === "alcool_fort" ||
    (Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX);

  if (!name || !hasValidYear || !addedAt) {
    return null;
  }

  return {
    id: typeof item.id === "string" && item.id ? item.id : createId(),
    name,
    year,
    color,
    size: normalizeSize(item.size),
    quantity: normalizeQuantity(item.quantity),
    addedAt: addedAt.toISOString(),
  };
}

function normalizeColor(value) {
  if (typeof value === "string" && ALLOWED_COLORS.has(value)) return value;
  return "rouge";
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

function parseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function findBottleByType(name, year, color, size) {
  const normalizedName = name.trim().toLowerCase();
  return state.bottles.find(
    (item) =>
      item.year === year &&
      item.color === color &&
      item.size === size &&
      item.name.trim().toLowerCase() === normalizedName
  );
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
    if (bottle.color === "alcool_fort") {
      meta.textContent = `Type: ${formatColor(bottle.color)} | Format: ${formatSize(bottle.size)} | Quantité: ${bottle.quantity} | Ajoutée le ${formatDate(bottle.addedAt)}`;
    } else {
      meta.textContent = `Année: ${bottle.year} | Type: ${formatColor(bottle.color)} | Format: ${formatSize(bottle.size)} | Quantité: ${bottle.quantity} | Ajoutée le ${formatDate(bottle.addedAt)}`;
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editButton = document.createElement("button");
    editButton.className = "btn btn-edit";
    editButton.type = "button";
    editButton.innerHTML = '<span aria-hidden="true">✎</span> Modifier';
    editButton.addEventListener("click", () => onEditBottle(bottle.id));

    const removeButton = document.createElement("button");
    removeButton.className = "btn btn-delete";
    removeButton.type = "button";
    removeButton.textContent = "Bouteille bue";
    removeButton.addEventListener("click", () => onDeleteBottle(bottle.id));

    actions.appendChild(editButton);
    actions.appendChild(removeButton);

    li.appendChild(name);
    li.appendChild(meta);
    li.appendChild(actions);
    refs.bottleList.appendChild(li);
  }
}

function getFilteredAndSortedBottles() {
  const sorted = [...state.bottles];
  switch (state.sortMode) {
    case "yearDesc":
      sorted.sort((a, b) => compareYearsDesc(a.year, b.year) || b.addedAt.localeCompare(a.addedAt));
      break;
    case "yearAsc":
      sorted.sort((a, b) => compareYearsAsc(a.year, b.year) || b.addedAt.localeCompare(a.addedAt));
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

function compareYearsAsc(a, b) {
  const firstIsYear = Number.isInteger(a);
  const secondIsYear = Number.isInteger(b);

  if (!firstIsYear && !secondIsYear) return 0;
  if (!firstIsYear) return 1;
  if (!secondIsYear) return -1;

  return a - b;
}

function compareYearsDesc(a, b) {
  const firstIsYear = Number.isInteger(a);
  const secondIsYear = Number.isInteger(b);

  if (!firstIsYear && !secondIsYear) return 0;
  if (!firstIsYear) return 1;
  if (!secondIsYear) return -1;

  return b - a;
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
  if (size === "50cl") return "Bouteille 50 cl";
  return size === "demi" ? "Demi (37,5 cl)" : "Grande (75 cl)";
}

function formatColor(color) {
  if (color === "blanc") return "Blanc";
  if (color === "alcool_fort") return "Alcool fort";
  return "Rouge";
}

function persistBottles() {
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

function mergeBottlesByType(list) {
  const map = new Map();

  for (const bottle of list) {
    const key = makeBottleKey(bottle.name, bottle.year, bottle.color, bottle.size);
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

function makeBottleKey(name, year, color, size) {
  const yearKey = year === null ? "sans_annee" : String(year);
  return `${name.trim().toLowerCase()}|${yearKey}|${color}|${size}`;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker non enregistré:", error);
    });
  });
}
