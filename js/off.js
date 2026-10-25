// Anbindung an Open Food Facts (https://world.openfoodfacts.org) – freie Datenbank mit über 3 Mio. Produkten.
const FIELDS = [
  'code', 'product_name', 'product_name_de', 'generic_name_de', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutriments', 'image_front_small_url', 'image_front_url',
  'nutriscore_grade', 'categories_tags',
].join(',');

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : 0;
};

const round1 = (n) => Math.round(n * 10) / 10;

/** Wandelt ein Open-Food-Facts-Produkt in das interne Lebensmittelformat (Werte pro 100 g/ml) um. */
export function normalizeProduct(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n.energy_100g) kcal = num(n.energy_100g) / 4.184; // kJ -> kcal
  const name = (p.product_name_de || p.product_name || p.generic_name_de || '').trim();
  if (!name) return null;
  const isLiquid = /\b(ml|cl|l)\b/i.test(p.quantity || '') || n['energy-kcal_unit'] === 'ml';
  const servings = [];
  const sq = num(p.serving_quantity);
  if (sq > 0) servings.push({ name: '1 Portion', g: sq });
  const pkg = /([\d.,]+)\s*(g|ml)\b/i.exec(p.quantity || '');
  if (pkg) {
    const g = num(pkg[1]);
    if (g > 0 && g !== sq) servings.push({ name: '1 Packung', g });
  }
  return {
    id: 'off-' + p.code,
    barcode: p.code,
    name,
    brand: (p.brands || '').split(',')[0].trim(),
    kcal: Math.round(kcal),
    protein: round1(num(n.proteins_100g)),
    carbs: round1(num(n.carbohydrates_100g)),
    fat: round1(num(n.fat_100g)),
    sugar: round1(num(n.sugars_100g)),
    satFat: round1(num(n['saturated-fat_100g'])),
    fiber: round1(num(n.fiber_100g)),
    salt: round1(num(n.salt_100g)),
    unit: isLiquid ? 'ml' : 'g',
    servings,
    image: p.image_front_small_url || p.image_front_url || '',
    nutriscore: p.nutriscore_grade && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : '',
    hasNutrition: n['energy-kcal_100g'] != null || n.energy_100g != null,
    source: 'off',
  };
}

async function getJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** Produkt per Barcode (EAN/UPC) abrufen. Liefert null, wenn es nicht existiert. */
export async function fetchByBarcode(code, signal) {
  const clean = String(code).replace(/\D/g, '');
  const data = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${FIELDS}&lc=de`, signal);
  if (data.status !== 1 && data.status !== 'success') return null;
  return normalizeProduct({ code: clean, ...data.product });
}

/** Volltextsuche. Versucht zuerst die schnelle Such-API, fällt auf die klassische Suche zurück. */
export async function searchProducts(query, { signal, germanyOnly = true, page = 1 } = {}) {
  const q = encodeURIComponent(query.trim());
  const attempts = [
    async () => {
      const filter = germanyOnly ? '&q=' + q + encodeURIComponent(' countries_tags:"en:germany"') : '&q=' + q;
      const d = await getJSON(`https://search.openfoodfacts.org/search?langs=de&page_size=30&page=${page}&fields=${FIELDS}${filter}`, signal);
      return d.hits || [];
    },
    async () => {
      const country = germanyOnly ? '&tagtype_0=countries&tag_contains_0=contains&tag_0=germany' : '';
      const d = await getJSON(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&lc=de&sort_by=unique_scans_n&page_size=30&page=${page}&fields=${FIELDS}${country}`, signal);
      return d.products || [];
    },
  ];
  let lastErr;
  for (const attempt of attempts) {
    try {
      const products = await attempt();
      const seen = new Set();
      return products.map(normalizeProduct).filter((f) => f && f.hasNutrition && !seen.has(f.id) && seen.add(f.id));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}
