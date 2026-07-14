"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, ResponsiveContainer, YAxis, ReferenceLine, Tooltip,
} from "recharts";
import {
  Anchor, TrendingUp, TrendingDown, AlertTriangle, Check, X,
  Radio, Ship, Clock, Gauge, ShieldAlert, Bell, Minus, RefreshCw, Plus, Trash2,
} from "lucide-react";
import { INSTRUMENTS } from "../lib/instruments";

/* ═══════════════════════════════════════════════════════════════════
   LA VIGIE — Poste de veille matières premières
   ───────────────────────────────────────────────────────────────────
   • PRIX + TENDANCES : vrais, via /api/market (Stooq CSV, calcul serveur).
     Repli automatique sur des données de démo si le flux est indisponible.
   • CATALYSEURS / FIL D'ACTU : encore en démo (édite les constantes plus bas
     ou branche un calendrier éco / RSS — voir README).
   • COCKPIT DE RISQUE + ALERTES : 100 % client-side, calcul local.
   ═══════════════════════════════════════════════════════════════════ */

/* Valeurs de repli si Stooq est momentanément indisponible. */
const DEMO = {
  "OIL.WTI":   { price: 80.27, chg: 2.90,  seed: 7 },
  "OIL.BRENT": { price: 85.28, chg: 2.52,  seed: 3 },
  "NAT.GAS":   { price: 3.12,  chg: -1.24, seed: 11 },
  "XAU.USD":   { price: 2378.5,chg: 0.41,  seed: 2 },
  "XAG.USD":   { price: 29.80, chg: 0.63,  seed: 5 },
  "COPPER":    { price: 4.42,  chg: 0.28,  seed: 9 },
};

const CATALYSTS = [
  { when: "Auj. 22:00", label: "Blocus Hormuz — entrée en vigueur", tag: "Géopol.", hot: true },
  { when: "Demain", label: "Rollover contrat WTI", tag: "Technique", hot: false },
  { when: "Mer. 16:30", label: "Stocks pétrole EIA (hebdo)", tag: "Offre", hot: true },
  { when: "Jeu. 14:30", label: "CPI US — inflation", tag: "Macro", hot: false },
  { when: "18/07", label: "Réunion mensuelle OPEP+", tag: "Offre", hot: true },
];

const NEWS = [
  { src: "CNBC", t: "-2 h", h: "Le blocus des ports iraniens prend effet mardi 16 h (heure NY) ; le brut a bondi ~9 % sur l'annonce", tone: "up" },
  { src: "MarineTraffic", t: "-4 h", h: "Trafic dans le détroit d'Ormuz en chute de plus de 50 % sur une semaine", tone: "up" },
  { src: "IG", t: "-6 h", h: "Selon un analyste, peu de chances de revoir les sommets de guerre malgré l'escalade", tone: "down" },
  { src: "Citi", t: "-9 h", h: "La taxe de 20 % évoquée sur Hormuz relève le risque d'escalade militaire — scénario « plus haut plus longtemps »", tone: "up" },
  { src: "Sparta Comm.", t: "-11 h", h: "Coussin de stocks stratégiques qui s'amenuise : un repricing violent ne peut être exclu", tone: "up" },
];

/* ── palette ─────────────────────────────────────────────────────── */
const C = {
  bg: "#14110E", panel: "#1C1815", panel2: "#211C18", hair: "#302A24",
  ink: "#EDE4D6", mut: "#8C8172", brass: "#E0A43B", brassDim: "#8a6a2c",
  up: "#8BA85C", down: "#C86B4E", steel: "#6E8AA0",
};

const TREND_COL = { up: C.up, down: C.down, flat: C.steel, na: C.mut };

/* série pseudo-aléatoire de repli (mode démo uniquement) */
function demoSeries(seed, base, chg) {
  const pts = []; let v = base * (1 - chg / 100 / 1.4); let s = seed * 999;
  for (let i = 0; i < 48; i++) {
    s = (s * 9301 + 49297) % 233280; const r = s / 233280;
    v += (base - v) * 0.04 + (r - 0.45) * base * 0.006;
    pts.push({ i, v: +v.toFixed(3) });
  }
  pts[pts.length - 1].v = base;
  return pts;
}

