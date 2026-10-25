import { BASE_FOODS } from './foods-de.js';
import { fetchByBarcode, searchProducts } from './off.js';
import { startScanner, scanImageFile } from './scanner.js';
import {
  state, save, replaceState, uid, isoDate, NUTRIENTS, scale, sumEntries, recipeNutrition, recipeAsFood,
  calcGoals, rememberFood, toggleFavorite, entryFromFood,
} from './store.js';

// ---------- Hilfsfunktionen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt1 = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const NUTRI_LABELS = { kcal: 'Kalorien', protein: 'Eiweiß', carbs: 'Kohlenhydrate', sugar: 'davon Zucker', fat: 'Fett', satFat: 'davon gesättigt', fiber: 'Ballaststoffe', salt: 'Salz' };
const CATEGORY_EMOJI = {
  Obst: '🍎', Gemüse: '🥦', Hülsenfrüchte: '🫘', 'Nüsse & Samen': '🥜', Getreide: '🌾', 'Brot & Backwaren': '🍞',
  Milchprodukte: '🥛', Eier: '🥚', Fleisch: '🍗', Wurst: '🌭', Fisch: '🐟', 'Fette & Öle': '🫒', Saucen: '🥫',
  Süßes: '🍫', Aufstriche: '🥣', Snacks: '🥨', Fertiggerichte: '🍕', Getränke: '🥤',
};
const foodEmoji = (f) => f.emoji || CATEGORY_EMOJI[f.category] || (f.source === 'custom' ? '⭐' : '🍴');
const makeEntry = (food, grams, meal) => ({ ...entryFromFood(food, grams, meal), emoji: foodEmoji(food) });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Klick-Delegation: Elemente mit data-act="name" rufen handlers.name(el, event) auf. */
function bind(root, handlers, events = ['click']) {
  for (const type of events) {
    root.addEventListener(type, (ev) => {
      const el = ev.target.closest(`[data-${type === 'click' ? 'act' : 'on' + type}]`);
      if (!el || !root.contains(el)) return;
      const name = el.dataset[type === 'click' ? 'act' : 'on' + type];
      if (handlers[name]) handlers[name](el, ev);
    });
  }
}

const thumb = (f, cls = 'thumb') =>
  f.image ? `<img class="${cls}" src="${esc(f.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls} emoji">${foodEmoji(f)}</span>`;

// ---------- Datenzugriff ----------
const allFoods = () => [...Object.values(state.foods), ...BASE_FOODS];
const recipeFoods = () => state.recipes.map(recipeAsFood);
function findFood(id) {
  if (id?.startsWith('recipe-')) {
    const r = state.recipes.find((x) => 'recipe-' + x.id === id);
    return r ? recipeAsFood(r) : null;
  }
  return state.foods[id] || BASE_FOODS.find((f) => f.id === id) || null;
}
const dayEntries = (date) => (state.diary[date] ||= []);
const mealName = (id) => state.meals.find((m) => m.id === id)?.name || 'Mahlzeit';

