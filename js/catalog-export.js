// Export φιλτραρισμένων προϊόντων σε XLSX από τον browser (Frezyderm, Lamberts, A-Derma).
// Ίδιες στήλες με τα αρχεία που παράγει το scripts/generate-catalog.mjs —
// αν αλλάξουν εκεί, αλλάζουν κι εδώ. Χρησιμοποιεί SheetJS (window.XLSX) αν
// έχει φορτωθεί, αλλιώς πέφτει σε CSV (UTF-8 BOM, ';').

window.CatalogExport = (() => {
  const MATCH_LABEL = { manual: "Χειροκίνητο", exact: "Ακριβές (GTIN)", high: "Αυτόματο", review: "Για έλεγχο" };

  function buildRows({ products, enrichmentFor, sectionLabels, prettify, fallbackDesc, tabColumns, categoryAttr }) {
    const headers = [
      "Όνομα", "Υπότιτλος", "Χονδρική τιμή (€)", "Λιανική τιμή (€)", "Περιγραφή", "Ιδιότητες", "Βασικά χαρακτηριστικά",
      // ενότητα με ίδιο όνομα με βασική στήλη (Περιγραφή, Χαρακτηριστικά, Συσκευασία) → «… (αναλυτικά)», ώστε να μη διπλασιάζονται οι τίτλοι
      ...tabColumns.map(t => ["Περιγραφή", "Χαρακτηριστικά", "Συσκευασία", "Υπότιτλος", "Κατηγορία"].includes(t) ? `${t} (αναλυτικά)` : t),
      "Συσκευασία", "Χαρακτηριστικά", "Κατηγορία", "Barcode (EAN)", "Παραλλαγές (variants)",
      "Φωτογραφία", "URL επίσημου site", "Πηγή", "Match", "Τιμοκατάλογος"
    ];
    const rows = products.map(p => {
      const e = enrichmentFor(p.barcode);
      const secKey = e.section || "diafora";
      const sectionLabel = (sectionLabels[secKey] && sectionLabels[secKey].name) || secKey;
      const attrs = e.attributes || {};
      const sections = e.sections || {};
      const otherAttrs = [
        ...Object.entries(attrs).filter(([k]) => k !== "Συσκευασία").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`),
        ...Object.entries(sections).filter(([k]) => !tabColumns.includes(k)).map(([k, v]) => `${k}: ${v}`)
      ].join(" | ");
      const localImg = (typeof getLocalImageFile === "function" && getLocalImageFile(p.barcode)) || "";
      const match = e.noFrezydermPage || e.noBrandPage ? "Χωρίς σελίδα" : (MATCH_LABEL[e.matchType] || "Αυτόματο");
      return [
        prettify(e.name || p.name), e.subtitle || "", p.wholesale || "", p.retail || "",
        e.description || fallbackDesc(p), (e.claims || []).join(" · "), (e.highlights || []).join(" • "),
        ...tabColumns.map(t => sections[t] || ""), attrs["Συσκευασία"] || "", otherAttrs, sectionLabel,
        p.barcode, (p.variants || []).filter(v => v !== p.barcode).join(", "),
        localImg || e.image || "", e.url || "", e.source || "", match,
        p.listed === false ? "Μόνο στο site (χωρίς τιμή)" : "Προμηθευτής"
      ];
    });
    return { headers, rows };
  }

  // Φίλτρα ποιότητας — ίδια λογική με τις κάρτες των σελίδων brand (brand-app.js) και τη σελίδα «Εταιρίες» (brands-page.js)
  const MODES = [
    ["all", "Όλα τα προϊόντα"],
    ["ok", "✅ Όλα ΟΚ (σελίδα + περιγραφή + εικόνα)"],
    ["issue", "⚠️ Με κάποιο θέμα"],
    ["complete", "Μόνο με πλήρη περιγραφή"],
    ["incomplete", "🔍 Μόνο με ανεπαρκή περιγραφή"],
    ["nopage", "⛔ Μόνο χωρίς σελίδα"],
    ["noprice", "💶 Μόνο χωρίς τιμή προμηθευτή"],
    ["priced", "💶 Μόνο με τιμή προμηθευτή"]
  ];
  function flags(p, e) {
    const q = typeof frezydermDescriptionQuality === "function" ? frezydermDescriptionQuality(e.description) : { ok: !!e.description };
    const img = (typeof getLocalImageUrl === "function" && p.barcode && getLocalImageUrl(p.barcode)) || e.image || null;
    return {
      needsReview: !q.ok, noPage: !!e.noBrandPage,
      noPrice: p.listed === false || !(p.wholesale > 0),   // listed:false = μόνο στο brand site, όχι στον τιμοκατάλογο
      allOk: !e.noBrandPage && q.ok && !e.review && !!img   // επίσημη σελίδα + πλήρης περιγραφή + εικόνα
    };
  }
  function passes(f, mode) {
    if (mode === "ok") return f.allOk;
    if (mode === "issue") return !f.allOk;
    if (mode === "complete") return !f.needsReview;
    if (mode === "incomplete") return f.needsReview;
    if (mode === "nopage") return f.noPage;
    if (mode === "noprice") return f.noPrice;
    if (mode === "priced") return !f.noPrice;
    return true;
  }
  // Όνομα φύλλου Excel: ≤31 χαρακτήρες, χωρίς []:*?/\ και μοναδικό
  function sheetName(name, used) {
    let base = String(name || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Sheet", n = base, i = 2;
    while (used.has(n.toLowerCase())) n = base.slice(0, 28) + " " + i++;
    used.add(n.toLowerCase()); return n;
  }
  // Πολλά φύλλα σε ένα αρχείο: sheets = [{ name, headers, rows }]
  function downloadBook(filename, sheets) {
    if (!window.XLSX) throw new Error("Δεν φορτώθηκε η βιβλιοθήκη XLSX");
    const wb = XLSX.utils.book_new(), used = new Set();
    for (const sh of sheets) {
      const ws = XLSX.utils.aoa_to_sheet([sh.headers, ...sh.rows]);
      ws["!cols"] = sh.headers.map((h, i) => ({ wch: Math.min(60, Math.max(10, ...[h, ...sh.rows.slice(0, 50).map(r => String(r[i] ?? ""))].map(x => x.length))) }));
      XLSX.utils.book_append_sheet(wb, ws, sheetName(sh.name, used));
    }
    XLSX.writeFile(wb, filename);
  }

  function download(filename, headers, rows, sheetName) {
    if (window.XLSX) {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map((h, i) => ({ wch: Math.min(60, Math.max(12, ...[h, ...rows.slice(0, 50).map(r => String(r[i] ?? ""))].map(s => s.length))) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Catalog");
      XLSX.writeFile(wb, filename);
      return;
    }
    // Fallback: CSV
    const cell = v => { const s = String(v ?? "").replace(/\r?\n/g, " "); return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [headers, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = filename.replace(/\.xlsx$/i, ".csv");
    document.body.appendChild(a); a.click(); a.remove();
  }

  return { buildRows, download, downloadBook, flags, passes, MODES };
})();
