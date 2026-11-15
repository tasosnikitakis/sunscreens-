// Σελίδα «Εταιρίες» (brands.html): όλα τα brand catalogs (js/brands.js) σε ένα πλέγμα από κάρτες με λογότυπο
// (js/brand-logos.js) — ή τα αρχικά του brand στο χρώμα του όταν δεν υπάρχει λογότυπο — όνομα και πλήθος προϊόντων (js/brand-stats.js).
(function () {
  const B = window.BRAND_CATALOGS || {}, LOGOS = window.BRAND_LOGOS || {}, STATS = window.BRAND_STATS || {};
  const grid = document.getElementById("brand-grid"), empty = document.getElementById("brand-empty");
  const search = document.getElementById("brand-search"), sort = document.getElementById("brand-sort");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const brands = Object.entries(B).map(([key, c]) => ({ key, ...c, stats: STATS[key] || { products: 0, priced: 0 }, logo: LOGOS[key] || null }));
  const total = brands.reduce((s, b) => s + b.stats.products, 0);
  document.getElementById("brands-summary").textContent = `${brands.length} εταιρίες · ${total.toLocaleString("el-GR")} προϊόντα. Επιλέξτε εταιρία για να δείτε τον κατάλογό της.`;

  function card(b) {
    const logo = b.logo
      ? `<img src="${esc(b.logo)}" alt="${esc(b.name)}" loading="lazy" class="max-h-14 max-w-full object-contain transition group-hover:scale-105">`
      : `<span class="w-14 h-14 rounded-full flex items-center justify-center text-white font-extrabold text-lg shadow" style="background:${esc(b.accent || "#475569")}">${esc(b.initials || b.name.slice(0, 2).toUpperCase())}</span>`;
    const st = b.stats;
    return `<a href="${esc(b.page)}" class="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 transition p-4 flex flex-col items-center text-center">
      <div class="h-20 w-full flex items-center justify-center mb-3">${logo}</div>
      <div class="font-semibold text-slate-800 leading-tight">${esc(b.name)}</div>
      <div class="mt-1 text-xs text-slate-500">${st.products} προϊόντα${st.priced ? ` · <span class="text-emerald-700">${st.priced} με τιμή</span>` : ""}</div>
    </a>`;
  }
  function render() {
    const q = norm(search.value.trim());
    let list = brands.filter(b => !q || norm(b.name + " " + b.host + " " + b.key).includes(q));
    const by = sort.value;
    list.sort((a, b) => by === "products" ? b.stats.products - a.stats.products : by === "priced" ? b.stats.priced - a.stats.priced : a.name.localeCompare(b.name, "el"));
    grid.innerHTML = list.map(card).join("");
    empty.classList.toggle("hidden", list.length > 0);
  }
  search.addEventListener("input", render); sort.addEventListener("change", render);
  render();

  // ── Μαζική λήψη XLSX: επιλεγμένες εταιρίες × φίλτρο (CatalogExport.flags/passes — ίδια λογική με τις σελίδες brand) ──
  const CE = window.CatalogExport, BU = window.BRAND_CATALOGS_UTIL;
  const modeEl = document.getElementById("bx-mode"), layoutEl = document.getElementById("bx-layout"), summaryEl = document.getElementById("bx-summary");
  const listEl = document.getElementById("bx-brands"), countEl = document.getElementById("bx-count"), statusEl = document.getElementById("bx-status"), btn = document.getElementById("bx-download");
  if (!CE || !modeEl) return;
  modeEl.innerHTML = CE.MODES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name, "el"));
  const selected = new Set(sorted.map(b => b.key));
  const countFor = (b, m) => ((b.stats.modes || {})[m] ?? (m === "all" ? b.stats.products : 0));
  function renderChips() {
    const m = modeEl.value;
    listEl.innerHTML = sorted.map(b => {
      const n = countFor(b, m), on = selected.has(b.key);
      return `<label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer select-none transition ${on ? "bg-blue-50 border-blue-300 text-blue-900" : "bg-white border-slate-200 text-slate-500"} ${n ? "" : "opacity-50"}">
        <input type="checkbox" data-key="${b.key}" ${on ? "checked" : ""} class="rounded w-3.5 h-3.5"> ${esc(b.name)} <span class="tabular-nums ${on ? "text-blue-700" : "text-slate-400"}">${n}</span></label>`;
    }).join("");
    const keys = sorted.filter(b => selected.has(b.key));
    const total = keys.reduce((s, b) => s + countFor(b, m), 0);
    countEl.textContent = `(${total.toLocaleString("el-GR")} προϊόντα · ${keys.length} εταιρίες)`;
    btn.disabled = total === 0;
  }
  listEl.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.key; if (!k) return; e.target.checked ? selected.add(k) : selected.delete(k); renderChips(); });
  document.querySelectorAll("[data-bx-select]").forEach(b => b.addEventListener("click", () => {
    const v = b.dataset.bxSelect; selected.clear();
    if (v === "all") sorted.forEach(x => selected.add(x.key));
    if (v === "priced") sorted.forEach(x => { if (x.stats.priced > 0) selected.add(x.key); });
    renderChips();
  }));
  modeEl.addEventListener("change", renderChips);
  renderChips();

  // Τα δεδομένα κάθε εταιρίας φορτώνονται μόνο όταν χρειάζονται (js/<key>-supplier/overrides/supplemental/sections.js)
  const loaded = new Set();
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  async function loadBrand(key) {
    if (loaded.has(key)) return;
    for (const part of ["supplier", "overrides", "supplemental", "sections"]) await loadScript(`js/${key}-${part}.js?v=5`);
    loaded.add(key);
  }
  const fileSafe = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  btn.addEventListener("click", async () => {
    const m = modeEl.value, layout = layoutEl.value;
    const chosen = sorted.filter(b => selected.has(b.key) && countFor(b, m) > 0);
    if (!chosen.length) return;
    btn.disabled = true;
    try {
      const perBrand = [], summary = [];
      for (let i = 0; i < chosen.length; i++) {
        const b = chosen[i], cfg = B[b.key];
        statusEl.textContent = `Φόρτωση ${i + 1}/${chosen.length}: ${b.name}…`;
        await loadBrand(b.key);
        const data = BU.data(cfg);
        const enrich = bc => BU.enrichmentFor(cfg, bc, data);
        const products = data.supplier.filter(p => CE.passes(CE.flags(p, enrich(p.barcode)), m));
        perBrand.push({ b, cfg, data, enrich, products });
        summary.push([b.name, products.length, data.supplier.length, b.stats.priced, b.page]);
      }
      statusEl.textContent = "Δημιουργία αρχείου…";
      await new Promise(r => setTimeout(r, 30));
      const opts = x => ({ products: x.products, enrichmentFor: x.enrich, sectionLabels: x.data.sections, prettify: n => BU.prettify(n, x.cfg),
        fallbackDesc: p => (x.cfg.fallbackDesc || "{name}").replace("{name}", p.name) });
      const sheets = [];
      if (summaryEl.checked) sheets.push({ name: "Περίληψη", headers: ["Εταιρία", "Προϊόντα στο αρχείο", "Σύνολο καταλόγου", "Με τιμή προμηθευτή", "Σελίδα"], rows: summary });
      if (layout === "single") {
        const cols = []; perBrand.forEach(x => (x.cfg.exportSections || []).forEach(c => { if (!cols.includes(c)) cols.push(c); }));
        let headers = null; const rows = [];
        for (const x of perBrand) { const r = CE.buildRows({ ...opts(x), tabColumns: cols }); headers = headers || ["Εταιρία", ...r.headers]; r.rows.forEach(row => rows.push([x.b.name, ...row])); }
        sheets.push({ name: "Κατάλογος", headers, rows });
      } else {
        for (const x of perBrand) { const r = CE.buildRows({ ...opts(x), tabColumns: x.cfg.exportSections || [] }); sheets.push({ name: x.cfg.sheetName || x.b.name, headers: r.headers, rows: r.rows }); }
      }
      const total = perBrand.reduce((s, x) => s + x.products.length, 0);
      const who = chosen.length === brands.length ? "oles-oi-etairies" : chosen.length === 1 ? fileSafe(chosen[0].key) : `${chosen.length}-etairies`;
      CE.downloadBook(`katalogos-${who}-${m}-${total}.xlsx`, sheets);
      statusEl.textContent = `✔ Κατέβηκε: ${total.toLocaleString("el-GR")} προϊόντα από ${chosen.length} εταιρίες${layout === "single" ? " σε ένα φύλλο" : " (ένα φύλλο ανά εταιρία)"}.`;
    } catch (e) { statusEl.textContent = "⚠️ Σφάλμα: " + e.message; }
    finally { btn.disabled = false; }
  });
})();