function searchLocal(q, { includeRecipes = true } = {}) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const pool = [...(includeRecipes ? recipeFoods() : []), ...allFoods()];
  return pool
    .map((f) => {
      const hay = norm(f.name + ' ' + (f.brand || '') + ' ' + (f.category || ''));
      if (!tokens.every((t) => hay.includes(t))) return null;
      const n = norm(f.name);
      let score = 0;
      if (n.startsWith(tokens[0])) score += 10;
      if (n === tokens.join(' ')) score += 20;
      if (state.favorites.includes(f.id)) score += 6;
      if (state.recents.includes(f.id)) score += 4;
      if (f.source !== 'base') score += 2;
      return { f, score: score - n.length / 50 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}

// ---------- App-Zustand ----------
let currentTab = 'diary';
let currentDate = isoDate();
let recipesSegment = 'recipes';
let foodsSegment = 'favorites';

function render() {
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
  const view = $('#view');
  const views = { diary: renderDiary, recipes: renderRecipes, foods: renderFoods, profile: renderProfile };
  view.innerHTML = views[currentTab]();
}

// ---------- Tagebuch ----------
function dateLabel(d) {
  const today = isoDate();
  const y = isoDate(new Date(Date.now() - 864e5));
  const t = isoDate(new Date(Date.now() + 864e5));
  if (d === today) return 'Heute';
  if (d === y) return 'Gestern';
  if (d === t) return 'Morgen';
  return new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}
const shiftDate = (d, days) => isoDate(new Date(new Date(d + 'T12:00').getTime() + days * 864e5));

function ring(eaten, goal) {
  const r = 54, c = 2 * Math.PI * r;
  const pct = goal ? Math.min(1, eaten / goal) : 0;
  const over = eaten > goal;
  const remaining = Math.round(goal - eaten);
  return `
    <svg class="ring ${over ? 'over' : ''}" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r="${r}" class="ring-bg"/>
      <circle cx="64" cy="64" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
    </svg>
    <div class="ring-label"><strong>${fmt(Math.abs(remaining))}</strong><span>${over ? 'kcal zu viel' : 'kcal übrig'}</span></div>`;
}

function macroBar(label, val, goal, cls) {
  const pct = goal ? Math.min(100, (val / goal) * 100) : 0;
  return `<div class="macro ${cls}">
    <div class="macro-head"><span>${label}</span><span>${fmt(val)} / ${fmt(goal)} g</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div></div>`;
}

function entryLabel(e) {
  const s = e.servingIdx >= 0 ? e.servings?.[e.servingIdx] : null;
  const amount = `${fmt1(e.grams)} ${e.unit || 'g'}`;
  return s ? `${fmt1(e.qty)} × ${esc(s.name)} · ${amount}` : amount;
}

function renderDiary() {
  const goals = calcGoals();
  const entries = dayEntries(currentDate);
  const t = sumEntries(entries);
  const water = state.water[currentDate] || 0;
  const glasses = Math.max(8, Math.ceil(goals.water / 250));
  const filled = Math.round(water / 250);

  const meals = state.meals.map((m) => {
    const es = entries.filter((e) => e.meal === m.id);
    const mt = sumEntries(es);
    return `<section class="card meal" data-meal="${m.id}">
      <header class="meal-head">
        <span class="meal-icon">${esc(m.icon || '🍴')}</span>
        <div class="meal-title"><h3>${esc(m.name)}</h3>
          <small>${es.length ? `${fmt(mt.kcal)} kcal · KH ${fmt(mt.carbs)} g · E ${fmt(mt.protein)} g · F ${fmt(mt.fat)} g` : 'Noch nichts eingetragen'}</small></div>
        <button class="icon-btn ghost" data-act="mealMenu" data-meal="${m.id}" aria-label="Optionen">⋯</button>
        <button class="icon-btn add" data-act="addToMeal" data-meal="${m.id}" aria-label="${esc(m.name)} hinzufügen">＋</button>
      </header>
      ${es.length ? `<ul class="list">${es.map((e) => `
        <li class="row" data-act="editEntry" data-id="${e.id}">
          ${thumb(e)}
          <div class="row-main"><b>${esc(e.name)}</b><small>${e.brand ? esc(e.brand) + ' · ' : ''}${entryLabel(e)}</small></div>
          <span class="kcal">${fmt(scale(e.per100, e.grams).kcal)}</span>
        </li>`).join('')}</ul>` : ''}
    </section>`;
  }).join('');

  // 7-Tage-Übersicht
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(currentDate, i - 6)).map((d) => ({ d, kcal: sumEntries(state.diary[d] || []).kcal }));
  const maxK = Math.max(goals.kcal, ...week.map((w) => w.kcal)) || 1;

  return `
    <div class="datebar">
      <button class="icon-btn" data-act="prevDay" aria-label="Vorheriger Tag">‹</button>
      <button class="date-btn" data-act="today">${dateLabel(currentDate)}</button>
      <button class="icon-btn" data-act="nextDay" aria-label="Nächster Tag">›</button>
    </div>
    <section class="card summary">
      <div class="summary-top">
        <div class="stat"><strong>${fmt(t.kcal)}</strong><span>gegessen</span></div>
        <div class="ring-wrap">${ring(t.kcal, goals.kcal)}</div>
        <div class="stat"><strong>${fmt(goals.kcal)}</strong><span>Ziel</span></div>
      </div>
      <div class="macros">
        ${macroBar('Kohlenhydrate', t.carbs, goals.carbs, 'c')}
        ${macroBar('Eiweiß', t.protein, goals.protein, 'p')}
        ${macroBar('Fett', t.fat, goals.fat, 'f')}
      </div>
    </section>
    ${meals}
    <section class="card water">
      <header class="meal-head"><span class="meal-icon">💧</span>
        <div class="meal-title"><h3>Wasser</h3><small>${fmt1(water / 1000)} von ${fmt1(goals.water / 1000)} Liter</small></div>
        <button class="icon-btn ghost" data-act="waterMinus" aria-label="Glas entfernen">−</button>
        <button class="icon-btn add" data-act="waterPlus" aria-label="Glas hinzufügen">＋</button>
      </header>
      <div class="glasses">${Array.from({ length: glasses }, (_, i) => `<span class="glass ${i < filled ? 'full' : ''}" data-act="waterSet" data-n="${i + 1}"></span>`).join('')}</div>
    </section>
    <section class="card">
      <h3 class="card-title">Letzte 7 Tage</h3>
      <div class="week">${week.map((w) => `
        <button class="day ${w.d === currentDate ? 'sel' : ''} ${w.kcal > goals.kcal ? 'over' : ''}" data-act="gotoDay" data-d="${w.d}">
          <span class="col"><i style="height:${(w.kcal / maxK) * 100}%"></i><em style="bottom:${(goals.kcal / maxK) * 100}%"></em></span>
          <small>${new Date(w.d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' })}</small>
          <small class="num">${w.kcal ? fmt(w.kcal) : '–'}</small>
        </button>`).join('')}</div>
    </section>
    <p class="footnote">Grundumsatz ${fmt(goals.bmr)} kcal · Gesamtumsatz ${fmt(goals.tdee)} kcal</p>`;
}

const diaryHandlers = {
  prevDay() { currentDate = shiftDate(currentDate, -1); render(); },
  nextDay() { currentDate = shiftDate(currentDate, 1); render(); },
  today() { currentDate = isoDate(); render(); },
  gotoDay(el) { currentDate = el.dataset.d; render(); },
  addToMeal(el) { openSearch({ mode: 'diary', meal: el.dataset.meal }); },
  editEntry(el) {
    const e = dayEntries(currentDate).find((x) => x.id === el.dataset.id);
    if (e) openFoodDetail(foodFromEntry(e), { mode: 'edit', entry: e });
  },
  mealMenu(el) { openMealMenu(el.dataset.meal); },
  waterPlus() { state.water[currentDate] = (state.water[currentDate] || 0) + 250; save(); render(); },
  waterMinus() { state.water[currentDate] = Math.max(0, (state.water[currentDate] || 0) - 250); save(); render(); },
  waterSet(el) {
    const n = +el.dataset.n;
    const cur = Math.round((state.water[currentDate] || 0) / 250);
    state.water[currentDate] = (cur === n ? n - 1 : n) * 250;
    save(); render();
  },
};

function foodFromEntry(e) {
  const known = findFood(e.foodId);
  return { ...(known || {}), id: e.foodId, name: e.name, brand: e.brand, unit: e.unit, image: e.image, emoji: e.emoji, servings: e.servings, ...e.per100, source: known?.source || 'entry' };
}

function openMealMenu(mealId) {
  const entries = dayEntries(currentDate).filter((e) => e.meal === mealId);
  const prev = (state.diary[shiftDate(currentDate, -1)] || []).filter((e) => e.meal === mealId);
  const sheet = openSheet(`
    <h2>${esc(mealName(mealId))}</h2>
    <div class="menu">
      <button data-act="scan">📷 Barcode scannen</button>
      <button data-act="saveTemplate" ${entries.length ? '' : 'disabled'}>💾 Als Mahlzeit speichern</button>
      <button data-act="copyPrev" ${prev.length ? '' : 'disabled'}>📋 Vom Vortag übernehmen (${prev.length})</button>
      <button data-act="clear" class="danger" ${entries.length ? '' : 'disabled'}>🗑️ Alle Einträge löschen</button>
    </div>`, {
    scan() { sheet.close(); openScanner({ mode: 'diary', meal: mealId }); },
    saveTemplate() {
      const name = prompt('Name der Mahlzeit:', `${mealName(mealId)} ${dateLabel(currentDate)}`);
      if (!name) return;
      state.templates.unshift({ id: uid(), name: name.trim(), items: entries.map(({ id, meal, ...rest }) => rest) });
      save(); sheet.close(); toast('Mahlzeit gespeichert');
    },
    copyPrev() {
      dayEntries(currentDate).push(...prev.map((e) => ({ ...e, id: uid() })));
      save(); sheet.close(); render(); toast(`${prev.length} Einträge übernommen`);
    },
    clear() {
      if (!confirm('Alle Einträge dieser Mahlzeit löschen?')) return;
      state.diary[currentDate] = dayEntries(currentDate).filter((e) => e.meal !== mealId);
      save(); sheet.close(); render();
    },
  });
}

// ---------- Sheets (Dialoge) ----------
function openSheet(html, handlers = {}, { cls = '', onClose } = {}) {
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="sheet-close" data-act="close" aria-label="Schließen">✕</button><div class="sheet-body"></div></div>`;
  const body = $('.sheet-body', root);
  body.innerHTML = html;
  document.body.appendChild(root);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => root.classList.add('open'));
  const sheet = {
    el: body,
    root,
    set(h) { body.innerHTML = h; },
    close() {
      if (sheet.closed) return;
      sheet.closed = true;
      onClose?.();
      root.classList.remove('open');
      setTimeout(() => {
        root.remove();
        if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('modal-open');
      }, 200);
    },
  };
  bind(root, { close: () => sheet.close(), ...handlers });
  root.addEventListener('click', (e) => { if (e.target === root) sheet.close(); });
  return sheet;
}

// ---------- Suche ----------
/**
 * ctx.mode: 'diary' (ins Tagebuch), 'pick' (Zutat für Gericht, ctx.onPick(food, grams, extra)), 'browse' (nur ansehen)
 */
function openSearch(ctx) {
  let query = '';
  let offState = { status: 'idle', results: [], q: '' };
  let ctrl;
  let debounce;
  const title = ctx.mode === 'pick' ? 'Zutat hinzufügen' : ctx.mode === 'diary' ? `Zu „${mealName(ctx.meal)}“ hinzufügen` : 'Lebensmittel suchen';

  const sheet = openSheet(`
    <h2>${esc(title)}</h2>
    <div class="searchbar">
      <input type="search" id="q" placeholder="Lebensmittel, Marke oder Gericht…" autocomplete="off" enterkeyhint="search">
      <button class="icon-btn primary" data-act="scan" aria-label="Barcode scannen">${ICON_BARCODE}</button>
    </div>
    <div id="results" class="results"></div>`, {
    scan() { sheet.close(); openScanner(ctx); },
    pick(el) {
      const f = findResult(el.dataset.id);
      if (f) openFoodDetail(f, { ...ctx, onDone: () => sheet.close() });
    },
    quick(el, ev) {
      ev.stopPropagation();
      const f = findResult(el.dataset.id);
      if (!f) return;
      const s = f.servings?.[0];
      commitFood(f, s ? s.g : 100, { ...ctx, qty: 1, servingIdx: s ? 0 : -1 });
      el.textContent = '✓';
      el.classList.add('done');
    },
    template(el) {
      const t = state.templates.find((x) => x.id === el.dataset.id);
      addTemplate(t, ctx.meal);
      sheet.close();
    },
    searchOff() { runOff(true); },
    newCustom() { sheet.close(); openCustomFoodForm({ name: query }, ctx); },
  }, { cls: 'tall', onClose: () => ctrl?.abort() });

  const input = $('#q', sheet.el);
  const resultsEl = $('#results', sheet.el);
  const resultCache = new Map();
  const findResult = (id) => resultCache.get(id) || findFood(id);

  function row(f) {
    resultCache.set(f.id, f);
    const s = f.servings?.[0];
    const sub = [f.brand, s ? `${s.name} = ${fmt(scale(f, s.g).kcal)} kcal` : null].filter(Boolean).join(' · ');
    return `<li class="row" data-act="pick" data-id="${esc(f.id)}">
      ${thumb(f)}
      <div class="row-main"><b>${esc(f.name)}</b><small>${esc(sub)}</small></div>
      <span class="kcal">${fmt(f.kcal)}<small>kcal/100${f.unit || 'g'}</small></span>
      ${ctx.mode !== 'browse' ? `<button class="icon-btn mini" data-act="quick" data-id="${esc(f.id)}" aria-label="Schnell hinzufügen">＋</button>` : ''}
    </li>`;
  }
  const section = (title, items, extra = '') => (items.length || extra ? `<h4 class="section-title">${title}</h4><ul class="list">${items.join('')}</ul>${extra}` : '');

  function draw() {
    const q = query.trim();
    let html = '';
    if (!q) {
      const favs = state.favorites.map(findFood).filter(Boolean);
      const rec = state.recents.filter((id) => !state.favorites.includes(id)).map(findFood).filter(Boolean).slice(0, 15);
      if (ctx.mode === 'diary' && state.templates.length) {
        html += section('Meine Mahlzeiten', state.templates.map((t) => {
          const k = sumEntries(t.items).kcal;
          return `<li class="row" data-act="template" data-id="${t.id}"><span class="thumb emoji">🍱</span>
            <div class="row-main"><b>${esc(t.name)}</b><small>${t.items.length} Lebensmittel</small></div><span class="kcal">${fmt(k)}<small>kcal</small></span></li>`;
        }));
      }
      if (ctx.mode !== 'pick' && state.recipes.length) html += section('Meine Gerichte', recipeFoods().map(row));
      html += section('Favoriten', favs.filter((f) => ctx.mode !== 'pick' || f.source !== 'recipe').map(row));
      html += section('Zuletzt verwendet', rec.filter((f) => ctx.mode !== 'pick' || f.source !== 'recipe').map(row));
      if (!html) html = `<div class="empty"><div class="big">🔍</div><p>Suche in über 3 Millionen Produkten aus der Open-Food-Facts-Datenbank oder scanne einen Barcode.</p></div>`;
    } else {
      const local = searchLocal(q, { includeRecipes: ctx.mode !== 'pick' }).slice(0, 25);
      html += section('Grunddatenbank & Eigene', local.map(row));
      let offHtml = '';
      if (offState.q !== q || offState.status === 'idle') offHtml = `<button class="btn ghost wide" data-act="searchOff">In Open Food Facts suchen</button>`;
      else if (offState.status === 'loading') offHtml = `<div class="loading"><span class="spinner"></span> Suche in Open Food Facts…</div>`;
      else if (offState.status === 'error') offHtml = `<div class="notice">Keine Verbindung zu Open Food Facts. <button class="link" data-act="searchOff">Erneut versuchen</button></div>`;
      else if (!offState.results.length) offHtml = `<div class="notice">Keine Produkte gefunden.</div>`;
      const offRows = offState.q === q ? offState.results.filter((f) => !local.some((l) => l.id === f.id)).map(row) : [];
      html += `<h4 class="section-title">Open Food Facts <span class="badge">3 Mio.+ Produkte</span></h4><ul class="list">${offRows.join('')}</ul>${offHtml}`;
      html += `<button class="btn ghost wide" data-act="newCustom">＋ „${esc(q)}“ als eigenes Lebensmittel anlegen</button>`;
    }
    resultsEl.innerHTML = html;
  }

  async function runOff(force) {
    const q = query.trim();
    if (q.length < 2) return;
    if (!force && offState.q === q) return;
    ctrl?.abort();
    ctrl = new AbortController();
    offState = { status: 'loading', results: [], q };
    draw();
    try {
      const results = await searchProducts(q, { signal: ctrl.signal, germanyOnly: state.settings.germanyOnly });
      if (query.trim() !== q) return;
      offState = { status: 'done', results, q };
    } catch (e) {
      if (e.name === 'AbortError') return;
      offState = { status: 'error', results: [], q };
    }
    draw();
  }

  input.addEventListener('input', () => {
    query = input.value;
    draw();
    clearTimeout(debounce);
    debounce = setTimeout(() => runOff(false), 700);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(debounce); runOff(true); input.blur(); }
  });
  draw();
  setTimeout(() => input.focus(), 250);
}

function addTemplate(t, meal) {
  if (!t) return;
  dayEntries(currentDate).push(...t.items.map((it) => ({ ...it, id: uid(), meal })));
  save(); render(); toast(`„${t.name}“ hinzugefügt`);
}

/** Lebensmittel mit Menge übernehmen – je nach Kontext ins Tagebuch oder als Zutat. */
function commitFood(food, grams, ctx) {
  rememberFood(food);
  if (ctx.mode === 'pick') {
    ctx.onPick(food, grams, { qty: ctx.qty, servingIdx: ctx.servingIdx });
    toast('Zutat hinzugefügt');
  } else {
    const e = makeEntry(food, grams, ctx.meal || 'snacks');
    e.qty = ctx.qty;
    e.servingIdx = ctx.servingIdx;
    dayEntries(currentDate).push(e);
    toast(`${food.name} → ${mealName(e.meal)}`);
    render();
  }
  save();
}

// ---------- Lebensmittel-Detail ----------
function openFoodDetail(food, ctx) {
  const servings = food.servings || [];
  let servingIdx = ctx.entry ? (ctx.entry.servingIdx ?? -1) : ctx.servingIdx ?? (servings.length ? 0 : -1);
  let qty = ctx.entry ? (ctx.entry.qty ?? ctx.entry.grams) : ctx.grams ?? (servingIdx >= 0 ? 1 : 100);
  if (servingIdx >= servings.length) servingIdx = -1;
  let meal = ctx.entry?.meal || ctx.meal || guessMeal();
  const isEdit = ctx.mode === 'edit' || ctx.mode === 'editIngredient';
  const unit = food.unit || 'g';
  const grams = () => (servingIdx >= 0 ? qty * servings[servingIdx].g : qty);
  const fav = () => state.favorites.includes(food.id);

  const nutriRows = () => {
    const s = scale(food, grams());
    return NUTRIENTS.map((k) => `<tr class="${k === 'sugar' || k === 'satFat' ? 'sub' : ''}">
      <td>${NUTRI_LABELS[k]}</td><td>${k === 'kcal' ? fmt(food[k]) + ' kcal' : fmt1(food[k]) + ' g'}</td>
      <td><b>${k === 'kcal' ? fmt(s[k]) + ' kcal' : fmt1(s[k]) + ' g'}</b></td></tr>`).join('');
  };
  const summary = () => {
    const s = scale(food, grams());
    const tot = s.protein * 4 + s.carbs * 4 + s.fat * 9 || 1;
    return `<div class="detail-kcal"><strong>${fmt(s.kcal)}</strong> kcal</div>
      <div class="split">
        <div class="c"><b>${fmt1(s.carbs)} g</b><small>Kohlenhydrate</small></div>
        <div class="p"><b>${fmt1(s.protein)} g</b><small>Eiweiß</small></div>
        <div class="f"><b>${fmt1(s.fat)} g</b><small>Fett</small></div>
      </div>
      <div class="stack"><i class="c" style="flex:${(s.carbs * 4) / tot}"></i><i class="p" style="flex:${(s.protein * 4) / tot}"></i><i class="f" style="flex:${(s.fat * 9) / tot}"></i></div>`;
  };
  const refresh = () => {
    $('#dsum', sheet.el).innerHTML = summary();
    $('#dtab tbody', sheet.el).innerHTML = nutriRows();
    $('#dgrams', sheet.el).textContent = servingIdx >= 0 ? `= ${fmt1(grams())} ${unit}` : '';
  };
  const actionLabel = { diary: 'Hinzufügen', pick: 'Zutat übernehmen', edit: 'Speichern', editIngredient: 'Speichern', browse: 'Zum Tagebuch hinzufügen' }[ctx.mode];
  const editable = food.source !== 'recipe' && food.source !== 'entry' && !isEdit;

  const sheet = openSheet(`
    <div class="detail-head">
      ${food.image ? `<img class="detail-img" src="${esc(food.image)}" alt="" referrerpolicy="no-referrer">` : `<span class="detail-img emoji">${foodEmoji(food)}</span>`}
      <div><h2>${esc(food.name)}</h2>
        <p class="muted">${esc(food.brand || food.category || '')}${food.barcode ? ` · <span class="mono">${esc(food.barcode)}</span>` : ''}</p>
        ${food.nutriscore ? `<span class="nutriscore ns-${food.nutriscore}">Nutri-Score ${food.nutriscore.toUpperCase()}</span>` : ''}
      </div>
      ${food.source !== 'entry' ? `<button class="icon-btn fav ${fav() ? 'on' : ''}" data-act="fav" aria-label="Favorit">${fav() ? '★' : '☆'}</button>` : ''}
    </div>
    ${food.source === 'off' && !food.kcal && !food.protein && !food.carbs ? `<div class="notice warn">Für dieses Produkt sind keine Nährwerte hinterlegt. <button class="link" data-act="editFood">Jetzt ergänzen</button></div>` : ''}
    <div class="amount">
      <label>Menge<input id="dqty" type="number" inputmode="decimal" min="0" step="any" value="${Math.round(qty * 100) / 100}"></label>
      <label>Einheit<select id="dunit">
        <option value="-1" ${servingIdx < 0 ? 'selected' : ''}>${unit}</option>
        ${servings.map((s, i) => `<option value="${i}" ${i === servingIdx ? 'selected' : ''}>${esc(s.name)} (${fmt1(s.g)} ${unit})</option>`).join('')}
      </select></label>
      <span id="dgrams" class="muted"></span>
    </div>
    ${ctx.mode === 'diary' || ctx.mode === 'edit' || ctx.mode === 'browse' ? `<label class="meal-select">Mahlzeit<select id="dmeal">${state.meals.map((m) => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${esc(m.icon || '')} ${esc(m.name)}</option>`).join('')}</select></label>` : ''}
    <div id="dsum"></div>
    <table id="dtab" class="nutri"><thead><tr><th>Nährwerte</th><th>pro 100 ${unit}</th><th>Menge</th></tr></thead><tbody></tbody></table>
    <div class="actions">
      ${isEdit ? `<button class="btn danger ghost" data-act="remove">Entfernen</button>` : ''}
      ${editable ? `<button class="btn ghost" data-act="editFood">Werte bearbeiten</button>` : ''}
      <button class="btn primary" data-act="commit">${actionLabel}</button>
    </div>
    ${food.source === 'off' ? `<p class="footnote">Daten: <a href="https://world.openfoodfacts.org/product/${esc(food.barcode)}" target="_blank" rel="noopener">Open Food Facts</a> (ODbL)</p>` : ''}`, {
    fav(el) {
      if (!state.foods[food.id] && food.source === 'off') rememberFood(food);
      toggleFavorite(food.id);
      el.classList.toggle('on', fav());
      el.textContent = fav() ? '★' : '☆';
    },
    editFood() {
      sheet.close();
      openCustomFoodForm(food, ctx);
    },
    remove() {
      if (ctx.mode === 'edit') {
        state.diary[currentDate] = dayEntries(currentDate).filter((e) => e.id !== ctx.entry.id);
        save(); render();
      } else ctx.onRemove?.();
      sheet.close();
    },
    commit() {
      const g = grams();
      if (!(g > 0)) return toast('Bitte eine Menge eingeben');
      if (ctx.mode === 'edit') {
        Object.assign(ctx.entry, { grams: g, qty, servingIdx, meal });
        save(); render();
      } else if (ctx.mode === 'editIngredient') {
        ctx.onSave(g, { qty, servingIdx });
      } else {
        commitFood(food, g, { ...ctx, meal, qty, servingIdx, mode: ctx.mode === 'browse' ? 'diary' : ctx.mode });
        ctx.onDone?.();
      }
      sheet.close();
    },
  });
  $('#dqty', sheet.el).addEventListener('input', (e) => { qty = parseNum(e.target.value); refresh(); });
  $('#dunit', sheet.el).addEventListener('change', (e) => {
    const prevG = grams();
    servingIdx = +e.target.value;
    qty = servingIdx >= 0 ? 1 : Math.round(prevG) || 100;
    $('#dqty', sheet.el).value = qty;
    refresh();
  });
  $('#dmeal', sheet.el)?.addEventListener('change', (e) => { meal = e.target.value; });
  refresh();
}

// ---------- Eigenes Lebensmittel ----------
function openCustomFoodForm(base = {}, ctx = { mode: 'browse' }) {
  const isOwn = base.source === 'custom';
  const f = { name: '', brand: '', barcode: '', unit: 'g', ...base };
  const s0 = f.servings?.[0] || { name: '', g: '' };
  const numField = (k, label, unit = 'g') => `<label>${label}<span class="suffix"><input name="${k}" type="number" inputmode="decimal" step="any" min="0" value="${f[k] ? +(+f[k]).toFixed(2) : ''}"><i>${unit}</i></span></label>`;
  const sheet = openSheet(`
    <h2>${isOwn ? 'Lebensmittel bearbeiten' : 'Eigenes Lebensmittel'}</h2>
    <form id="cf" class="form">
      <label>Name*<input name="name" required value="${esc(f.name)}" placeholder="z. B. Omas Apfelkuchen"></label>
      <div class="grid2">
        <label>Marke<input name="brand" value="${esc(f.brand === 'Eigenes Gericht' ? '' : f.brand)}"></label>
        <label>Barcode<input name="barcode" inputmode="numeric" value="${esc(f.barcode || '')}"></label>
      </div>
      <label>Einheit<select name="unit"><option value="g" ${f.unit !== 'ml' ? 'selected' : ''}>Gramm (fest)</option><option value="ml" ${f.unit === 'ml' ? 'selected' : ''}>Milliliter (flüssig)</option></select></label>
      <h4 class="section-title">Nährwerte pro 100 g / ml</h4>
      <div class="grid2">
        ${numField('kcal', 'Kalorien*', 'kcal')}
        ${numField('protein', 'Eiweiß')}
        ${numField('carbs', 'Kohlenhydrate')}
        ${numField('sugar', 'davon Zucker')}
        ${numField('fat', 'Fett')}
        ${numField('satFat', 'davon gesättigt')}
        ${numField('fiber', 'Ballaststoffe')}
        ${numField('salt', 'Salz')}
      </div>
      <h4 class="section-title">Portion (optional)</h4>
      <div class="grid2">
        <label>Bezeichnung<input name="sName" value="${esc(s0.name)}" placeholder="z. B. 1 Stück"></label>
        <label>Größe<span class="suffix"><input name="sG" type="number" inputmode="decimal" step="any" min="0" value="${s0.g || ''}"><i>g/ml</i></span></label>
      </div>
      <div class="actions">
        ${isOwn ? `<button type="button" class="btn danger ghost" data-act="del">Löschen</button>` : ''}
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>`, {
    del() {
      if (!confirm('Lebensmittel löschen?')) return;
      delete state.foods[f.id];
      state.favorites = state.favorites.filter((x) => x !== f.id);
      state.recents = state.recents.filter((x) => x !== f.id);
      save(); sheet.close(); render();
    },
  });
  $('#cf', sheet.el).addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target));
    const food = {
      id: isOwn ? f.id : 'custom-' + uid(),
      name: d.name.trim(),
      brand: d.brand.trim(),
      barcode: d.barcode.replace(/\D/g, ''),
      unit: d.unit,
      image: f.image || '',
      source: 'custom',
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, parseNum(d[k])])),
      servings: d.sName.trim() && parseNum(d.sG) > 0 ? [{ name: d.sName.trim(), g: parseNum(d.sG) }, ...(f.servings || []).slice(1)] : (f.servings || []).filter((s) => s.g > 0 && s !== s0),
    };
    state.foods[food.id] = food;
    if (base.id && base.id !== food.id && state.favorites.includes(base.id)) state.favorites = state.favorites.map((x) => (x === base.id ? food.id : x));
    save();
    sheet.close();
    toast('Gespeichert');
    render();
    if (ctx.mode !== 'browse' || !isOwn) openFoodDetail(food, ctx.mode === 'browse' ? { mode: 'browse', meal: 'snacks' } : ctx);
  });
}

