'use client'

import { useEffect, useState, Fragment } from 'react'
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
  the: 'Thé',
  ingredient: 'Ingrédient',
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

  // Regroupement par catégorie
  const sections: { categorie: string; items: MatiereGroup[] }[] = []
  let currentCat = ''
  for (const g of filtered) {
    if (g.categorie !== currentCat) {
      currentCat = g.categorie
      sections.push({ categorie: currentCat, items: [] })
    }
    sections[sections.length - 1].items.push(g)
  }

  const totalMatieres = filtered.length
  const totalLots = filtered.reduce((s, g) => s + g.lots.length, 0)
  const perimetre = filterCategorie ? (categorieLabels[filterCategorie] || filterCategorie) : 'Toutes catégories'

  const emptyBox = <div className="input-physique rounded px-1">&nbsp;</div>
  const emptyEcart = <div className="input-ecart rounded px-1">&nbsp;</div>
  const checkbox = (small?: boolean) => (
    <div className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} border-2 border-gray-500 rounded mx-auto`}></div>
  )

  if (loading) return <p className="text-gray-500 p-6">Chargement...</p>

  return (
    <>
      {/* Barre d'outils (jamais imprimée) */}
      <div className="no-print mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-dark">Rapport d&apos;inventaire</h1>
            <p className="text-sm text-gray-500 mt-1">
              Imprimez pour le contrôle physique (en-tête et « Page X / Y » sur chaque page).
              Dans le dialogue d&apos;impression, laissez <strong>Marges : Par défaut</strong>.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition"
            >
              🖨️ Imprimer le rapport
            </button>
            <Link href="/stocks" className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">
              Retour aux stocks
            </Link>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Filtrer par catégorie</label>
            <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes les catégories</option>
              <option value="the">Thé</option>
              <option value="ingredient">Ingrédient</option>
              <option value="emballage">Emballage</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="showTheo" checked={showTheorique} onChange={(e) => setShowTheorique(e.target.checked)} className="rounded" />
            <label htmlFor="showTheo" className="text-sm text-gray-700">Afficher le stock théorique (application)</label>
          </div>
          <div className="text-sm text-gray-500">
            {totalMatieres} matière(s) — {totalLots} lot(s)
          </div>
        </div>
      </div>

      {/* Bloc identité + instructions — au-dessus du tableau (page 1 uniquement) */}
      <div className="intro-preamble">
        <div className="grid grid-cols-2 gap-6 mb-4 text-sm">
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Réalisé par</p>
            <div className="border-b border-gray-400 h-6"></div>
            <p className="text-xs text-gray-400 mt-1">Nom du contrôleur</p>
          </div>
          <div className="border border-gray-300 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date du contrôle physique</p>
            <div className="border-b border-gray-400 h-6"></div>
            <p className="text-xs text-gray-400 mt-1">Jour / Mois / Année</p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3 text-sm">
          <p className="font-bold mb-1">Instructions</p>
          <ol className="list-decimal list-inside space-y-0.5 text-gray-700">
            <li>Peser ou compter chaque lot physiquement présent en stock.</li>
            <li>Reporter la quantité réelle dans la colonne <strong>« Stock physique »</strong>.</li>
            <li>Indiquer l&apos;<strong>écart</strong> par rapport au stock application, cocher <strong>OK</strong> si conforme.</li>
            <li>Consigner toute anomalie (lot endommagé, périmé, emplacement) dans <strong>« Observations »</strong>.</li>
            <li>Dater et signer en fin de rapport.</li>
          </ol>
        </div>
      </div>

      {/* Rapport : une seule table, le thead (bandeau + colonnes) se répète sur chaque page */}
      <table className="report" id="rapport-inventaire">
        <thead>
          {/* Bandeau d'en-tête */}
          <tr>
            <th colSpan={7} className="band-cell">
              <div className="report-band">
                <div className="report-band-left">
                  <div className="report-band-title">🍵 THÉ MAYA — RAPPORT D&apos;INVENTAIRE</div>
                  <div className="report-band-sub">Contrôle physique des stocks de matières premières</div>
                </div>
                <div className="report-band-right">
                  <div><strong>Date :</strong> {rapportDate}</div>
                  <div><strong>Périmètre :</strong> {perimetre}</div>
                  <div>{totalMatieres} matière(s) · {totalLots} lot(s)</div>
                </div>
              </div>
            </th>
          </tr>
          {/* En-têtes de colonnes (groupés) */}
          <tr className="colhead">
            <th rowSpan={2} className="text-left">Matière / N° lot</th>
            <th rowSpan={2} className="text-left" style={{ width: '80px' }}>Péremption</th>
            <th rowSpan={2} className="text-right" style={{ width: '90px' }}>{showTheorique ? 'Stock app.' : ''}</th>
            <th colSpan={4} className="text-center fill-col">À compléter par le contrôleur</th>
          </tr>
          <tr className="colhead">
            <th className="text-center fill-col" style={{ width: '110px' }}>Stock physique</th>
            <th className="text-center fill-col" style={{ width: '70px' }}>Écart</th>
            <th className="text-center fill-col" style={{ width: '42px' }}>OK</th>
            <th className="text-left fill-col">Observations</th>
          </tr>
        </thead>

        <tbody>
          {/* Sections + matières + lots */}
          {sections.map((section) => (
            <Fragment key={section.categorie}>
              <tr className="cat-row">
                <td colSpan={7}>
                  {categorieLabels[section.categorie] || section.categorie}
                  <span className="muted"> — {section.items.length} matière(s), {section.items.reduce((s, g) => s + g.lots.length, 0)} lot(s)</span>
                </td>
              </tr>

              {section.items.map((group) => (
                <Fragment key={group.matiere_premiere_id}>
                  {/* Ligne matière (sous-total) */}
                  <tr className="matiere-row">
                    <td className="gcell" colSpan={2}>
                      <span className="font-bold">{group.nom}</span>
                      <span className="text-[10px] text-gray-500 ml-1">({group.unite})</span>
                    </td>
                    <td className="gcell text-right font-bold">
                      {showTheorique ? `${group.stock_theorique.toFixed(3)} ${group.unite}` : ''}
                    </td>
                    <td className="gcell fill-col">{emptyBox}</td>
                    <td className="gcell fill-col">{emptyEcart}</td>
                    <td className="gcell fill-col text-center">{checkbox()}</td>
                    <td className="gcell fill-col"></td>
                  </tr>
                  {/* Lignes lots */}
                  {group.lots.map((lot) => (
                    <tr key={lot.id} className="lot-row">
                      <td className="gcell pl-6 text-[11px]">
                        <span className="font-mono">{lot.numero_lot}</span>
                      </td>
                      <td className="gcell text-[11px] text-gray-600">{lot.date_peremption}</td>
                      <td className="gcell text-[11px] text-right">
                        {showTheorique ? `${lot.quantite_restante} ${group.unite}` : ''}
                      </td>
                      <td className="gcell fill-col">{emptyBox}</td>
                      <td className="gcell fill-col">{emptyEcart}</td>
                      <td className="gcell fill-col text-center">{checkbox(true)}</td>
                      <td className="gcell fill-col">
                        <div className="border-b border-gray-300 min-h-[16px]"></div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}

          {sections.length === 0 && (
            <tr><td colSpan={7} className="text-center text-gray-400 py-8">Aucun lot en stock à inventorier.</td></tr>
          )}

          {/* Synthèse + signatures */}
          <tr className="sign-row">
            <td colSpan={7}>
              <div className="border-t-2 border-gray-800 pt-4">
                <div className="grid grid-cols-3 gap-6 text-sm">
                  <div>
                    <p className="font-bold mb-1">Synthèse</p>
                    <p>Matières contrôlées : {totalMatieres}</p>
                    <p>Lots contrôlés : {totalLots}</p>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Résultat global</p>
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-gray-500 rounded"></div>
                        <span>Conforme (aucun écart)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-gray-500 rounded"></div>
                        <span>Écarts constatés</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Nombre d&apos;écarts constatés</p>
                    <div className="border-b border-gray-500 w-28 h-6 mt-1"></div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="font-bold text-sm mb-2">Observations générales</p>
                  <div className="border border-gray-300 rounded-lg p-2">
                    <div className="border-b border-gray-200 h-5"></div>
                    <div className="border-b border-gray-200 h-5"></div>
                    <div className="h-5"></div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-sm font-bold mb-1">Contrôleur</p>
                    <div className="border-b border-gray-500 h-14"></div>
                    <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold mb-1">Responsable</p>
                    <div className="border-b border-gray-500 h-14"></div>
                    <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
