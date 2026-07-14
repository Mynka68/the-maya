/* Instruments surveillés. `stooq` = code Stooq (données), `sym` = affichage.
   Ajoute/retire une ligne ici et tout suit (watchlist, chart, alertes). */
export const INSTRUMENTS = [
  { sym: "OIL.WTI",   stooq: "cl.f",   name: "WTI · NYMEX",   unit: "USD", dec: 2 },
  { sym: "OIL.BRENT", stooq: "cb.f",   name: "Brent · ICE",   unit: "USD", dec: 2 },
  { sym: "NAT.GAS",   stooq: "ng.f",   name: "Gaz naturel",   unit: "USD", dec: 3 },
  { sym: "XAU.USD",   stooq: "xauusd", name: "Or",            unit: "USD", dec: 1 },
  { sym: "XAG.USD",   stooq: "xagusd", name: "Argent",        unit: "USD", dec: 2 },
  { sym: "COPPER",    stooq: "hg.f",   name: "Cuivre",        unit: "USD", dec: 3 },
];
