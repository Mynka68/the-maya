// Extrait la référence fournisseur (code article en préfixe du nom de la matière)
// Ex : "82709 - Fruity BOOST BIO" -> { ref: "82709", designation: "Fruity BOOST BIO" }
export function splitRef(nom: string): { ref: string; designation: string } {
  const m = nom.match(/^\s*([A-Za-z0-9]+)\s*-\s*(.+)$/)
  if (m) return { ref: m[1], designation: m[2].trim() }
  return { ref: '', designation: nom }
}
