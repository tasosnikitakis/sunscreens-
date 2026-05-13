// Shared utilities used by app.js and product.js

const OBF_API = "https://world.openbeautyfacts.org/api/v2/product/";
const OBF_CACHE_KEY = "obf_cache_v1";

// Local image manifest: { "<barcode>": "<filename>" }
// IMAGE_MANIFEST_VERSION is bumped manually whenever new images are committed,
// to bust the browser cache. (GitHub Pages caches static assets up to ~10 min.)
const IMAGE_MANIFEST_VERSION = "4";
let imageManifest = null;
let manifestPromise = null;
function getImageManifest() {
  if (imageManifest) return Promise.resolve(imageManifest);
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(`images/manifest.json?v=${IMAGE_MANIFEST_VERSION}`, { cache: "no-store" })
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
    .then(m => { imageManifest = m || {}; return imageManifest; });
  return manifestPromise;
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(OBF_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveCache(cache) {
  try { localStorage.setItem(OBF_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

const obfCache = loadCache();
const inflight = new Map();

async function fetchOBF(barcode) {
  if (!barcode) return null;
  if (obfCache[barcode] !== undefined) return obfCache[barcode];
  if (inflight.has(barcode)) return inflight.get(barcode);

  const p = (async () => {
    try {
      const fields = "code,product_name,brands,image_front_url,image_url,ingredients_text,categories,countries_tags,quantity";
      const res = await fetch(`${OBF_API}${barcode}.json?fields=${fields}`, {
        headers: { "User-Agent": "SunscreenCatalog/1.0" }
      });
      if (!res.ok) throw new Error("not ok");
      const json = await res.json();
      const data = json.status === 1 && json.product ? json.product : null;
      obfCache[barcode] = data;
      saveCache(obfCache);
      return data;
    } catch (e) {
      obfCache[barcode] = null;
      saveCache(obfCache);
      return null;
    } finally {
      inflight.delete(barcode);
    }
  })();
  inflight.set(barcode, p);
  return p;
}

function parseProduct(p) {
  const name = p.name;
  const m = {};

  // SPF
  const spfMatch = name.match(/SPF\s*(\d+\+?)/i);
  m.spf = spfMatch ? spfMatch[1] : null;

  // Volume / size
  const volMatch = name.match(/(\d+(?:[.,]\d+)?)\s*(ml|gr|g)\b/i);
  m.volume = volMatch ? `${volMatch[1]}${volMatch[2].toLowerCase().replace("g", volMatch[2].toLowerCase() === "gr" ? "gr" : "g")}` : null;

  // Type detection (από όνομα)
  const lower = name.toLowerCase();
  const types = [];
  if (/spray|σπρ[έεαά]ι|brume|spr\./i.test(name)) types.push("Spray");
  if (/lait|γαλάκτωμα|milk|lotion/i.test(name)) types.push("Γαλάκτωμα");
  if (/gel-cream|gel\/cream|κρέμα-gel|cream-gel|κρεμα-gel/i.test(name)) types.push("Κρέμα-Gel");
  else if (/gel/i.test(name)) types.push("Gel");
  if (/fluid|fluide|λεπτόρρευστη/i.test(name)) types.push("Fluid");
  if (/cream|crème|crem|κρέμα|κρεμα/i.test(name) && !types.includes("Κρέμα-Gel")) types.push("Κρέμα");
  if (/mist/i.test(name)) types.push("Mist");
  if (/oil|λάδι|λαδι|huile/i.test(name)) types.push("Λάδι");
  if (/mousse/i.test(name)) types.push("Mousse");
  if (/stick/i.test(name)) types.push("Stick");
  if (/serum/i.test(name)) types.push("Serum");
  if (/foundation/i.test(name)) types.push("Foundation");
  if (/lipbalm|lip balm/i.test(name)) types.push("Lip Balm");
  if (/compact|bb compact/i.test(name)) types.push("Compact");
  if (/drops/i.test(name)) types.push("Drops");
  m.types = [...new Set(types)];

  // Audience
  const audience = [];
  if (/(kids|kid|παιδικ|enfant|baby|bebé|bebe|pediatr|infant)/i.test(name)) audience.push("Παιδικό");
  if (/sensitive|sensib|ευαίσθητ|ευαισθητ/i.test(name)) audience.push("Ευαίσθητο δέρμα");
  if (/anti-?age|antiage|αντιγηραντικ|κατά ρυτίδων|ρυτίδ/i.test(name)) audience.push("Anti-Aging");
  if (/spot|πανάδ|πανάδες|melas|κηλίδ|anti-?tâche/i.test(name)) audience.push("Κατά πανάδων");
  if (/oil[- ]?control|oily|λιπαρ|μικτ|matte|mat\b/i.test(name)) audience.push("Λιπαρό/Μικτό");
  if (/teint|tint|με χρώμα|color|nude touch|color cream/i.test(name)) audience.push("Με χρώμα");
  if (/dry touch|dry-?touch/i.test(name)) audience.push("Dry Touch");
  if (/family|φαμιλι/i.test(name)) audience.push("Οικογενειακό");
  if (/wet skin|wetskin/i.test(name)) audience.push("Βρεγμένο δέρμα");
  if (/sport|sportx/i.test(name)) audience.push("Sport");
  m.audience = [...new Set(audience)];

  // Body area
  const areas = [];
  if (/πρόσωπο|προσώπου|face/i.test(name) && !/πρόσωπο & σώμα|προσώπου & σώματος|f\/b|face\/body/i.test(name)) areas.push("Πρόσωπο");
  if (/σώμα|σώματος|body/i.test(name) && !/πρόσωπο & σώμα|προσώπου & σώματος|f\/b|face\/body/i.test(name)) areas.push("Σώμα");
  if (/πρόσωπο & σώμα|προσώπου & σώματος|f\/b|face\/body/i.test(name)) areas.push("Πρόσωπο & Σώμα");
  if (/μαλλιά|hair/i.test(name)) areas.push("Μαλλιά");
  if (/eye|μάτι|ματιών/i.test(name)) areas.push("Μάτια");
  if (/lip|χείλη/i.test(name)) areas.push("Χείλη");
  m.areas = [...new Set(areas)];

  // Promo/new
  m.isPromo = /promo|προσφορά|δώρο|\+δ|set\b|pack|kit/i.test(name);
  m.isNew = name.includes("ΝΕΟ") || /\bnew\b/i.test(name);

  return m;
}

// Shared rendering helpers (used by app.js and product.js)
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function shade(hex, percent) {
  const num = parseInt(hex.replace("#",""), 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
  let b = (num & 0xff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,"0")}`;
}

function imageUrlFor(barcode, obfData) {
  // Prefer local image from manifest, then fall back to OBF
  if (imageManifest && imageManifest[barcode]) {
    return `images/${imageManifest[barcode]}`;
  }
  if (obfData) {
    return obfData.image_front_url || obfData.image_url || null;
  }
  return null;
}

// Resolve image url for a product: local manifest first, OBF as fallback.
// Returns a Promise<string|null>.
async function resolveImageUrl(barcode) {
  await getImageManifest();
  if (imageManifest && imageManifest[barcode]) return `images/${imageManifest[barcode]}`;
  const data = await fetchOBF(barcode);
  return imageUrlFor(barcode, data);
}

function placeholderEl(brandKey, name) {
  const brand = BRANDS[brandKey];
  const accent = brand?.accent || "#f59e0b";
  const initials = (brand?.name || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  // build via DOM later; here return inline style props
  return { accent, initials };
}

function fmtPrice(p) {
  return p.toFixed(2).replace(".", ",") + " €";
}

function highlightTerm(text, term) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bg-amber-200 text-slate-900 px-0.5 rounded">$1</mark>');
}
