import "./globals.css";

export const metadata = {
  title: "La Vigie · Poste de veille matières premières",
  description: "Tableau de bord de veille et cockpit de risque pour le trading de matières premières.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14110E",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
