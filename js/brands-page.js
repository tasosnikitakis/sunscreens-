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
})();