// ---------- Barcode-Scanner ----------
const ICON_BARCODE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M2 5h2v14H2zm3 0h1v14H5zm2 0h3v14H7zm4 0h1v14h-1zm3 0h2v14h-2zm3 0h1v14h-1zm2 0h3v14h-3z"/></svg>`;

function openScanner(ctx = { mode: 'browse' }) {
  let scanner;
  const sheet = openSheet(`
    <h2>Barcode scannen</h2>
    <div class="scanner">
      <video id="sv" playsinline muted></video>
      <div class="scan-frame"><span></span></div>
      <div class="scan-status" id="sst">Kamera wird gestartet…</div>
    </div>
    <div class="scan-tools">
      <button class="btn ghost" data-act="torch" id="torch" hidden>🔦 Licht</button>
      <label class="btn ghost">🖼️ Foto wählen<input type="file" accept="image/*" capture="environment" id="sfile" hidden></label>
    </div>
    <form id="manual" class="searchbar">
      <input id="mcode" inputmode="numeric" pattern="[0-9]*" placeholder="Barcode manuell eingeben (EAN)">
      <button class="btn primary" type="submit">Suchen</button>
    </form>`, {
    async torch(el) {
      try { const on = await scanner.toggleTorch(); el.classList.toggle('on', on); } catch { toast('Licht nicht verfügbar'); }
    },
  }, { cls: 'tall dark', onClose: () => scanner?.stop() });

  const status = (msg, cls = '') => {
    const s = $('#sst', sheet.el);
    if (s) { s.textContent = msg; s.className = 'scan-status ' + cls; }
  };

  const handle = async (code) => {
    code = String(code).replace(/\D/g, '');
    if (code.length < 6) return status('Ungültiger Barcode', 'err');
    navigator.vibrate?.(80);
    scanner?.stop();
    status(`Gefunden: ${code} – lade Nährwerte…`, 'ok');
    const local = Object.values(state.foods).find((f) => f.barcode === code);
    if (local) { sheet.close(); return openFoodDetail(local, ctx); }
    try {
      const food = await fetchByBarcode(code);
      if (sheet.closed) return;
      sheet.close();
      if (food) openFoodDetail(food, ctx);
      else {
        toast('Produkt nicht in der Datenbank – bitte selbst anlegen');
        openCustomFoodForm({ barcode: code }, ctx);
      }
    } catch {
      status('Keine Verbindung zu Open Food Facts. Bitte später erneut versuchen.', 'err');
    }
  };

  $('#manual', sheet.el).addEventListener('submit', (e) => { e.preventDefault(); handle($('#mcode', sheet.el).value); });
  $('#sfile', sheet.el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    status('Bild wird analysiert…');
    const code = await scanImageFile(file);
    if (code) handle(code); else status('Kein Barcode im Bild erkannt', 'err');
  });

  startScanner($('#sv', sheet.el), handle)
    .then((s) => {
      if (sheet.closed) return s.stop();
      scanner = s;
      status('Barcode in den Rahmen halten');
      if (s.torchSupported) $('#torch', sheet.el).hidden = false;
    })
    .catch((err) => {
      status(err.name === 'NotAllowedError' ? 'Kamerazugriff verweigert – bitte in den Browser-Einstellungen erlauben oder Barcode manuell eingeben.' : (err.message || 'Kamera nicht verfügbar') + ' – Barcode manuell eingeben oder Foto wählen.', 'err');
    });
}

