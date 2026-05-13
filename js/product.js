// Product detail page

const root = document.getElementById("product-root");
const params = new URLSearchParams(location.search);
const productId = params.get("id");

const product = PRODUCTS.find(p => p.id === productId);

if (!product) {
  root.innerHTML = `
    <div class="text-center py-20">
      <h2 class="text-2xl font-bold text-slate-700">Δεν βρέθηκε το προϊόν</h2>
      <p class="mt-2 text-slate-500">Ίσως ο σύνδεσμος είναι σπασμένος ή το προϊόν έχει αφαιρεθεί.</p>
      <a href="index.html" class="mt-6 inline-block px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium">Επιστροφή στον κατάλογο</a>
    </div>
  `;
} else {
  render(product);
}

function render(p) {
  const brand = BRANDS[p.brand];
  const parsed = parseProduct(p);
  document.title = `${p.name} — ${brand.name}`;

  const related = PRODUCTS.filter(x => x.brand === p.brand && x.id !== p.id).slice(0, 6);

  root.innerHTML = `
    <nav class="text-sm text-slate-500 mb-6 flex flex-wrap gap-1.5 items-center">
      <a href="index.html" class="hover:text-amber-600">Κατάλογος</a>
      <span>›</span>
      <a href="index.html#brand-${p.brand}" class="hover:text-amber-600" style="color:${brand.accent}">${brand.name}</a>
      <span>›</span>
      <span class="text-slate-700">${escapeHtml(p.name)}</span>
    </nav>

    <div class="grid md:grid-cols-2 gap-8 lg:gap-12">
      <div>
        <div class="relative aspect-square rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-sm">
          <div id="ph" class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-6xl"
               style="--accent:${brand.accent};--accent-dark:${shade(brand.accent,-25)}">
            ${brand.name.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
          </div>
          <img id="hero-img" class="product-img absolute inset-0 w-full h-full p-6 opacity-0 transition-opacity" alt="${escapeHtml(p.name)}">
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          ${parsed.spf ? `<span class="px-3 py-1 rounded-full text-sm font-bold text-white" style="background:${brand.accent}">SPF ${parsed.spf}</span>` : ""}
          ${parsed.isNew ? `<span class="px-3 py-1 rounded-full text-sm font-bold bg-emerald-500 text-white">ΝΕΟ 2026</span>` : ""}
          ${parsed.isPromo ? `<span class="px-3 py-1 rounded-full text-sm font-bold bg-rose-500 text-white">PROMO</span>` : ""}
        </div>
      </div>

      <div>
        <div class="inline-block text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md mb-3" style="background:${brand.accent}1a;color:${brand.accent}">
          ${brand.name}
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">${escapeHtml(p.name)}</h1>

        <div class="mt-5 flex items-baseline gap-3">
          <span class="text-3xl font-bold text-slate-900">${fmtPrice(p.price)}</span>
          <span class="text-sm text-slate-500">χονδρική τιμή</span>
        </div>

        <p class="mt-6 text-slate-700 leading-relaxed" id="description">${brandDescription(p, parsed)}</p>

        <dl class="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt class="text-slate-500">Κωδικός</dt>
          <dd class="font-medium text-slate-800">${escapeHtml(p.id)}</dd>
          <dt class="text-slate-500">Barcode (EAN)</dt>
          <dd class="font-mono text-slate-800">${escapeHtml(p.barcode)}</dd>
          ${parsed.spf ? `<dt class="text-slate-500">Δείκτης προστασίας</dt><dd class="font-medium text-slate-800">SPF ${parsed.spf}</dd>` : ""}
          ${parsed.volume ? `<dt class="text-slate-500">Συσκευασία</dt><dd class="font-medium text-slate-800">${parsed.volume}</dd>` : ""}
          ${parsed.types.length ? `<dt class="text-slate-500">Τύπος</dt><dd class="font-medium text-slate-800">${parsed.types.join(", ")}</dd>` : ""}
          ${parsed.areas.length ? `<dt class="text-slate-500">Περιοχή</dt><dd class="font-medium text-slate-800">${parsed.areas.join(", ")}</dd>` : ""}
          ${parsed.audience.length ? `<dt class="text-slate-500">Χαρακτηριστικά</dt><dd class="font-medium text-slate-800">${parsed.audience.join(", ")}</dd>` : ""}
          <dt class="text-slate-500">Εταιρία</dt>
          <dd class="font-medium text-slate-800">${brand.name}</dd>
        </dl>

        <div id="obf-extra" class="mt-6"></div>
      </div>
    </div>

    ${related.length ? `
      <section class="mt-16">
        <h2 class="text-xl font-bold text-slate-800 mb-4">Άλλα από ${escapeHtml(brand.name)}</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" id="related"></div>
      </section>
    ` : ""}
  `;

  // Load hero image from OBF
  const heroImg = document.getElementById("hero-img");
  const ph = document.getElementById("ph");
  fetchOBF(p.barcode).then(data => {
    const url = imageUrlFor(p.barcode, data);
    if (url) {
      heroImg.onload = () => {
        heroImg.style.opacity = "1";
        ph.style.opacity = "0";
      };
      heroImg.src = url;
    }
    renderOBFExtra(data);
  });

  // Related
  const relWrap = document.getElementById("related");
  if (relWrap) {
    related.forEach(r => relWrap.appendChild(miniCard(r, brand)));
  }
}

