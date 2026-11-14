// scripts/lib-nuxt.mjs — devalue unflatten για το <script id="__NUXT_DATA__"> (Nuxt 3 SSR payload)
export function unflatten(arr) {
  const cache = new Map();
  const get = i => {
    if (typeof i !== "number") return i;
    if (i < 0) return undefined;
    if (cache.has(i)) return cache.get(i);
    const v = arr[i];
    if (v === null || typeof v !== "object") { cache.set(i, v); return v; }
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && ["ShallowReactive","Reactive","Ref","ShallowRef","EmptyRef","EmptyShallowRef","NuxtError","Date","Set","Map","RegExp","null","BigInt"].includes(v[0])) {
        const t = v[0];
        if (t === "Set") { const s = []; cache.set(i, s); for (const x of v.slice(1)) s.push(get(x)); return s; }
        if (t === "Map") { const m = {}; cache.set(i, m); for (let k = 1; k < v.length; k += 2) m[get(v[k])] = get(v[k + 1]); return m; }
        if (t === "Date" || t === "RegExp" || t === "BigInt") { cache.set(i, v[1]); return v[1]; }
        if (t === "null") { const o = {}; cache.set(i, o); for (let k = 1; k < v.length; k += 2) o[v[k]] = get(v[k + 1]); return o; }
        const r = get(v[1]); cache.set(i, r); return r;
      }
      const out = []; cache.set(i, out); for (const x of v) out.push(get(x)); return out;
    }
    const o = {}; cache.set(i, o); for (const [k, x] of Object.entries(v)) o[k] = get(x); return o;
  };
  return get(0);
}
export function nuxtData(html) {
  const m = String(html || "").match(/<script type="application\/json"[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? unflatten(JSON.parse(m[1])) : null;
}
