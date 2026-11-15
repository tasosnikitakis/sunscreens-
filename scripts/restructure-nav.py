#!/usr/bin/env python3
# scripts/restructure-nav.py
# Μία φορά (και ξανά όταν προστίθεται brand): αφαιρεί από το nav όλων των σελίδων τα links των brand catalogs (js/brands.js)
# και βάζει ένα «🏷️ Εταιρίες» (brands.html) μετά το Vican. Στις σελίδες brand: το «Εταιρίες» ενεργό, breadcrumb «Εταιρίες › Brand»
# στη θέση της γραμμής πάνω από τον τίτλο, και φόρτωση του js/brand-logos.js (λογότυπο στο header από το brand-app.js).
import glob, os, re, subprocess, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.loads(subprocess.check_output(["node", "-e", 'global.window={};require("./js/brands.js");console.log(JSON.stringify(Object.fromEntries(Object.entries(window.BRAND_CATALOGS).map(([k,c])=>[c.page,{key:k,name:c.name}]))))'], cwd=ROOT))
ACTIVE = "px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold bg-slate-900 text-white transition flex items-center gap-1.5"
IDLE = "px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5"
pages = "|".join(re.escape(p) for p in cfg)
n = 0
for f in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
    name = os.path.basename(f)
    s = open(f, encoding="utf8").read()
    m = re.search(r"<nav[\s\S]*?</nav>", s)
    if not m: continue
    nav = m.group(0)
    nav2 = re.sub(r'\n?[ \t]*<a href="(?:%s)"[^>]*>[\s\S]*?</a>' % pages, "", nav)
    if 'href="brands.html"' not in nav2:
        is_brand = name in cfg or name == "brands.html"
        dt = ' data-tab="brands"' if 'data-tab="vican"' in nav2 else ""
        link = f'\n        <a href="brands.html"{dt} class="{ACTIVE if is_brand else IDLE}"><span>🏷️</span><span>Εταιρίες</span></a>'
        v = re.search(r'<a href="vican.html"[^>]*>[\s\S]*?</a>', nav2)
        if v: nav2 = nav2[:v.end()] + link + nav2[v.end():]
        else:
            mk = nav2.find('<a href="market.html"')
            nav2 = nav2[:mk] + link.strip() + "\n        " + nav2[mk:] if mk > 0 else nav2
    s = s.replace(nav, nav2)
    if name in cfg:
        c = cfg[name]
        s = re.sub(r'(<span class="inline-block w-2 h-2 bg-white rounded-full animate-pulse"></span>)\s*[^<]*(</div>)',
                   lambda mm: f'<a href="brands.html" class="hover:underline">Εταιρίες</a><span class="opacity-60">›</span><span>{c["name"]}</span>\n      {mm.group(2)}', s, count=1)
        if "js/brand-logos.js" not in s:
            s = s.replace('  <script src="js/brand-app.js', '  <script src="js/brand-logos.js?v=5"></script>\n  <script src="js/brand-app.js', 1)
    open(f, "w", encoding="utf8").write(s); n += 1
print("σελίδες:", n)
