/* ═══════════════════════════════════════════════════════════════════
   Indicateurs — calcul local, transparent, explicable.
   Aucun signal « boîte noire ». Chaque tendance renvoie SA RAISON.
   ═══════════════════════════════════════════════════════════════════ */

/** Moyenne mobile simple sur `period` clôtures. Renvoie un tableau aligné
 *  (null tant qu'on n'a pas assez de points). */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= period) acc -= values[i - period];
    if (i >= period - 1) out[i] = acc / period;
  }
  return out;
}

/** Dernière valeur non-nulle d'une série. */
function last(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

/** État de tendance à partir des clôtures quotidiennes.
 *  Renvoie { state, label, reason, dist20, slope } — state ∈ up|down|flat|na */
export function trend(closes) {
  if (!closes || closes.length < 22) {
    return { state: "na", label: "Insuffisant", reason: "Pas assez d'historique.", dist20: null, slope: 0 };
  }
  const c = closes[closes.length - 1];
  const m20arr = sma(closes, 20);
  const m50arr = sma(closes, 50);
  const m20 = last(m20arr);
  const m50 = m50arr.length && last(m50arr) != null ? last(m50arr) : null;

  // pente de la MM20 sur ~10 séances (en %)
  const m20past = m20arr[m20arr.length - 11] ?? m20arr.find((x) => x != null);
  const slope = m20past ? ((m20 - m20past) / m20past) * 100 : 0;
  const dist20 = m20 ? ((c - m20) / m20) * 100 : null;

  let state = "flat";
  let reason = "";
  const above20 = c > m20;
  const stack = m50 != null ? (m20 > m50 ? "up" : m20 < m50 ? "down" : "flat") : "flat";

  if (above20 && (stack === "up" || m50 == null) && slope > 0.1) {
    state = "up";
    reason = m50 != null ? "Prix > MM20 > MM50, MM20 orientée à la hausse." : "Prix > MM20 en pente haussière.";
  } else if (!above20 && (stack === "down" || m50 == null) && slope < -0.1) {
    state = "down";
    reason = m50 != null ? "Prix < MM20 < MM50, MM20 orientée à la baisse." : "Prix < MM20 en pente baissière.";
  } else {
    state = "flat";
    reason = "Signaux mélangés (prix et moyennes non alignés) — range probable.";
  }

  const label = { up: "Haussière", down: "Baissière", flat: "Neutre" }[state];
  return { state, label, reason, dist20, slope, m20, m50 };
}

/** Potentiel d'achat — configuration technique favorable, transparente.
 *  Ce n'est PAS un ordre d'achat : c'est un repérage de contexte à VÉRIFIER
 *  (puis checklist + cockpit de risque). Logique = « repli en tendance », jamais « sommet ».
 *  Renvoie { buy, level, tag, reason }. */
export function signal(closes) {
  const t = trend(closes);
  if (t.state === "na") return { buy: false, level: null, tag: null, reason: "Historique insuffisant." };
  const d = t.dist20;

  // Tendance haussière ET prix revenu près de la MM20 = point d'entrée sur repli.
  if (t.state === "up" && d != null && d >= -2 && d <= 3) {
    const strong = t.m50 != null && t.m20 > t.m50 && t.slope > 1 && d <= 2;
    return {
      buy: true,
      level: strong ? "fort" : "modéré",
      tag: "Potentiel d'achat",
      reason: `Tendance haussière, prix ${d >= 0 ? "juste au-dessus de" : "sur"} la MM20 (${d.toFixed(1)} %) — repli, pas sommet.`,
    };
  }

  // Garde-fou anti-FOMO : haussier mais trop étendu = acheter ici = acheter le sommet.
  if (t.state === "up" && d != null && d > 6) {
    return {
      buy: false,
      level: "étendu",
      tag: "Étendu",
      reason: `Prix ${d.toFixed(1)} % au-dessus de la MM20 — acheter ici, c'est acheter le sommet. Attends un repli.`,
    };
  }

  return { buy: false, level: null, tag: null, reason: t.reason };
}

/** Volatilité relative : écart-type des variations quotidiennes sur 14 j, en %. */
export function volatility(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varc) * 100;
}