// ---------- Gerichte & Mahlzeiten ----------
function renderRecipes() {
  const seg = `<div class="segmented">
    <button class="${recipesSegment === 'recipes' ? 'on' : ''}" data-act="seg" data-seg="recipes">Gerichte (${state.recipes.length})</button>
    <button class="${recipesSegment === 'templates' ? 'on' : ''}" data-act="seg" data-seg="templates">Mahlzeiten (${state.templates.length})</button>
  </div>`;
  if (recipesSegment === 'recipes') {
    return `<h1 class="page-title">Gerichte</h1>${seg}
      <button class="btn primary wide" data-act="newRecipe">＋ Neues Gericht anlegen</button>
      ${state.recipes.length ? `<ul class="list card">${state.recipes.map((r) => {
        const n = recipeNutrition(r);
        const p = scale(n.per100, n.portionGrams);
        return `<li class="row" data-act="openRecipe" data-id="${r.id}"><span class="thumb emoji">${esc(r.emoji || '🥘')}</span>
          <div class="row-main"><b>${esc(r.name)}</b><small>${r.ingredients.length} Zutaten · ${n.servings} Portionen · E ${fmt(p.protein)} g · KH ${fmt(p.carbs)} g · F ${fmt(p.fat)} g</small></div>
          <span class="kcal">${fmt(p.kcal)}<small>kcal/Portion</small></span></li>`;
      }).join('')}</ul>` : `<div class="empty"><div class="big">🥘</div><p>Lege eigene Gerichte aus beliebig vielen Zutaten an. Die Nährwerte pro Portion werden automatisch berechnet.</p></div>`}`;
  }
  return `<h1 class="page-title">Mahlzeiten</h1>${seg}
    <button class="btn primary wide" data-act="newTemplate">＋ Neue Mahlzeit zusammenstellen</button>
    ${state.templates.length ? `<ul class="list card">${state.templates.map((t) => {
      const s = sumEntries(t.items);
      return `<li class="row" data-act="openTemplate" data-id="${t.id}"><span class="thumb emoji">🍱</span>
        <div class="row-main"><b>${esc(t.name)}</b><small>${t.items.map((i) => esc(i.name)).join(', ')}</small></div>
        <span class="kcal">${fmt(s.kcal)}<small>kcal</small></span></li>`;
    }).join('')}</ul>` : `<div class="empty"><div class="big">🍱</div><p>Mahlzeiten sind Kombinationen, die du oft isst – z. B. „Müsli mit Banane“. Speichere sie hier oder im Tagebuch über „⋯ → Als Mahlzeit speichern“ und trage sie mit einem Tipp ein.</p></div>`}`;
}