const fmt = (n, dec = 2) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LaVigie() {
  /* ── flux marché ── */
  const [market, setMarket] = useState(null);       // { ok, at, data:{sym:{...}} }
  const [status, setStatus] = useState("loading");  // loading | live | demo
  const [lastFetch, setLastFetch] = useState(null);

  const loadMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      const json = await res.json();
      setMarket(json);
      setStatus(json.ok ? "live" : "demo");
      setLastFetch(new Date());
    } catch {
      setStatus("demo");
    }
  }, []);

  useEffect(() => {
    loadMarket();
    const id = setInterval(loadMarket, 300000); // rafraîchit toutes les 5 min
    return () => clearInterval(id);
  }, [loadMarket]);

  /* watchlist = instruments + données live (sinon repli démo) */
  const rows = useMemo(() => {
    return INSTRUMENTS.map((inst) => {
      const live = market?.data?.[inst.sym];
      if (live && live.live) {
        return { ...inst, ...live, isLive: true };
      }
      const d = DEMO[inst.sym] || { price: 0, chg: 0, seed: 1 };
      return { ...inst, price: d.price, chg: d.chg, seed: d.seed, isLive: false, trend: null,
               series: demoSeries(d.seed, d.price, d.chg) };
    });
  }, [market]);

  const [selSym, setSelSym] = useState(INSTRUMENTS[0].sym);
  const sel = rows.find((r) => r.sym === selSym) || rows[0];

  /* ── cockpit de risque (état) ── */
  const [capital, setCapital] = useState(1660);
  const [riskPct, setRiskPct] = useState(2);
  const [entry, setEntry] = useState(85.34);
  const [stop, setStop] = useState(83.47);
  const [target, setTarget] = useState(90);
  const [barrels, setBarrels] = useState(1000);
  const [eurUsd, setEurUsd] = useState(1.146);
  const [showPlan, setShowPlan] = useState(false);

  const r = useMemo(() => {
    const eu = 1 / eurUsd;
    const riskEUR = capital * (riskPct / 100);
    const stopDist = Math.abs(entry - stop);
    const rewDist = Math.abs(target - entry);
    const perLotRisk = stopDist * barrels * eu;
    const maxLots = perLotRisk > 0 ? riskEUR / perLotRisk : 0;
    const gainEUR = maxLots * rewDist * barrels * eu;
    const notionnel = maxLots * entry * barrels * eu;
    const marge = notionnel * 0.10;
    const rr = stopDist > 0 ? rewDist / stopDist : 0;
    const dir = target >= entry ? "long" : "short";
    return { riskEUR, stopDist, rewDist, maxLots, gainEUR, notionnel, marge, rr, dir };
  }, [capital, riskPct, entry, stop, target, barrels, eurUsd]);

  const CHECKS = [
    "J'entre sur un repli, pas en achetant le sommet d'une bougie verte",
    "Le catalyseur n'est pas déjà public et pricé par le marché",
    "Mon stop est défini AVANT d'entrer, pas déplacé après",
    "Je ne risque pas plus que mon % de capital fixé",
    "Ma marge libre reste > 30 % après la position",
    "Je ne suis pas poussé par le FOMO ou l'euphorie d'un gain récent",
  ];
  const [checks, setChecks] = useState(Array(CHECKS.length).fill(false));
  const green = checks.every(Boolean);
  const rrOk = r.rr >= 1.8;
  const riskOk = riskPct <= 2;
  const go = green && rrOk && riskOk;

  /* ── alertes de conditions (localStorage) ── */
  const [alerts, setAlerts] = useState([]);
  const [aSym, setASym] = useState(INSTRUMENTS[0].sym);
  const [aKind, setAKind] = useState("below");
  const [aVal, setAVal] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lavigie.alerts");
      if (raw) setAlerts(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("lavigie.alerts", JSON.stringify(alerts)); } catch {}
  }, [alerts]);

  const priceOf = useCallback((sym) => rows.find((x) => x.sym === sym), [rows]);

  const evalAlert = useCallback((a) => {
    const row = priceOf(a.sym);
    if (!row) return { fired: false, txt: "—" };
    if (a.kind === "above") return { fired: row.price >= a.value, txt: `${fmt(row.price, row.dec)} ${row.price >= a.value ? "≥" : "<"} ${a.value}` };
    if (a.kind === "below") return { fired: row.price <= a.value, txt: `${fmt(row.price, row.dec)} ${row.price <= a.value ? "≤" : ">"} ${a.value}` };
    return { fired: Math.abs(row.chg) >= a.value, txt: `var. ${row.chg >= 0 ? "+" : ""}${row.chg}% vs seuil ±${a.value}%` };
  }, [priceOf]);

  const addAlert = () => {
    const v = parseFloat(aVal);
    if (!Number.isFinite(v)) return;
    setAlerts((p) => [...p, { id: Date.now(), sym: aSym, kind: aKind, value: v }]);
    setAVal("");
  };
  const rmAlert = (id) => setAlerts((p) => p.filter((a) => a.id !== id));

  const firedCount = alerts.filter((a) => evalAlert(a).fired).length;

  /* données graphe */
  const chartData = sel?.series || [];
  const hasMA = chartData.some((p) => p.m20 != null);

  const kindLabel = { above: "au-dessus de", below: "en-dessous de", move: "varie de ±" };
  const statusMeta = {
    loading: { c: C.mut, t: "Connexion…" },
    live: { c: C.up, t: "En direct · Stooq" },
    demo: { c: C.brass, t: "Mode démo" },
  }[status];

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .disp { font-family: 'Fraunces', serif; }
        .eyebrow { letter-spacing: .22em; text-transform: uppercase; font-size: 10px; }
        .card { background: ${C.panel}; border: 1px solid ${C.hair}; border-radius: 10px; }
        .row-btn { transition: background .15s, border-color .15s; }
        .row-btn:hover { background: ${C.panel2}; }
        input[type=number]{ -moz-appearance: textfield; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .fld { background: ${C.bg}; border: 1px solid ${C.hair}; color: ${C.ink};
               border-radius: 7px; padding: 8px 10px; width: 100%; font-family: 'IBM Plex Mono', monospace;
               font-variant-numeric: tabular-nums; outline: none; }
        .fld:focus { border-color: ${C.brassDim}; }
        select.fld { -webkit-appearance: none; appearance: none; cursor: pointer; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        .live { animation: pulse 2.2s ease-in-out infinite; }
        @keyframes rise { from{opacity:0; transform: translateY(8px)} to{opacity:1; transform:none} }
        .rise { animation: rise .5s ease both; }
        @media (prefers-reduced-motion: reduce){ .live,.rise{animation:none} }
        @media (max-width: 820px){ .grid2{ grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 60px" }}>

        {/* ── MASTHEAD ── */}
        <header className="rise" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, paddingBottom: 16, borderBottom: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(145deg, ${C.brass}, ${C.brassDim})`, display: "grid", placeItems: "center", boxShadow: `0 0 24px ${C.brass}22` }}>
              <Anchor size={22} color={C.bg} strokeWidth={2.4} />
            </div>
            <div>
              <div className="disp" style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, letterSpacing: "-.01em" }}>La Vigie</div>
              <div className="eyebrow" style={{ color: C.mut, marginTop: 5 }}>Poste de veille · matières premières</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={loadMarket} className="row-btn" title="Rafraîchir"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 20, background: C.panel, border: `1px solid ${C.hair}`, cursor: "pointer", color: C.ink }}>
              <span className={status === "loading" ? "live" : ""} style={{ width: 8, height: 8, borderRadius: 8, background: statusMeta.c, display: "inline-block" }} />
              <span className="eyebrow" style={{ color: C.ink }}>{statusMeta.t}</span>
              <RefreshCw size={12} color={C.mut} />
            </button>
          </div>
        </header>

        {/* ── GÉOPOL BANNER (contexte éditable — démo) ── */}
        <div className="rise card" style={{ marginTop: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, borderColor: C.brassDim, background: `linear-gradient(90deg, ${C.panel}, ${C.bg})` }}>
          <Ship size={18} color={C.brass} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <span className="eyebrow" style={{ color: C.brass, marginRight: 10 }}>Prime de risque · Ormuz</span>
            <span style={{ fontSize: 13, color: C.ink }}>Blocus effectif ce soir 22:00 · trafic −52 % s/s · événement <b>binaire</b> — repli possible sur toute annonce d'apaisement</span>
          </div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: C.brass }}>ÉLEVÉ</div>
        </div>

        {/* ── GRID ── */}
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr)", gap: 16, marginTop: 16 }}>

          {/* LEFT — watchlist */}
          <section className="card rise" style={{ padding: 4 }}>
            <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="disp" style={{ fontSize: 17, fontWeight: 600 }}>Surveillance</span>
              <span className="eyebrow" style={{ color: status === "live" ? C.up : C.mut }}>{status === "live" ? "clôtures Stooq" : "démo"}</span>
            </div>
            {rows.map((w) => {
              const active = w.sym === sel.sym; const up = w.chg >= 0;
              const tcol = w.trend ? TREND_COL[w.trend.state] : C.mut;
              return (
                <button key={w.sym} onClick={() => setSelSym(w.sym)} className="row-btn"
                  style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: active ? C.panel2 : "transparent", border: "none", borderLeft: `2px solid ${active ? C.brass : "transparent"}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {w.sym}
                      {w.trend && (
                        <span title={w.trend.reason} style={{ display: "inline-flex", alignItems: "center", gap: 2, color: tcol }}>
                          {w.trend.state === "up" ? <TrendingUp size={11} /> : w.trend.state === "down" ? <TrendingDown size={11} /> : <Minus size={11} />}
                        </span>
                      )}
                      {w.sig?.buy && (
                        <span title={w.sig.reason} className="eyebrow" style={{ color: C.brass, border: `1px solid ${C.brassDim}`, borderRadius: 4, padding: "1px 5px", fontSize: 8.5 }}>achat</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{w.name}</div>
                  </div>
                  <div style={{ width: 62, height: 26 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={w.series}>
                        <defs><linearGradient id={`g${w.sym}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={up ? C.up : C.down} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={up ? C.up : C.down} stopOpacity={0} />
                        </linearGradient></defs>
                        <Area type="monotone" dataKey="v" stroke={up ? C.up : C.down} strokeWidth={1.3} fill={`url(#g${w.sym})`} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 74 }}>
                    <div className="mono" style={{ fontSize: 13 }}>{fmt(w.price, w.dec)}</div>
                    <div className="mono" style={{ fontSize: 12, color: up ? C.up : C.down, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 }}>
                      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? "+" : ""}{w.chg}%
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* RIGHT — chart */}
          <section className="card rise" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{sel.sym}</div>
                <div style={{ fontSize: 11, color: C.mut }}>{sel.name} · {sel.isLive ? "quotidien (90 j)" : "démo"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{fmt(sel.price, sel.dec)} <span style={{ fontSize: 13, color: C.mut }}>{sel.unit}</span></div>
                <div className="mono" style={{ fontSize: 13, color: sel.chg >= 0 ? C.up : C.down }}>{sel.chg >= 0 ? "+" : ""}{sel.chg}% {sel.isLive ? "· dernière séance" : "auj."}</div>
              </div>
            </div>

            {/* bandeau tendance */}
            {sel.trend && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${TREND_COL[sel.trend.state]}44` }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TREND_COL[sel.trend.state], fontWeight: 600 }} className="mono">
                  {sel.trend.state === "up" ? <TrendingUp size={14} /> : sel.trend.state === "down" ? <TrendingDown size={14} /> : <Minus size={14} />}
                  Tendance {sel.trend.label}
                </span>
                <span style={{ fontSize: 11.5, color: C.mut }}>{sel.trend.reason}</span>
                {sel.vol != null && <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: C.mut }}>vol. {sel.vol.toFixed(1)}%</span>}
              </div>
            )}

            {sel.sig?.buy && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: `${C.brass}18`, border: `1px solid ${C.brassDim}` }}>
                <TrendingUp size={16} color={C.brass} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: C.brass }}>
                    Potentiel d'achat · signal {sel.sig.level}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.ink, marginTop: 2 }}>{sel.sig.reason}</div>
                  <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4 }}>
                    Repérage technique — va vérifier, passe la checklist, dimensionne dans le cockpit. Pas un conseil d'investissement.
                  </div>
                </div>
              </div>
            )}
            {sel.sig?.level === "étendu" && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: `${C.down}12`, border: `1px solid ${C.down}55` }}>
                <ShieldAlert size={16} color={C.down} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11.5, color: C.ink }}>
                  <b style={{ color: C.down }}>Étendu</b> — {sel.sig.reason}
                </div>
              </div>
            )}

            <div style={{ height: 190, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -6 }}>
                  <YAxis domain={["dataMin", "dataMax"]} width={44} tick={{ fill: C.mut, fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.hair}`, borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                    labelStyle={{ color: C.mut }} formatter={(v, n) => [fmt(v, sel.dec), n === "m20" ? "MM20" : "prix"]} />
                  <Line type="monotone" dataKey="v" stroke={C.brass} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  {hasMA && <Line type="monotone" dataKey="m20" stroke={C.steel} strokeWidth={1.2} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls />}
                  {showPlan && <ReferenceLine y={entry} stroke={C.steel} strokeDasharray="4 3" strokeWidth={1} />}
                  {showPlan && <ReferenceLine y={stop} stroke={C.down} strokeDasharray="4 3" strokeWidth={1} />}
                  {showPlan && <ReferenceLine y={target} stroke={C.up} strokeDasharray="4 3" strokeWidth={1} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {hasMA && <Legend c={C.steel} t="MM20" v="" />}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginLeft: "auto", fontSize: 11, color: C.mut }}>
                <input type="checkbox" checked={showPlan} onChange={(e) => setShowPlan(e.target.checked)} />
                Superposer mon plan (entrée / stop / objectif)
              </label>
            </div>
            {showPlan && (
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <Legend c={C.steel} t="Entrée" v={entry} />
                <Legend c={C.down} t="Stop" v={stop} />
                <Legend c={C.up} t="Objectif" v={target} />
              </div>
            )}
          </section>
        </div>

        {/* ── ALERTES DE CONDITIONS ── */}
        <section className="card rise" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Bell size={15} color={C.brass} />
            <span className="disp" style={{ fontSize: 17, fontWeight: 600 }}>Alertes de conditions</span>
            {firedCount > 0 && (
              <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: C.brass, border: `1px solid ${C.brassDim}`, borderRadius: 20, padding: "2px 9px" }}>
                {firedCount} atteinte{firedCount > 1 ? "s" : ""}
              </span>
            )}
            <span className="eyebrow" style={{ color: C.mut, marginLeft: "auto" }}>tu définis · l'outil surveille</span>
          </div>
          <p style={{ fontSize: 11.5, color: C.mut, margin: "0 0 14px" }}>
            Une alerte te prévient quand une condition que <b>tu</b> as fixée est atteinte — puis tu vas vérifier et tu passes la checklist. Ce n'est <b>jamais</b> un ordre d'achat.
          </p>

          {/* composer */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <label style={{ flex: "1 1 150px" }}>
              <span className="eyebrow" style={{ color: C.mut, display: "block", marginBottom: 5 }}>Actif</span>
              <select className="fld" value={aSym} onChange={(e) => setASym(e.target.value)}>
                {INSTRUMENTS.map((i) => <option key={i.sym} value={i.sym}>{i.sym} · {i.name}</option>)}
              </select>
            </label>
            <label style={{ flex: "1 1 150px" }}>
              <span className="eyebrow" style={{ color: C.mut, display: "block", marginBottom: 5 }}>Condition</span>
              <select className="fld" value={aKind} onChange={(e) => setAKind(e.target.value)}>
                <option value="below">Prix passe en-dessous de</option>
                <option value="above">Prix passe au-dessus de</option>
                <option value="move">Variation du jour ≥ ±</option>
              </select>
            </label>
            <label style={{ flex: "0 1 120px" }}>
              <span className="eyebrow" style={{ color: C.mut, display: "block", marginBottom: 5 }}>{aKind === "move" ? "Seuil %" : "Prix"}</span>
              <input className="fld" type="number" step="0.01" value={aVal} placeholder={aKind === "move" ? "3" : "78.00"}
                onChange={(e) => setAVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAlert()} />
            </label>
            <button onClick={addAlert} className="row-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 7, cursor: "pointer",
                       background: `${C.brass}18`, border: `1px solid ${C.brassDim}`, color: C.brass, fontWeight: 600 }}>
              <Plus size={15} /> Armer
            </button>
          </div>

          {/* liste */}
          {alerts.length === 0 ? (
            <div style={{ fontSize: 12, color: C.mut, padding: "10px 0" }}>Aucune alerte armée. Fixe une condition ci-dessus (ex. « WTI passe sous 78 »).</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alerts.map((a) => {
                const ev = evalAlert(a);
                const row = priceOf(a.sym);
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 7,
                    background: ev.fired ? `${C.brass}14` : C.bg, border: `1px solid ${ev.fired ? C.brassDim : C.hair}` }}>
                    <span className={ev.fired ? "live" : ""} style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: ev.fired ? C.brass : C.mut }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 12.5 }}>
                        {a.sym} · {kindLabel[a.kind]} {a.value}{a.kind === "move" ? "%" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: ev.fired ? C.brass : C.mut, marginTop: 2 }}>
                        {ev.fired ? "Condition atteinte — va vérifier, puis checklist." : `En veille · ${ev.txt}`}
                      </div>
                    </div>
                    {row && !row.isLive && <span className="eyebrow" style={{ color: C.mut }}>démo</span>}
                    <button onClick={() => rmAlert(a.id)} className="row-btn" title="Supprimer"
                      style={{ background: "transparent", border: `1px solid ${C.hair}`, borderRadius: 6, padding: 5, cursor: "pointer", color: C.mut }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── CATALYSEURS ── */}
        <section className="card rise" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Radio size={15} color={C.brass} />
            <span className="disp" style={{ fontSize: 17, fontWeight: 600 }}>Catalyseurs à venir</span>
            <span className="eyebrow" style={{ color: C.mut, marginLeft: "auto" }}>ce qui va bouger les cours · démo</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {CATALYSTS.map((c, i) => (
              <div key={i} style={{ minWidth: 168, flex: "0 0 auto", padding: "12px 13px", borderRadius: 9, background: C.bg, border: `1px solid ${c.hot ? C.brassDim : C.hair}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12, color: c.hot ? C.brass : C.mut }}>{c.when}</span>
                  {c.hot && <span className="live" style={{ width: 6, height: 6, borderRadius: 6, background: C.brass }} />}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 7, lineHeight: 1.35 }}>{c.label}</div>
                <div className="eyebrow" style={{ color: C.mut, marginTop: 8 }}>{c.tag}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── COCKPIT + NEWS ── */}
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 16, marginTop: 16 }}>

          {/* COCKPIT DE RISQUE */}
          <section className="card rise" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Gauge size={16} color={C.brass} />
              <span className="disp" style={{ fontSize: 17, fontWeight: 600 }}>Cockpit de risque</span>
            </div>
            <p style={{ fontSize: 11.5, color: C.mut, margin: "0 0 14px" }}>Tu définis ce que tu risques. L'outil calcule la taille — jamais l'inverse.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Capital €" val={capital} set={setCapital} step={10} />
              <Field label="Risque %" val={riskPct} set={setRiskPct} step={0.5} />
              <Field label="Barils / lot" val={barrels} set={setBarrels} step={100} />
              <Field label="Entrée $" val={entry} set={setEntry} step={0.01} />
              <Field label="Stop $" val={stop} set={setStop} step={0.01} />
              <Field label="Objectif $" val={target} set={setTarget} step={0.01} />
            </div>

            <div style={{ marginTop: 14, padding: 14, borderRadius: 9, background: C.bg, border: `1px solid ${C.hair}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 18px" }}>
                <Read big t="Taille max" v={`${r.maxLots.toFixed(3)} lot`} sub={`${Math.round(r.maxLots * barrels)} barils`} />
                <Read big t="Ratio R:R" v={`1 : ${r.rr.toFixed(2)}`} sub={rrOk ? "correct" : "trop faible"} col={rrOk ? C.up : C.down} />
                <Read t="Perte au stop" v={`−${eur(r.riskEUR)} €`} col={C.down} />
                <Read t="Gain à l'objectif" v={`+${eur(r.gainEUR)} €`} col={C.up} />
                <Read t="Marge requise" v={`${eur(r.marge)} €`} sub="levier 1:10" />
                <Read t="Notionnel" v={`${eur(r.notionnel)} €`} />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ color: C.mut, marginBottom: 8 }}>Checklist pré-trade</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {CHECKS.map((c, i) => (
                  <button key={i} onClick={() => setChecks(p => p.map((x, j) => j === i ? !x : x))}
                    className="row-btn" style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: "8px 10px", borderRadius: 7, background: checks[i] ? `${C.up}14` : C.bg, border: `1px solid ${checks[i] ? C.up + "55" : C.hair}` }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "grid", placeItems: "center", background: checks[i] ? C.up : "transparent", border: `1px solid ${checks[i] ? C.up : C.mut}` }}>
                      {checks[i] && <Check size={13} color={C.bg} strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 12, color: checks[i] ? C.ink : C.mut }}>{c}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 9, display: "flex", alignItems: "center", gap: 12, background: go ? `${C.up}18` : `${C.down}12`, border: `1px solid ${go ? C.up : C.down}66` }}>
              {go ? <Check size={22} color={C.up} strokeWidth={2.6} /> : <ShieldAlert size={22} color={C.down} />}
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: go ? C.up : C.down }}>{go ? "FEU VERT" : "PAS ENCORE"}</div>
                <div style={{ fontSize: 11.5, color: C.mut, marginTop: 2 }}>
                  {go ? "Plan cohérent, risque maîtrisé, checklist complète." :
                    !riskOk ? "Réduis le risque à 2 % max du capital." :
                    !rrOk ? "Le ratio récompense/risque est trop faible (vise ≥ 1:1,8)." :
                    "Coche chaque point de la checklist en conscience."}
                </div>
              </div>
            </div>
          </section>

          {/* NEWS */}
          <section className="card rise" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={15} color={C.brass} />
              <span className="disp" style={{ fontSize: 17, fontWeight: 600 }}>Fil d'actu</span>
              <span className="eyebrow" style={{ color: C.mut, marginLeft: "auto" }}>démo</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {NEWS.map((n, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: i < NEWS.length - 1 ? `1px solid ${C.hair}` : "none", display: "flex", gap: 11 }}>
                  <span style={{ width: 3, borderRadius: 3, flexShrink: 0, background: n.tone === "up" ? C.up : C.down }} />
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 11, color: C.brass }}>{n.src}</span>
                      <span className="mono" style={{ fontSize: 10, color: C.mut }}>{n.t}</span>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{n.h}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10.5, color: C.mut, marginTop: 12, lineHeight: 1.5 }}>
              Rappel : l'info publique est presque toujours déjà dans le prix. Le fil sert au contexte, pas à courir après la bougie.
            </p>
          </section>
        </div>

        <footer style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.hair}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.mut }}>
            La Vigie · prix &amp; tendances {status === "live" ? "en direct (Stooq)" : "en démo"}
            {lastFetch && status === "live" ? ` · maj ${lastFetch.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
          <span style={{ fontSize: 11, color: C.mut }}>Outil d'aide à la décision — pas un conseil d'investissement</span>
        </footer>
      </div>
    </div>
  );
}

function Legend({ c, t, v }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 0, borderTop: `2px dashed ${c}` }} />
      <span style={{ fontSize: 11, color: C.mut }}>{t}</span>
      {v !== "" && <span className="mono" style={{ fontSize: 11 }}>{v}</span>}
    </div>
  );
}

function Field({ label, val, set, step }) {
  return (
    <label style={{ display: "block" }}>
      <span className="eyebrow" style={{ color: C.mut, display: "block", marginBottom: 5 }}>{label}</span>
      <input className="fld" type="number" step={step} value={val}
        onChange={(e) => set(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

function Read({ t, v, sub, col, big }) {
  return (
    <div>
      <div className="eyebrow" style={{ color: C.mut }}>{t}</div>
      <div className="mono" style={{ fontSize: big ? 20 : 15, fontWeight: 600, color: col || C.ink, marginTop: 3 }}>{v}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.mut, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
