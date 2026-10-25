// Lokale Datenhaltung (localStorage) – alle Daten bleiben auf dem Gerät.
const KEY = 'kalorienzaehler:v1';

export const DEFAULT_MEALS = [
  { id: 'breakfast', name: 'Frühstück', icon: '☕' },
  { id: 'lunch', name: 'Mittagessen', icon: '🍲' },
  { id: 'dinner', name: 'Abendessen', icon: '🍽️' },
  { id: 'snacks', name: 'Snacks', icon: '🍎' },
];

const defaults = () => ({
  profile: { sex: 'f', age: 30, height: 170, weight: 70, targetWeight: 65, activity: 1.375, goal: 'lose', kcalOverride: null, macros: { carbs: 45, protein: 25, fat: 30 }, waterGoal: 2500 },
  meals: DEFAULT_MEALS.map((m) => ({ ...m })),
  diary: {},       // { 'YYYY-MM-DD': [entry] }
  water: {},       // { 'YYYY-MM-DD': ml }
  weights: [],     // [{ date, kg }]
  foods: {},       // eigene + zwischengespeicherte Lebensmittel { id: food }
  recipes: [],     // Gerichte
  templates: [],   // gespeicherte Mahlzeiten (Kombinationen)
  favorites: [],   // Lebensmittel-IDs
  recents: [],     // zuletzt verwendete Lebensmittel-IDs
  settings: { germanyOnly: true },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults();
    const s = JSON.parse(raw);
    return { ...d, ...s, profile: { ...d.profile, ...s.profile, macros: { ...d.profile.macros, ...s.profile?.macros } }, settings: { ...d.settings, ...s.settings } };
  } catch {
    return defaults();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
  }
}

export function replaceState(next) {
  const d = defaults();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, d, next, { profile: { ...d.profile, ...next.profile }, settings: { ...d.settings, ...next.settings } });
  save();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const isoDate = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

// ---------- Nährwerte ----------
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'satFat', 'fiber', 'salt'];

export function scale(food, grams) {
  const f = grams / 100;
  const out = {};
  for (const k of NUTRIENTS) out[k] = (food[k] || 0) * f;
  return out;
}

export function sumEntries(entries) {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  for (const e of entries) {
    const s = scale(e.per100, e.grams);
    for (const k of NUTRIENTS) t[k] += s[k];
  }
  return t;
}

/** Nährwerte eines Gerichts: gesamt, pro 100 g und pro Portion. */
export function recipeNutrition(recipe) {
  const total = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  let rawWeight = 0;
  for (const ing of recipe.ingredients) {
    const s = scale(ing.food, ing.grams);
    for (const k of NUTRIENTS) total[k] += s[k];
    rawWeight += ing.grams;
  }
  const weight = recipe.cookedWeight > 0 ? recipe.cookedWeight : rawWeight;
  const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, weight ? (total[k] / weight) * 100 : 0]));
  const servings = Math.max(1, recipe.servings || 1);
  return { total, per100, weight, portionGrams: weight / servings, servings };
}

/** Lebensmittel-Objekt für ein Gericht, damit es wie jedes andere Lebensmittel ins Tagebuch kann. */
export function recipeAsFood(recipe) {
  const n = recipeNutrition(recipe);
  return {
    id: 'recipe-' + recipe.id,
    recipeId: recipe.id,
    name: recipe.name,
    brand: 'Eigenes Gericht',
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, n.per100[k]])),
    unit: 'g',
    servings: [{ name: '1 Portion', g: Math.round(n.portionGrams) }],
    source: 'recipe',
    emoji: recipe.emoji || '🥘',
  };
}

// ---------- Ziele ----------
export function calcGoals(p = state.profile) {
  // Grundumsatz nach Mifflin-St Jeor
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.activity;
  const delta = { lose: -500, loseSlow: -250, keep: 0, gain: 300 }[p.goal] ?? 0;
  const kcal = Math.round(p.kcalOverride > 0 ? p.kcalOverride : Math.max(1200, tdee + delta));
  const m = p.macros;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    carbs: Math.round((kcal * m.carbs) / 100 / 4),
    protein: Math.round((kcal * m.protein) / 100 / 4),
    fat: Math.round((kcal * m.fat) / 100 / 9),
    water: p.waterGoal,
  };
}

// ---------- Lebensmittel-Hilfen ----------
export function rememberFood(food) {
  if (food.source === 'off' || food.source === 'custom') {
    const { hasNutrition, ...clean } = food;
    state.foods[food.id] = { ...state.foods[food.id], ...clean };
  }
  state.recents = [food.id, ...state.recents.filter((id) => id !== food.id)].slice(0, 40);
}

export function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id) ? state.favorites.filter((x) => x !== id) : [id, ...state.favorites];
  save();
}

export function entryFromFood(food, grams, meal, label) {
  return {
    id: uid(),
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand || '',
    unit: food.unit || 'g',
    grams,
    label: label || '',
    image: food.image || '',
    emoji: food.emoji || '',
    per100: Object.fromEntries(NUTRIENTS.map((k) => [k, food[k] || 0])),
    servings: food.servings || [],
  };
}