const recipeHandlers = {
  seg(el) { recipesSegment = el.dataset.seg; render(); },
  newRecipe() { openRecipeEditor(); },
  openRecipe(el) { openRecipeEditor(state.recipes.find((r) => r.id === el.dataset.id)); },
  newTemplate() { openTemplateEditor(); },
  openTemplate(el) { openTemplateEditor(state.templates.find((t) => t.id === el.dataset.id)); },
};

const slimFood = (f) => ({
  id: f.id, name: f.name, brand: f.brand || '', unit: f.unit || 'g', image: f.image || '', emoji: f.emoji || foodEmoji(f), servings: f.servings || [],
  ...Object.fromEntries(NUTRIENTS.map((k) => [k, f[k] || 0])),
});

const RECIPE_EMOJIS = ['🥘', '🍝', '🍲', '🥗', '🍛', '🍜', '🥪', '🌯', '🍕', '🥞', '🍰', '🥣', '🍳', '🍔', '🍣', '🥧'];

function openRecipeEditor(existing) {
  const draft = existing ? structuredClone(existing) : { id: uid(), name: '', emoji: '🥘', servings: 2, cookedWeight: 0, ingredients: [], notes: '' };
  const sheet = openSheet('', {
    emoji(el) { draft.emoji = el.dataset.e; draw(); },
    addIng() {
      openSearch({
        mode: 'pick',
        onPick: (food, grams, extra) => { draft.ingredients.push({ id: uid(), food: slimFood(food), grams, ...extra }); draw(); },
      });
    },
    scanIng() {
      openScanner({ mode: 'pick', onPick: (food, grams, extra) => { draft.ingredients.push({ id: uid(), food: slimFood(food), grams, ...extra }); draw(); } });
    },
    editIng(el) {
      const ing = draft.ingredients.find((i) => i.id === el.dataset.id);
      openFoodDetail({ ...ing.food, source: 'entry' }, {
        mode: 'editIngredient', grams: ing.qty ?? ing.grams, servingIdx: ing.servingIdx ?? -1,
        onSave: (g, extra) => { Object.assign(ing, { grams: g, ...extra }); draw(); },
        onRemove: () => { draft.ingredients = draft.ingredients.filter((i) => i !== ing); draw(); },
      });
    },
    save() {
      if (!persist()) return;
      sheet.close(); toast('Gericht gespeichert');
    },
    log() {
      if (!persist()) return;
      sheet.close();
      openFoodDetail(recipeAsFood(draft), { mode: 'browse', meal: guessMeal() });
    },
    del() {
      if (!confirm(`„${draft.name}“ löschen?`)) return;
      state.recipes = state.recipes.filter((r) => r.id !== draft.id);
      state.favorites = state.favorites.filter((x) => x !== 'recipe-' + draft.id);
      save(); sheet.close(); render();
    },
  }, { cls: 'tall' });

  function persist() {
    if (!draft.name.trim()) { toast('Bitte einen Namen eingeben'); return false; }
    if (!draft.ingredients.length) { toast('Bitte mindestens eine Zutat hinzufügen'); return false; }
    const i = state.recipes.findIndex((r) => r.id === draft.id);
    if (i >= 0) state.recipes[i] = structuredClone(draft); else state.recipes.unshift(structuredClone(draft));
    save(); render();
    return true;
  }

  function draw() {
    const n = recipeNutrition(draft);
    const p = scale(n.per100, n.portionGrams);
    sheet.set(`
      <h2>${existing ? 'Gericht bearbeiten' : 'Neues Gericht'}</h2>
      <div class="form">
        <label>Name<input id="rname" value="${esc(draft.name)}" placeholder="z. B. Chili sin Carne"></label>
        <div class="emoji-pick">${RECIPE_EMOJIS.map((e) => `<button class="${e === draft.emoji ? 'on' : ''}" data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="grid2">
          <label>Portionen<input id="rserv" type="number" inputmode="numeric" min="1" step="1" value="${draft.servings}"></label>
          <label>Gewicht fertig (opt.)<span class="suffix"><input id="rweight" type="number" inputmode="decimal" min="0" step="any" value="${draft.cookedWeight || ''}" placeholder="${fmt(n.weight)}"><i>g</i></span></label>
        </div>
      </div>
      <h4 class="section-title">Zutaten (${draft.ingredients.length})</h4>
      <ul class="list">${draft.ingredients.map((i) => `
        <li class="row" data-act="editIng" data-id="${i.id}">${thumb(i.food)}
          <div class="row-main"><b>${esc(i.food.name)}</b><small>${fmt1(i.grams)} ${i.food.unit || 'g'}${i.food.brand ? ' · ' + esc(i.food.brand) : ''}</small></div>
          <span class="kcal">${fmt(scale(i.food, i.grams).kcal)}</span></li>`).join('')}</ul>
      <div class="grid2">
        <button class="btn ghost" data-act="addIng">＋ Zutat suchen</button>
        <button class="btn ghost" data-act="scanIng">${ICON_BARCODE} Zutat scannen</button>
      </div>
      <section class="card inset">
        <h4 class="section-title">Pro Portion (${fmt(n.portionGrams)} g)</h4>
        <div class="split big">
          <div><b>${fmt(p.kcal)}</b><small>kcal</small></div>
          <div class="c"><b>${fmt1(p.carbs)} g</b><small>KH</small></div>
          <div class="p"><b>${fmt1(p.protein)} g</b><small>Eiweiß</small></div>
          <div class="f"><b>${fmt1(p.fat)} g</b><small>Fett</small></div>
        </div>
        <p class="muted small">Gesamt: ${fmt(n.total.kcal)} kcal · ${fmt(n.weight)} g · pro 100 g: ${fmt(n.per100.kcal)} kcal</p>
      </section>
      <label class="form">Notizen / Zubereitung<textarea id="rnotes" rows="3">${esc(draft.notes || '')}</textarea></label>
      <div class="actions">
        ${existing ? `<button class="btn danger ghost" data-act="del">Löschen</button>` : ''}
        <button class="btn ghost" data-act="log">Ins Tagebuch</button>
        <button class="btn primary" data-act="save">Speichern</button>
      </div>`);
    $('#rname', sheet.el).addEventListener('input', (e) => { draft.name = e.target.value; });
    $('#rnotes', sheet.el).addEventListener('input', (e) => { draft.notes = e.target.value; });
    $('#rserv', sheet.el).addEventListener('change', (e) => { draft.servings = Math.max(1, Math.round(parseNum(e.target.value)) || 1); draw(); });
    $('#rweight', sheet.el).addEventListener('change', (e) => { draft.cookedWeight = parseNum(e.target.value); draw(); });
  }
  draw();
}

function openTemplateEditor(existing) {
  const draft = existing ? structuredClone(existing) : { id: uid(), name: '', items: [] };
  const sheet = openSheet('', {
    add() {
      openSearch({ mode: 'pick', onPick: (food, grams, extra) => { draft.items.push({ ...makeEntry(food, grams, ''), ...extra }); draw(); } });
    },
    edit(el) {
      const it = draft.items.find((i) => i.id === el.dataset.id);
      openFoodDetail(foodFromEntry(it), {
        mode: 'editIngredient', grams: it.qty ?? it.grams, servingIdx: it.servingIdx ?? -1,
        onSave: (g, extra) => { Object.assign(it, { grams: g, ...extra }); draw(); },
        onRemove: () => { draft.items = draft.items.filter((i) => i !== it); draw(); },
      });
    },
    save() {
      if (!persist()) return;
      sheet.close(); toast('Mahlzeit gespeichert');
    },
    log() {
      if (!persist()) return;
      sheet.close();
      openMealPicker((meal) => addTemplate(draft, meal));
    },
    del() {
      if (!confirm(`„${draft.name}“ löschen?`)) return;
      state.templates = state.templates.filter((t) => t.id !== draft.id);
      save(); sheet.close(); render();
    },
  }, { cls: 'tall' });

  function persist() {
    if (!draft.name.trim()) { toast('Bitte einen Namen eingeben'); return false; }
    if (!draft.items.length) { toast('Bitte mindestens ein Lebensmittel hinzufügen'); return false; }
    const i = state.templates.findIndex((t) => t.id === draft.id);
    if (i >= 0) state.templates[i] = structuredClone(draft); else state.templates.unshift(structuredClone(draft));
    save(); render();
    return true;
  }

  function draw() {
    const s = sumEntries(draft.items);
    sheet.set(`
      <h2>${existing ? 'Mahlzeit bearbeiten' : 'Neue Mahlzeit'}</h2>
      <label class="form">Name<input id="tname" value="${esc(draft.name)}" placeholder="z. B. Müsli mit Banane"></label>
      <h4 class="section-title">Lebensmittel (${draft.items.length})</h4>
      <ul class="list">${draft.items.map((i) => `
        <li class="row" data-act="edit" data-id="${i.id}">${thumb(i)}
          <div class="row-main"><b>${esc(i.name)}</b><small>${entryLabel(i)}</small></div>
          <span class="kcal">${fmt(scale(i.per100, i.grams).kcal)}</span></li>`).join('')}</ul>
      <button class="btn ghost wide" data-act="add">＋ Lebensmittel hinzufügen</button>
      <section class="card inset"><div class="split big">
        <div><b>${fmt(s.kcal)}</b><small>kcal</small></div>
        <div class="c"><b>${fmt1(s.carbs)} g</b><small>KH</small></div>
        <div class="p"><b>${fmt1(s.protein)} g</b><small>Eiweiß</small></div>
        <div class="f"><b>${fmt1(s.fat)} g</b><small>Fett</small></div>
      </div></section>
      <div class="actions">
        ${existing ? `<button class="btn danger ghost" data-act="del">Löschen</button>` : ''}
        <button class="btn ghost" data-act="log">Ins Tagebuch</button>
        <button class="btn primary" data-act="save">Speichern</button>
      </div>`);
    $('#tname', sheet.el).addEventListener('input', (e) => { draft.name = e.target.value; });
  }
  draw();
}

function guessMeal() {
  const h = new Date().getHours();
  const id = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
  return state.meals.some((m) => m.id === id) ? id : state.meals[0]?.id;
}

function openMealPicker(onPick) {
  const sheet = openSheet(`<h2>Zu welcher Mahlzeit?</h2><div class="menu">${state.meals.map((m) => `<button data-act="pick" data-id="${m.id}">${esc(m.icon || '')} ${esc(m.name)}</button>`).join('')}</div>`, {
    pick(el) { sheet.close(); onPick(el.dataset.id); },
  });
}

// ---------- Lebensmittel ----------
function renderFoods() {
  const lists = {
    favorites: state.favorites.map(findFood).filter(Boolean),
    recents: state.recents.map(findFood).filter(Boolean),
    custom: Object.values(state.foods).filter((f) => f.source === 'custom'),
  };
  const items = lists[foodsSegment];
  const empty = { favorites: 'Markiere Lebensmittel mit ☆, um sie hier schnell wiederzufinden.', recents: 'Hier erscheinen Lebensmittel, die du zuletzt eingetragen hast.', custom: 'Lege eigene Lebensmittel an – z. B. Produkte, die noch nicht in der Datenbank sind.' }[foodsSegment];
  return `<h1 class="page-title">Lebensmittel</h1>
    <button class="searchfake" data-act="search"><span>🔍</span> ${fmt(BASE_FOODS.length)} Grundlebensmittel + 3 Mio. Produkte durchsuchen…</button>
    <div class="grid2">
      <button class="btn ghost" data-act="scan">${ICON_BARCODE} Barcode scannen</button>
      <button class="btn ghost" data-act="newFood">＋ Eigenes Lebensmittel</button>
    </div>
    <div class="segmented">
      <button class="${foodsSegment === 'favorites' ? 'on' : ''}" data-act="fseg" data-seg="favorites">Favoriten</button>
      <button class="${foodsSegment === 'recents' ? 'on' : ''}" data-act="fseg" data-seg="recents">Zuletzt</button>
      <button class="${foodsSegment === 'custom' ? 'on' : ''}" data-act="fseg" data-seg="custom">Eigene (${lists.custom.length})</button>
    </div>
    ${items.length ? `<ul class="list card">${items.map((f) => `<li class="row" data-act="food" data-id="${esc(f.id)}">${thumb(f)}
      <div class="row-main"><b>${esc(f.name)}</b><small>${esc(f.brand || f.category || '')}</small></div>
      <span class="kcal">${fmt(f.kcal)}<small>kcal/100${f.unit || 'g'}</small></span></li>`).join('')}</ul>`
      : `<div class="empty"><p>${empty}</p></div>`}`;
}

const foodsHandlers = {
  search() { openSearch({ mode: 'browse' }); },
  scan() { openScanner({ mode: 'browse', meal: guessMeal() }); },
  newFood() { openCustomFoodForm({}, { mode: 'browse' }); },
  fseg(el) { foodsSegment = el.dataset.seg; render(); },
  food(el) {
    const f = findFood(el.dataset.id);
    if (f) openFoodDetail(f, { mode: 'browse', meal: guessMeal() });
  },
};

// ---------- Profil ----------
function renderProfile() {
  const p = state.profile;
  const g = calcGoals();
  const sumM = p.macros.carbs + p.macros.protein + p.macros.fat;
  const bmi = p.weight / (p.height / 100) ** 2;
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const lastWeights = [...state.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return `<h1 class="page-title">Profil & Ziele</h1>
    <section class="card goals-card">
      <div class="goal-big"><strong>${fmt(g.kcal)}</strong><span>kcal pro Tag</span></div>
      <div class="split">
        <div class="c"><b>${g.carbs} g</b><small>Kohlenhydrate</small></div>
        <div class="p"><b>${g.protein} g</b><small>Eiweiß</small></div>
        <div class="f"><b>${g.fat} g</b><small>Fett</small></div>
      </div>
      <p class="muted small">BMI ${fmt1(bmi)} · Grundumsatz ${fmt(g.bmr)} kcal · Gesamtumsatz ${fmt(g.tdee)} kcal</p>
    </section>
    <section class="card form" data-onchange="profile">
      <h3 class="card-title">Über dich</h3>
      <div class="grid2">
        <label>Geschlecht<select name="sex"><option value="f" ${sel('f', p.sex)}>weiblich</option><option value="m" ${sel('m', p.sex)}>männlich</option></select></label>
        <label>Alter<input name="age" type="number" inputmode="numeric" value="${p.age}"></label>
        <label>Größe<span class="suffix"><input name="height" type="number" inputmode="numeric" value="${p.height}"><i>cm</i></span></label>
        <label>Gewicht<span class="suffix"><input name="weight" type="number" inputmode="decimal" step="0.1" value="${p.weight}"><i>kg</i></span></label>
        <label>Zielgewicht<span class="suffix"><input name="targetWeight" type="number" inputmode="decimal" step="0.1" value="${p.targetWeight}"><i>kg</i></span></label>
        <label>Wasserziel<span class="suffix"><input name="waterGoal" type="number" inputmode="numeric" step="250" value="${p.waterGoal}"><i>ml</i></span></label>
      </div>
      <label>Aktivität<select name="activity">
        <option value="1.2" ${sel(1.2, p.activity)}>Kaum aktiv (Bürojob, wenig Bewegung)</option>
        <option value="1.375" ${sel(1.375, p.activity)}>Leicht aktiv (1–3× Sport/Woche)</option>
        <option value="1.55" ${sel(1.55, p.activity)}>Mäßig aktiv (3–5× Sport/Woche)</option>
        <option value="1.725" ${sel(1.725, p.activity)}>Sehr aktiv (6–7× Sport/Woche)</option>
        <option value="1.9" ${sel(1.9, p.activity)}>Extrem aktiv (körperliche Arbeit + Sport)</option>
      </select></label>
      <label>Ziel<select name="goal">
        <option value="lose" ${sel('lose', p.goal)}>Abnehmen (ca. 0,5 kg/Woche)</option>
        <option value="loseSlow" ${sel('loseSlow', p.goal)}>Langsam abnehmen (ca. 0,25 kg/Woche)</option>
        <option value="keep" ${sel('keep', p.goal)}>Gewicht halten</option>
        <option value="gain" ${sel('gain', p.goal)}>Zunehmen / Muskelaufbau</option>
      </select></label>
      <label>Eigenes Kalorienziel (optional)<span class="suffix"><input name="kcalOverride" type="number" inputmode="numeric" value="${p.kcalOverride || ''}" placeholder="automatisch"><i>kcal</i></span></label>
      <h4 class="section-title">Makro-Verteilung ${sumM !== 100 ? `<span class="badge warn">Summe ${sumM} %</span>` : ''}</h4>
      <div class="grid3">
        <label>KH<span class="suffix"><input name="m_carbs" type="number" inputmode="numeric" value="${p.macros.carbs}"><i>%</i></span></label>
        <label>Eiweiß<span class="suffix"><input name="m_protein" type="number" inputmode="numeric" value="${p.macros.protein}"><i>%</i></span></label>
        <label>Fett<span class="suffix"><input name="m_fat" type="number" inputmode="numeric" value="${p.macros.fat}"><i>%</i></span></label>
      </div>
    </section>
    <section class="card">
      <h3 class="card-title">Gewichtsverlauf</h3>
      <form class="searchbar" id="wform"><input id="wkg" type="number" inputmode="decimal" step="0.1" placeholder="Gewicht heute (kg)"><button class="btn primary">Eintragen</button></form>
      ${lastWeights.length ? `<ul class="list">${lastWeights.map((w) => `<li class="row"><div class="row-main"><b>${fmt1(w.kg)} kg</b><small>${new Date(w.date + 'T12:00').toLocaleDateString('de-DE')}</small></div><button class="icon-btn ghost" data-act="delWeight" data-d="${w.date}" aria-label="Löschen">✕</button></li>`).join('')}</ul>` : ''}
      ${p.targetWeight ? `<p class="muted small">Noch ${fmt1(Math.abs(p.weight - p.targetWeight))} kg bis zum Zielgewicht.</p>` : ''}
    </section>
    <section class="card">
      <h3 class="card-title">Mahlzeiten im Tagebuch</h3>
      <ul class="list">${state.meals.map((m, i) => `<li class="row">
        <span class="thumb emoji">${esc(m.icon || '🍴')}</span>
        <div class="row-main"><b>${esc(m.name)}</b></div>
        <button class="icon-btn ghost" data-act="mealUp" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button class="icon-btn ghost" data-act="mealRename" data-i="${i}" aria-label="Umbenennen">✎</button>
        <button class="icon-btn ghost" data-act="mealDel" data-i="${i}" ${state.meals.length <= 1 ? 'disabled' : ''} aria-label="Löschen">✕</button>
      </li>`).join('')}</ul>
      <button class="btn ghost wide" data-act="mealAdd">＋ Mahlzeit hinzufügen (z. B. „Vor dem Training“)</button>
    </section>
    <section class="card">
      <h3 class="card-title">Einstellungen & Daten</h3>
      <label class="toggle"><input type="checkbox" data-onchange="germanyOnly" ${state.settings.germanyOnly ? 'checked' : ''}> Online-Suche auf in Deutschland erhältliche Produkte beschränken</label>
      <div class="grid2">
        <button class="btn ghost" data-act="export">⬇️ Daten exportieren</button>
        <label class="btn ghost">⬆️ Daten importieren<input type="file" accept="application/json" data-onchange="import" hidden></label>
      </div>
      <button class="btn danger ghost wide" data-act="reset">Alle Daten löschen</button>
      <p class="muted small">Alle Daten werden nur lokal auf diesem Gerät gespeichert. Produktdaten von <a href="https://openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL).</p>
    </section>`;
}

const profileHandlers = {
  profile(el, ev) {
    const t = ev.target;
    if (!t.name) return;
    const p = state.profile;
    if (t.name.startsWith('m_')) p.macros[t.name.slice(2)] = parseNum(t.value);
    else if (t.name === 'sex' || t.name === 'goal') p[t.name] = t.value;
    else if (t.name === 'kcalOverride') p.kcalOverride = parseNum(t.value) || null;
    else p[t.name] = parseNum(t.value);
    save(); render();
  },
  germanyOnly(el) { state.settings.germanyOnly = el.checked; save(); },
  delWeight(el) { state.weights = state.weights.filter((w) => w.date !== el.dataset.d); save(); render(); },
  mealUp(el) {
    const i = +el.dataset.i;
    [state.meals[i - 1], state.meals[i]] = [state.meals[i], state.meals[i - 1]];
    save(); render();
  },
  mealRename(el) {
    const m = state.meals[+el.dataset.i];
    const name = prompt('Name der Mahlzeit:', m.name);
    if (name?.trim()) { m.name = name.trim(); save(); render(); }
  },
  mealDel(el) {
    const m = state.meals[+el.dataset.i];
    if (!confirm(`„${m.name}“ entfernen? Bestehende Einträge werden zu „${state.meals.find((x) => x !== m).name}“ verschoben.`)) return;
    state.meals = state.meals.filter((x) => x !== m);
    for (const d of Object.values(state.diary)) for (const e of d) if (e.meal === m.id) e.meal = state.meals[0].id;
    save(); render();
  },
  mealAdd() {
    const name = prompt('Name der neuen Mahlzeit:');
    if (!name?.trim()) return;
    const icon = prompt('Emoji (optional):', '🍴') || '🍴';
    state.meals.push({ id: 'meal-' + uid(), name: name.trim(), icon: [...icon.trim()].slice(0, 2).join('') || '🍴' });
    save(); render();
  },
  export() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kalorienzaehler-${isoDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  async import(el) {
    const file = el.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.diary || !data.profile) throw new Error();
      if (!confirm('Bestehende Daten durch den Import ersetzen?')) return;
      replaceState(data); render(); toast('Daten importiert');
    } catch {
      toast('Ungültige Datei');
    }
  },
  reset() {
    if (!confirm('Wirklich ALLE Daten (Tagebuch, Gerichte, eigene Lebensmittel) löschen?')) return;
    localStorage.clear();
    location.reload();
  },
};

// ---------- Start ----------
function init() {
  const view = $('#view');
  bind(view, { ...diaryHandlers, ...recipeHandlers, ...foodsHandlers, ...profileHandlers }, ['click', 'change']);
  view.addEventListener('submit', (e) => {
    if (e.target.id !== 'wform') return;
    e.preventDefault();
    const kg = parseNum($('#wkg').value);
    if (!(kg > 20)) return toast('Bitte ein gültiges Gewicht eingeben');
    const date = isoDate();
    state.weights = [...state.weights.filter((w) => w.date !== date), { date, kg }];
    state.profile.weight = kg;
    save(); render(); toast('Gewicht eingetragen');
  });
  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) { currentTab = b.dataset.tab; render(); view.scrollTo(0, 0); }
    if (b.dataset.act === 'scan') openScanner({ mode: currentTab === 'diary' ? 'diary' : 'browse', meal: guessMeal() });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sheets = document.querySelectorAll('.sheet-backdrop.open');
      sheets[sheets.length - 1]?.querySelector('.sheet-close')?.click();
    }
  });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();

// Für Tests/Debugging
window.kz = { state, openScanner, openSearch };
