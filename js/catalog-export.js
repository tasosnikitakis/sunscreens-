// Export φιλτραρισμένων προϊόντων σε XLSX από τον browser (Frezyderm, Lamberts).
// Ίδιες στήλες με τα αρχεία που παράγει το scripts/generate-catalog.mjs —
// αν αλλάξουν εκεί, αλλάζουν κι εδώ. Χρησιμοποιεί SheetJS (window.XLSX) αν
// έχει φορτωθεί, αλλιώς πέφτει σε CSV (UTF-8 BOM, ';').

window.CatalogExport = (() => {
  const MATCH_LABEL = { manual: "Χειροκίνητο", exact: "Ακριβές (GTIN)", high: "Αυτόματο", review: "Για έλεγχο" };

  function buildRows({ products, enrichmentFor, sectionLabels, prettify, fallbackDesc, tabColumns, categoryAttr }) {
    const headers = [
      "Όνομα", "Υπότιτλος", "Χονδρική τιμή (€)", "Λιανική τιμή (€)", "Περιγραφή", "Ιδιότητες", "Βασικά χαρακτηριστικά",
      ...tabColumns, "Συσκευασία", "Χαρακτηριστικά", "Κατηγορία", "Barcode (EAN)", "Παραλλαγές (variants)",
      "Φωτογραφία", "URL επίσημου site", "Πηγή", "Match"
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
        localImg || e.image || "", e.url || "", e.source || "", match
      ];
    });
    return { headers, rows };
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

  return { buildRows, download };
})();
