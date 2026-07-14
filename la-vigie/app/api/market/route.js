import { INSTRUMENTS } from "../../../lib/instruments";
import { sma, trend, volatility, signal } from "../../../lib/indicators";

/* Route serveur : va chercher les vrais prix chez Stooq (CSV), calcule
   tendances + moyennes mobiles, renvoie du JSON prêt à afficher.
   Exécutée côté serveur → aucun souci CORS. Mise en cache 5 min. */

export const revalidate = 300;          // cache ISR : 5 min
export const dynamic = "force-static";  // sert le cache, régénère en arrière-plan

const HIST_DAYS = 120; // clôtures conservées pour le graphe + les MM

const UA = {
  "User-Agent":
    "Mozilla/5.0 (compatible; LaVigie/1.0; +https://vercel.app) commodity-watch",
};

async function fetchText(url) {
  const res = await fetch(url, { headers: UA, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  if (!txt || txt.startsWith("<") || /exceeded|limit/i.test(txt.slice(0, 200)))
    throw new Error("réponse invalide / quota Stooq");
  return txt;
}

/** Parse le CSV historique Stooq (Date,Open,High,Low,Close,Volume). */
function parseHistory(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    const d = p[0];
    const c = parseFloat(p[4]);
    if (d && Number.isFinite(c)) rows.push({ d, c });
  }
  return rows.slice(-HIST_DAYS);
}

async function loadInstrument(inst) {
  const url = `https://stooq.com/q/d/l/?s=${inst.stooq}&i=d`;
  const rows = parseHistory(await fetchText(url));
  if (rows.length < 2) throw new Error("historique vide");

  const closes = rows.map((r) => r.c);
  const price = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const chg = ((price - prev) / prev) * 100;

  const m20 = sma(closes, 20);
  // série allégée pour le graphe (90 pts max) avec MM20 alignée
  const series = rows.slice(-90).map((r, i, a) => {
    const gi = rows.length - a.length + i;
    return { d: r.d, v: r.c, m20: m20[gi] };
  });

  return {
    sym: inst.sym,
    price,
    chg: +chg.toFixed(2),
    trend: trend(closes),
    sig: signal(closes),
    vol: volatility(closes),
    series,
    updated: rows[rows.length - 1].d,
    live: true,
  };
}

export async function GET() {
  const settled = await Promise.allSettled(INSTRUMENTS.map(loadInstrument));
  const data = {};
  let anyLive = false;

  settled.forEach((s, i) => {
    const inst = INSTRUMENTS[i];
    if (s.status === "fulfilled") {
      data[inst.sym] = s.value;
      anyLive = true;
    } else {
      data[inst.sym] = { sym: inst.sym, live: false, error: String(s.reason?.message || s.reason) };
    }
  });

  return Response.json(
    { ok: anyLive, at: new Date().toISOString(), data },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
