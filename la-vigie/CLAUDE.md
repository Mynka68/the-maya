# CLAUDE.md — La Vigie

Contexte de projet pour Claude Code. Lis-le avant toute modification.

## Ce qu'est le projet

**La Vigie** — tableau de bord de veille matières premières + **cockpit de risque**,
pour un trader particulier de CFD (pétrole surtout) basé à Colmar.
Next.js 15 (App Router), React 18, recharts, lucide-react. Aucune autre dépendance.
Le composant principal est `components/LaVigie.jsx` (styles inline + un bloc `<style>`,
pas de Tailwind, pas de CSS externe hormis `app/globals.css`).

## Philosophie — à respecter impérativement

L'outil sert à rendre l'utilisateur **plus discipliné, pas plus réactif**.
Règles non négociables pour toute évolution :
- **Aucune alerte de type « ACHÈTE / VENDS MAINTENANT »**, aucun signal automatique,
  aucune notification push agressive. Ce sont exactement les mécanismes qui poussent à la faute.
- La colonne vertébrale reste le **risque** (taille de position, R:R, marge) et la **checklist pré-trade**.
- Le fil d'actu sert au **contexte**, jamais à courir après la bougie : l'info publique est déjà dans le prix.
- Toujours afficher que c'est une **aide à la décision, pas un conseil d'investissement**.

Si une demande d'évolution contredit ces règles, le signaler avant de coder.

## Où vit le projet

La Vigie est un **sous-dossier** (`la-vigie/`) du dépôt `the-maya`, qui héberge aussi une
autre appli sans rapport (« Thé Maya », gestion de production, Next 16 + Tailwind + SSO).
Les deux sont **totalement isolées** : chacune a son `package.json`, ses `node_modules`,
sa config. Le `postcss.config.mjs` **vide** de ce dossier est volontaire — il empêche Next
de remonter et d'attraper la config Tailwind du parent (sinon le build casse).
Sur Vercel : **Root Directory = `la-vigie`** (voir README).

## État actuel

- Le projet **build** (`npm run build` validé) et se déploie sur Vercel (Root Directory = `la-vigie`).
- **Prix + tendances : BRANCHÉS EN VRAI.** Route serveur `app/api/market/route.js`
  (Stooq CSV côté serveur, cache 5 min). Calcul MM20/MM50 + état de tendance + volatilité
  dans `lib/indicators.js`. Instruments dans `lib/instruments.js`.
  Repli automatique sur `DEMO` (dans `components/LaVigie.jsx`) si Stooq est indisponible.
- **Cockpit de risque** : 100 % fonctionnel, calcul local, inchangé.
- **Alertes de conditions** : nouveau. `tu fixes une condition → l'outil surveille`.
  localStorage, aucune notion d'ordre d'achat. Respecte la doctrine.
- **Catalyseurs / fil d'actu** : encore en démo (constantes `CATALYSTS`, `NEWS`).

## Prochaine tâche (roadmap)

Prix + tendances déjà branchés. Reste :

1. **Si Stooq bloque l'IP Vercel** (`/api/market` renvoie `ok:false` en prod) : insérer un
   cache Supabase — un cron alimente une table `prices`, `/api/market` lit Supabase.
   Clés Supabase → variables d'environnement Vercel, jamais commitées.
2. Catalyseurs : calendrier éco (TradingEconomics / Investing) ou table Supabase.
3. Fil d'actu : RSS Reuters/Bloomberg filtré « commodities », cache serveur.
4. Journal de trades : table Supabase où le cockpit écrit chaque décision.

## Conventions

- Français pour l'UI et les commentaires.
- Pas de nouvelle dépendance sans raison forte (garder le build léger et le déploiement simple).
- Toute donnée sensible (clés) → variables d'environnement, jamais dans le code.