function renderOBFExtra(data) {
  const wrap = document.getElementById("obf-extra");
  if (!data) return;
  const blocks = [];

  if (data.ingredients_text && data.ingredients_text.trim()) {
    blocks.push(`
      <details class="mt-3 p-4 rounded-xl bg-slate-100">
        <summary class="cursor-pointer font-semibold text-slate-800">Συστατικά (INCI)</summary>
        <p class="mt-2 text-sm text-slate-700 leading-relaxed">${escapeHtml(data.ingredients_text)}</p>
      </details>
    `);
  }

  if (data.product_name && data.product_name.toLowerCase() !== "") {
    blocks.unshift(`
      <div class="text-sm text-slate-500">
        <span class="font-semibold text-slate-700">Επίσημο όνομα προϊόντος:</span> ${escapeHtml(data.product_name)}
      </div>
    `);
  }

  if (blocks.length) {
    wrap.innerHTML = `<div class="border-t pt-4">${blocks.join("")}</div>`;
  }
}

function miniCard(p, brand) {
  const parsed = parseProduct(p);
  const a = document.createElement("a");
  a.href = `product.html?id=${encodeURIComponent(p.id)}`;
  a.className = "product-card block bg-white rounded-xl overflow-hidden border border-slate-200";

  const wrap = document.createElement("div");
  wrap.className = "aspect-square relative";
  wrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-xl"
         style="--accent:${brand.accent};--accent-dark:${shade(brand.accent,-20)}">
      ${brand.name.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
    </div>
    <img class="product-img absolute inset-0 w-full h-full p-2 opacity-0 transition-opacity" alt="${escapeHtml(p.name)}" loading="lazy">
    ${parsed.spf ? `<span class="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold rounded text-white" style="background:${brand.accent}">SPF ${parsed.spf}</span>` : ""}
  `;
  a.appendChild(wrap);

  const body = document.createElement("div");
  body.className = "p-2";
  body.innerHTML = `
    <p class="text-xs text-slate-700 line-clamp-2 leading-tight min-h-[2rem]">${escapeHtml(p.name)}</p>
    <p class="text-xs font-bold text-slate-900 mt-1">${fmtPrice(p.price)}</p>
  `;
  a.appendChild(body);

  // Async OBF
  fetchOBF(p.barcode).then(data => {
    const url = imageUrlFor(p.barcode, data);
    if (!url) return;
    const img = wrap.querySelector("img");
    img.onload = () => { img.style.opacity = "1"; };
    img.src = url;
  });

  return a;
}

function brandDescription(p, parsed) {
  const brand = BRANDS[p.brand];
  const bits = [];

  const intros = {
    apivita: "Από τη γραμμή Bee Sun Safe της APIVITA, εμπνευσμένη από την προστατευτική δύναμη της μέλισσας και τη φύση της Ελλάδας.",
    bioderma: "Από τη Photoderm της Bioderma με αποκλειστική τεχνολογία Cellular Bioprotection™ για ολοκληρωμένη προστασία σε κυτταρικό επίπεδο.",
    frezyderm: "Ελληνικής παραγωγής από τη Frezyderm, με ασφαλή & καινοτόμα φίλτρα και εξειδικευμένες συνθέσεις για κάθε ανάγκη.",
    freshline: "Από τη Fresh Line, εμπνευσμένη από την αρχαία ελληνική παράδοση καλλωπισμού με φυσικά συστατικά.",
    heliodor: "Από τη γραμμή Heliodor της Pharmasept, με δερματολογικά ελεγμένη σύνθεση & υψηλή φωτοπροστασία.",
    korres: "Από τη γραμμή αντηλιακών Korres με βιοενεργά συστατικά όπως Γιαούρτι, Κόκκινο Αμπέλι & Αιγαίο Bronze.",
    laroche: "Από τη La Roche-Posay Anthelios με τεχνολογία UVMune 400 για ολοκληρωμένη προστασία από UVB, UVA short & long.",
    vichy: "Από τη Vichy με Capital Soleil / Idéal Soleil, ενισχυμένο με αντιοξειδωτικά και Vichy Mineralizing Water.",
    cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια & υαλουρονικό για ενίσχυση του δερματικού φραγμού.",
    luxurious: "Από τη Luxurious Suncare, ελληνική γκάμα με ολοκληρωμένη φροντίδα για πρόσωπο, σώμα και μαλλιά.",
    aderma: "Από τη γραμμή Protect / Epitheliale της A-Derma με Βρώμη Realba® για πολύ ευαίσθητο δέρμα.",
    avene: "Από την Avène με Θερμομεταλλικό Νερό Avène — καταπραϋντικό και αντι-ερεθιστικό.",
    ducray: "Από τη γραμμή Melascreen της Ducray, ειδικά για δέρμα με τάση δυσχρωμιών και υπερμελάγχρωσης.",
    svr: "Από τη γραμμή Sun Secure της SVR — υψηλή προστασία με δερματολογική σύνθεση.",
    isdin: "Από την ISDIN με τις γραμμές Fotoprotector & Fotoultra — κορυφαία ισπανική φωτοπροστασία."
  };

  bits.push(intros[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`);

  if (parsed.spf) {
    if (parseInt(parsed.spf) >= 50) bits.push(`Πολύ υψηλή αντηλιακή προστασία (SPF ${parsed.spf}) ενάντια σε UVB και UVA ακτινοβολία.`);
    else if (parseInt(parsed.spf) >= 30) bits.push(`Υψηλή αντηλιακή προστασία (SPF ${parsed.spf}).`);
    else bits.push(`Αντηλιακή προστασία SPF ${parsed.spf}.`);
  }

  if (parsed.types.length) {
    bits.push(`Σε υφή ${parsed.types.join(" / ").toLowerCase()}${parsed.volume ? ", συσκευασία " + parsed.volume : ""}.`);
  } else if (parsed.volume) {
    bits.push(`Συσκευασία ${parsed.volume}.`);
  }

  if (parsed.audience.includes("Παιδικό")) bits.push("Κατάλληλο για παιδιά — ήπια & ασφαλής σύνθεση.");
  if (parsed.audience.includes("Ευαίσθητο δέρμα")) bits.push("Ειδικά για ευαίσθητο δέρμα.");
  if (parsed.audience.includes("Anti-Aging")) bits.push("Δράση κατά της φωτογήρανσης και των ρυτίδων.");
  if (parsed.audience.includes("Κατά πανάδων")) bits.push("Στοχευμένη δράση κατά των πανάδων και των δυσχρωμιών.");
  if (parsed.audience.includes("Λιπαρό/Μικτό")) bits.push("Ιδανικό για λιπαρό ή μικτό δέρμα — έλεγχος λιπαρότητας και ματ αποτέλεσμα.");
  if (parsed.audience.includes("Με χρώμα")) bits.push("Με χρωματισμό για ενιαία όψη και κάλυψη ατελειών.");
  if (parsed.audience.includes("Dry Touch")) bits.push("Λεπτόρρευστη υφή Dry Touch — απορροφάται γρήγορα χωρίς λιπαρότητα.");
  if (parsed.audience.includes("Sport")) bits.push("Ανθεκτικό σε ιδρώτα & νερό — κατάλληλο για αθλητικές δραστηριότητες.");
  if (parsed.audience.includes("Βρεγμένο δέρμα")) bits.push("Εφαρμόζεται και σε βρεγμένο δέρμα.");
  if (parsed.audience.includes("Οικογενειακό")) bits.push("Οικογενειακή συσκευασία — για όλη την οικογένεια.");

  return bits.join(" ");
}
