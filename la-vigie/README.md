# La Vigie — poste de veille matières premières

Tableau de bord de veille + **cockpit de risque** pour le trading de matières premières (CFD).
Next.js 15 (App Router), React 18, recharts, lucide-react. Aucune autre dépendance.

## Ce qui est branché en vrai

- **Prix + tendances** — vrais, via la route serveur `app/api/market/route.js` qui interroge
  **Stooq** (CSV, côté serveur → pas de CORS), calcule les moyennes mobiles MM20/MM50,
  l'état de tendance (haussière / baissière / neutre **avec sa raison**) et la volatilité.
  Rafraîchi toutes les 5 min, mis en cache. **Repli automatique sur des données de démo**
  si Stooq est momentanément indisponible : l'appli s'affiche toujours.
- **Cockpit de risque** — taille de position, R:R, marge, checklist pré-trade. 100 % local, aucun réseau.
- **Alertes de conditions** — tu fixes une condition (prix franchi, variation du jour),
  l'outil surveille et te prévient d'aller vérifier. Stockées dans le navigateur (localStorage).
  **Jamais** un ordre d'achat — juste un déclencheur pour repasser la checklist.
- **Catalyseurs / fil d'actu** — encore en **démo** (constantes en haut de `components/LaVigie.jsx`).

Les instruments surveillés se règlent dans un seul endroit : `lib/instruments.js`.

---

## Déployer sur Vercel

> ⚠️ **Important — ce projet vit dans un sous-dossier.** La Vigie est logée dans
> `la-vigie/` à l'intérieur du dépôt `the-maya` (qui contient aussi une autre appli,
> « Thé Maya »). Sur Vercel il faut donc **impérativement** régler le
> **Root Directory** sur `la-vigie`, sinon Vercel essaie de builder l'autre appli.

### Option A — via GitHub (recommandé, redéploiement auto à chaque push)

1. https://vercel.com/new → **Import** le dépôt GitHub `the-maya`.
2. Dans l'écran de config du projet, ouvre **Root Directory** → clique **Edit** →
   choisis le dossier **`la-vigie`**. (C'est l'unique réglage indispensable.)
3. Vercel détecte Next.js automatiquement → **Deploy**.

Aucune variable d'environnement requise pour cette version. Chaque `git push` sur la
branche connectée redéploie automatiquement.

### Option B — via la CLI (le plus rapide)

Lance les commandes **depuis le dossier `la-vigie/`** (le Root Directory est alors déduit) :

```bash
cd la-vigie
npm i -g vercel
vercel        # preview — accepte les réglages détectés (Next.js)
vercel --prod # production
```

<details><summary>Ancienne procédure (dépôt dédié à La Vigie)</summary>

Si un jour tu veux extraire La Vigie dans son **propre** dépôt (racine = ce dossier),
plus besoin de Root Directory :

```bash
git init && git add . && git commit -m "La Vigie — prix + tendances + alertes"
git branch -M main
git remote add origin https://github.com/<toi>/la-vigie.git
git push -u origin main
```
Puis https://vercel.com/new → **Import** → Vercel détecte Next.js → **Deploy**.
</details>

### Option B — via la CLI (le plus rapide)

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

### En local

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # build de prod (validé)
```

---

## Point de vigilance — Stooq depuis Vercel

Stooq est gratuit et sans clé, mais **peut limiter / bloquer certaines IP de datacenter**.
Deux cas au déploiement :

1. **Ça marche** (le plus courant) : `app/api/market` renvoie `ok:true`, le bandeau
   affiche « En direct · Stooq ». Rien à faire.
2. **Stooq bloque l'IP Vercel** (`ok:false`, bandeau « Mode démo ») : passe par un
   **cache Supabase** que tu alimentes toi-même —

   ```
   Stooq (CSV) ──► petit cron (Vercel Cron ou ta machine) ──► table Supabase ──► /api/market lit Supabase
   ```

   Tes clés Supabase vont dans les **variables d'environnement Vercel**, jamais dans le code.

Symboles Stooq utilisés (dans `lib/instruments.js`) : `cl.f` WTI, `cb.f` Brent, `ng.f` gaz,
`xauusd` or, `xagusd` argent, `hg.f` cuivre.

---

## Roadmap

- Catalyseurs : calendrier éco (TradingEconomics / Investing) ou table Supabase.
- Fil d'actu : RSS Reuters/Bloomberg filtré « commodities », mis en cache serveur.
- Journal de trades : table Supabase où le cockpit écrit chaque décision (entrée, stop, R:R, checklist).
- Alertes serveur (notification e-mail) si tu veux être prévenu hors navigateur.

---

## Philosophie

L'outil rend **plus discipliné, pas plus réactif**. Pas de signal « ACHÈTE MAINTENANT »,
pas d'auto-trade. La colonne vertébrale, c'est le **risque** et la **checklist**.
Les tendances et les alertes servent au **contexte** — c'est toi qui décides.
Aide à la décision — **pas un conseil d'investissement**.
