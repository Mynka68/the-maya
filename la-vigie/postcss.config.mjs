/* La Vigie n'utilise pas Tailwind ni de plugin PostCSS : CSS simple (app/globals.css)
   + styles inline dans components/LaVigie.jsx. Ce fichier vide est volontaire :
   il empêche Next.js de remonter l'arborescence et de récupérer la config PostCSS
   d'une app parente (ex. Tailwind de « Thé Maya »), ce qui casserait le build.
   Voir README → « Déployer sur Vercel ». */
const config = { plugins: {} };

export default config;
