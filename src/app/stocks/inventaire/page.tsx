'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface LotInventaire {
  id: string
  numero_lot: string
  quantite_restante: number
  date_peremption: string
  matiere_premiere_id: string
  matieres_premieres: { nom: string; categorie: string; unite: string } | null
}

interface MatiereGroup {
  matiere_premiere_id: string
  nom: string
  categorie: string
  unite: string
  lots: LotInventaire[]
  stock_theorique: number
}

const categorieLabels: Record<string, string> = {
  the: 'The',
  ingredient: 'Ingredient',
  emballage: 'Emballage',
}

const categorieOrder: Record<string, number> = { the: 1, ingredient: 2, emballage: 3 }

export default function InventairePage() {
  const [groups, setGroups] = useState<MatiereGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategorie, setFilterCategorie] = useState('')
  const [showTheorique, setShowTheorique] = useState(true)
  const [rapportDate] = useState(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }))

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('lots')
      .select('id, numero_lot, quantite_restante, date_peremption, matiere_premiere_id, matieres_premieres(nom, categorie, unite)')
      .in('statut', ['disponible', 'en_cours'])
      .gt('quantite_restante', 0)
      .order('date_peremption', { ascending: true })

    const lots = (data as unknown as LotInventaire[]) || []

    const map = new Map<string, MatiereGroup>()
    for (const lot of lots) {
      const id = lot.matiere_premiere_id
      const existing = map.get(id)
      if (existing) {
        existing.lots.push(lot)
        existing.stock_theorique += Number(lot.quantite_restante)
      } else {
        map.set(id, {
          matiere_premiere_id: id,
          nom: lot.matieres_premieres?.nom || 'Inconnu',
          categorie: lot.matieres_premieres?.categorie || '',
          unite: lot.matieres_premieres?.unite || 'kg',
          lots: [lot],
          stock_theorique: Number(lot.quantite_restante),
        })
      }
    }

    const sorted = Array.from(map.values()).sort((a, b) => {
      const catDiff = (categorieOrder[a.categorie] || 99) - (categorieOrder[b.categorie] || 99)
      if (catDiff !== 0) return catDiff
      return a.nom.localeCompare(b.nom)
    })

    setGroups(sorted)
    setLoading(false)
  }

  const filtered = filterCategorie
    ? groups.filter(g => g.categorie === filterCategorie)
    : groups

  // Group by categorie for section headers
  const sections: { categorie: string; items: MatiereGroup[] }[] = []
  let currentCat = ''
  for (const g of filtered) {
    if (g.categorie !== currentCat) {
      currentCat = g.categorie
      sections.push({ categorie: currentCat, items: [] })
    }
    sections[sections.length - 1].items.push(g)
  }

  if (loading) return <p className="text-gray-500 p-6">Chargement...</p>

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          body { font-size: 11px; }
          #rapport-inventaire { padding: 10px; }
          .page-break { page-break-before: always; }
          table { font-size: 10px; }
          .lot-row td { padding: 4px 8px !important; }
          .matiere-header { padding: 6px 8px !important; }
          .input-physique {
            border: 1px solid #999 !important;
            min-width: 80px;
            height: 24px;
            background: #fafafa !important;
          }
          .input-ecart {
            border: 1px solid #999 !important;
            min-width: 60px;
            height: 24px;
            background: #fafafa !important;
          }
        }
        @media screen {
          .input-physique, .input-ecart { pointer-events: none; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-dark">Rapport d&apos;inventaire</h1>
            <p className="text-sm text-gray-500 mt-1">Imprimez ce rapport pour que votre technicien verifie le stock physique</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition"
            >
              Imprimer le rapport
            </button>
            <Link href="/stocks" className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">
              Retour aux stocks
            </Link>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Filtrer par categorie</label>
            <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes les categories</option>
              <option value="the">The</option>
              <option value="ingredient">Ingredient</option>
              <option value="emballage">Emballage</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="showTheo" checked={showTheorique} onChange={(e) => setShowTheorique(e.target.checked)} className="rounded" />
            <label htmlFor="showTheo" className="text-sm text-gray-700">Afficher les quantites theoriques</label>
          </div>
          <div className="text-sm text-gray-500">
            {filtered.length} matiere(s) — {filtered.reduce((s, g) => s + g.lots.length, 0)} lot(s)
          </div>
        </div>
      </div>

      {/* Rapport */}
      <div id="rapport-inventaire">
        {/* En-tete du rapport */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold">RAPPORT D&apos;INVENTAIRE</h1>
              <p className="text-sm text-gray-600">The Maya — Controle des stocks</p>
            </div>
            <div className="text-right text-sm">
              <p><strong>Date :</strong> {rapportDate}</p>
              <p className="mt-2"><strong>Realise par :</strong> _______________________</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 border rounded-lg p-4 mb-6 text-sm">
          <p className="font-bold mb-2">Instructions :</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-700">
            <li>Verifier chaque lot physiquement en stock</li>
            <li>Peser ou compter la quantite reelle et la noter dans la colonne <strong>&quot;Stock physique&quot;</strong></li>
            <li>Calculer l&apos;ecart si different et le noter dans la colonne <strong>&quot;Ecart&quot;</strong></li>
            <li>Cocher <strong>OK</strong> si le stock correspond, ou noter l&apos;ecart</li>
            <li>Ajouter des observations si necessaire (lot endommage, emplacement incorrect, etc.)</li>
          </ol>
        </div>

        {/* Tableau par section */}
        {sections.map((section, sIdx) => (
          <div key={section.categorie} className={sIdx > 0 ? 'mt-8' : ''}>
            <h2 className="text-lg font-bold bg-gray-200 px-4 py-2 rounded-t-lg uppercase">
              {categorieLabels[section.categorie] || section.categorie}
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({section.items.length} matiere(s), {section.items.reduce((s, g) => s + g.lots.length, 0)} lot(s))
              </span>
            </h2>

            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100 text-xs uppercase">
                  <th className="border border-gray-300 px-3 py-2 text-left w-[200px]">Matiere / N lot</th>
                  <th className="border border-gray-300 px-3 py-2 text-left w-[90px]">Peremption</th>
                  <th className="border border-gray-300 px-3 py-2 text-right w-[100px]">
                    {showTheorique ? 'Stock app' : ''}
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-[120px] bg-yellow-50">Stock physique</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-[80px] bg-yellow-50">Ecart</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-[50px] bg-yellow-50">OK</th>
                  <th className="border border-gray-300 px-3 py-2 text-left bg-yellow-50">Observations</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((group) => (
                  <>
                    {/* Ligne matiere premiere (header) */}
                    <tr key={group.matiere_premiere_id} className="bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2 matiere-header" colSpan={2}>
                        <span className="font-bold">{group.nom}</span>
                        <span className="text-xs text-gray-500 ml-2">({group.unite})</span>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-bold matiere-header">
                        {showTheorique ? `${group.stock_theorique.toFixed(2)} ${group.unite}` : ''}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 bg-yellow-50/50 matiere-header">
                        <div className="input-physique rounded px-1">&nbsp;</div>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 bg-yellow-50/50 matiere-header">
                        <div className="input-ecart rounded px-1">&nbsp;</div>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center bg-yellow-50/50 matiere-header">
                        <div className="w-5 h-5 border-2 border-gray-400 rounded mx-auto"></div>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 bg-yellow-50/50 matiere-header"></td>
                    </tr>
                    {/* Lignes lots */}
                    {group.lots.map((lot) => (
                      <tr key={lot.id} className="lot-row">
                        <td className="border border-gray-300 px-3 py-1.5 pl-8 text-sm">
                          <span className="font-mono">{lot.numero_lot}</span>
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-sm text-gray-600">
                          {lot.date_peremption}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-sm text-right">
                          {showTheorique ? `${lot.quantite_restante} ${group.unite}` : ''}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 bg-yellow-50/30">
                          <div className="input-physique rounded px-1">&nbsp;</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 bg-yellow-50/30">
                          <div className="input-ecart rounded px-1">&nbsp;</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center bg-yellow-50/30">
                          <div className="w-4 h-4 border-2 border-gray-400 rounded mx-auto"></div>
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 bg-yellow-50/30">
                          <div className="border-b border-gray-300 min-h-[18px]"></div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Resume */}
        <div className="mt-8 border-t-2 border-gray-800 pt-4">
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-bold mb-1">Resume</p>
              <p>Matieres controlees : {filtered.length}</p>
              <p>Lots controles : {filtered.reduce((s, g) => s + g.lots.length, 0)}</p>
            </div>
            <div>
              <p className="font-bold mb-1">Resultat global</p>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-gray-400 rounded"></div>
                  <span>Conforme</span>
                </label>
                <label className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-gray-400 rounded"></div>
                  <span>Ecarts constates</span>
                </label>
              </div>
            </div>
            <div>
              <p className="font-bold mb-1">Nombre d&apos;ecarts</p>
              <div className="border-b border-gray-400 w-24 h-6 mt-1"></div>
            </div>
          </div>
        </div>

        {/* Observations generales */}
        <div className="mt-6">
          <p className="font-bold text-sm mb-2">Observations generales :</p>
          <div className="border border-gray-300 rounded-lg min-h-[100px] p-2">
            <div className="border-b border-gray-200 h-6"></div>
            <div className="border-b border-gray-200 h-6"></div>
            <div className="border-b border-gray-200 h-6"></div>
            <div className="h-6"></div>
          </div>
        </div>

        {/* Signatures */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm font-bold mb-1">Technicien</p>
            <div className="border-b border-gray-400 h-16"></div>
            <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
          </div>
          <div>
            <p className="text-sm font-bold mb-1">Responsable</p>
            <div className="border-b border-gray-400 h-16"></div>
            <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
          </div>
        </div>
      </div>
    </>
  )
}
