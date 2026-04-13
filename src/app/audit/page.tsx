'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────

interface LotFull {
  id: string
  numero_lot: string
  quantite_recue: number
  quantite_restante: number
  date_fabrication: string | null
  date_peremption: string
  statut: string
  notes: string | null
  created_at: string
  matiere_premiere_id: string
  reception_id: string | null
  matieres_premieres: { nom: string; categorie: string; unite: string } | null
  receptions: {
    id: string
    date_reception: string
    numero_bl: string | null
    fournisseurs: { nom: string } | null
  } | null
}

interface ProductionForLot {
  quantite_utilisee: number
  productions: {
    id: string
    date_production: string
    quantite_produite: number
    numero_lot_produit: string
    statut: string
    produits_finis: { nom: string } | null
    production_lignes: { type_conditionnement: string; grammage: number; quantite: number }[]
  } | null
}

// ─── Helpers ─────────────────────────────────────────────

const categorieLabels: Record<string, string> = { the: 'The', ingredient: 'Ingredient', emballage: 'Emballage' }
const categorieColors: Record<string, string> = { the: 'bg-green-100 text-green-800', ingredient: 'bg-purple-100 text-purple-800', emballage: 'bg-blue-100 text-blue-800' }
const statutLabels: Record<string, string> = { disponible: 'Disponible', en_cours: 'En cours', epuise: 'Epuise', perime: 'Perime' }
const statutColors: Record<string, string> = { disponible: 'bg-green-100 text-green-800', en_cours: 'bg-yellow-100 text-yellow-800', epuise: 'bg-gray-100 text-gray-600', perime: 'bg-red-100 text-red-800' }
const condLabels: Record<string, string> = { sachet: 'Sachet', boite: 'Boite', echantillon: 'Echantillon' }

function peremptionInfo(dateStr: string): { color: string; label: string } {
  const today = new Date()
  const d = new Date(dateStr)
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { color: 'text-red-600 font-semibold', label: `perime (${Math.abs(diff)}j)` }
  if (diff <= 30) return { color: 'text-red-500', label: `${diff}j` }
  if (diff <= 60) return { color: 'text-orange-500', label: `${diff}j` }
  return { color: 'text-gray-600', label: `${diff}j` }
}

// ─── Component ───────────────────────────────────────────

export default function AuditPage() {
  const [search, setSearch] = useState('')
  const [searchType, setSearchType] = useState<'lot' | 'produit' | 'fournisseur' | 'matiere'>('lot')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [lots, setLots] = useState<LotFull[]>([])
  const [productionsByLot, setProductionsByLot] = useState<Record<string, ProductionForLot[]>>({})
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expandedLot, setExpandedLot] = useState<string | null>(null)

  async function doSearch() {
    setLoading(true)
    setSearched(true)
    setExpandedLot(null)

    let query = supabase
      .from('lots')
      .select('*, matieres_premieres(nom, categorie, unite), receptions(id, date_reception, numero_bl, fournisseurs(nom))')
      .order('date_peremption', { ascending: true })

    // Filters
    if (search.trim()) {
      if (searchType === 'lot') {
        query = query.ilike('numero_lot', `%${search.trim()}%`)
      } else if (searchType === 'matiere') {
        query = query.ilike('matieres_premieres.nom', `%${search.trim()}%`)
      } else if (searchType === 'fournisseur') {
        query = query.ilike('receptions.fournisseurs.nom', `%${search.trim()}%`)
      }
    }

    if (dateFrom) {
      query = query.gte('date_peremption', dateFrom)
    }
    if (dateTo) {
      query = query.lte('date_peremption', dateTo)
    }

    const { data } = await query
    let results = (data as unknown as LotFull[]) || []

    // Client-side filter for nested joins that Supabase can't filter server-side
    if (search.trim() && searchType === 'matiere') {
      results = results.filter(l => l.matieres_premieres?.nom?.toLowerCase().includes(search.trim().toLowerCase()))
    }
    if (search.trim() && searchType === 'fournisseur') {
      results = results.filter(l => l.receptions?.fournisseurs?.nom?.toLowerCase().includes(search.trim().toLowerCase()))
    }

    // For product search, we need to find lots used in productions of that product
    if (search.trim() && searchType === 'produit') {
      const { data: plData } = await supabase
        .from('production_lots')
        .select('lot_id, productions(produits_finis(nom))')

      const matchingLotIds = new Set<string>()
      ;(plData as unknown as { lot_id: string; productions: { produits_finis: { nom: string } | null } | null }[] || []).forEach(pl => {
        if (pl.productions?.produits_finis?.nom?.toLowerCase().includes(search.trim().toLowerCase())) {
          matchingLotIds.add(pl.lot_id)
        }
      })

      // Also get all lots for those matching
      const { data: allLots } = await supabase
        .from('lots')
        .select('*, matieres_premieres(nom, categorie, unite), receptions(id, date_reception, numero_bl, fournisseurs(nom))')
        .in('id', Array.from(matchingLotIds))
        .order('date_peremption', { ascending: true })

      results = (allLots as unknown as LotFull[]) || []
    }

    setLots(results)

    // Load productions for all found lots
    if (results.length > 0) {
      const lotIds = results.map(l => l.id)
      const { data: plData } = await supabase
        .from('production_lots')
        .select('lot_id, quantite_utilisee, productions(id, date_production, quantite_produite, numero_lot_produit, statut, produits_finis(nom), production_lignes(type_conditionnement, grammage, quantite))')
        .in('lot_id', lotIds)

      const map: Record<string, ProductionForLot[]> = {}
      ;(plData as unknown as (ProductionForLot & { lot_id: string })[] || []).forEach(pl => {
        if (!map[pl.lot_id]) map[pl.lot_id] = []
        map[pl.lot_id].push(pl)
      })
      setProductionsByLot(map)
    } else {
      setProductionsByLot({})
    }

    setLoading(false)
  }

  // Load all on first visit
  useEffect(() => { doSearch() }, [])

  const totalLots = lots.length
  const lotsUtilises = lots.filter(l => productionsByLot[l.id]?.length > 0).length
  const lotsPerimes = lots.filter(l => new Date(l.date_peremption) < new Date()).length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Audit / Tracabilite</h1>
          <p className="text-sm text-gray-500 mt-1">Tracabilite complete : Reception &rarr; Lot &rarr; Production</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-800 text-sm no-print"
        >
          Imprimer
        </button>
      </div>

      {/* Recherche */}
      <div className="bg-card rounded-lg shadow p-5 mb-6 no-print">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rechercher par</label>
            <select value={searchType} onChange={(e) => setSearchType(e.target.value as typeof searchType)} className="border rounded-lg px-3 py-2 w-full text-sm">
              <option value="lot">N° de lot</option>
              <option value="matiere">Matiere premiere</option>
              <option value="fournisseur">Fournisseur</option>
              <option value="produit">Produit fini</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Terme de recherche</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="Rechercher..."
              className="border rounded-lg px-3 py-2 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Peremption du</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Peremption au</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={doSearch} className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition w-full text-sm">
              Rechercher
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Lots trouves</p>
          <p className="text-2xl font-bold text-primary">{totalLots}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Lots utilises en production</p>
          <p className="text-2xl font-bold text-blue-600">{lotsUtilises}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Lots perimes</p>
          <p className="text-2xl font-bold text-red-600">{lotsPerimes}</p>
        </div>
      </div>

      {/* Resultats */}
      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : !searched ? null : lots.length === 0 ? (
        <p className="text-gray-400 text-center py-8">Aucun lot trouve</p>
      ) : (
        <div className="space-y-3">
          {lots.map((lot) => {
            const prods = productionsByLot[lot.id] || []
            const isExpanded = expandedLot === lot.id
            const perem = peremptionInfo(lot.date_peremption)
            const usedPercent = lot.quantite_recue > 0
              ? ((lot.quantite_recue - lot.quantite_restante) / lot.quantite_recue * 100).toFixed(0)
              : '0'

            return (
              <div key={lot.id} className="bg-card rounded-lg shadow overflow-hidden">
                {/* Ligne principale du lot */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedLot(isExpanded ? null : lot.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-lg">{lot.numero_lot}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statutColors[lot.statut]}`}>
                            {statutLabels[lot.statut]}
                          </span>
                          {lot.matieres_premieres && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${categorieColors[lot.matieres_premieres.categorie]}`}>
                              {categorieLabels[lot.matieres_premieres.categorie]}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {lot.matieres_premieres?.nom}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      {/* Stock */}
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Stock</p>
                        <p className="font-medium">
                          {lot.quantite_restante} / {lot.quantite_recue} {lot.matieres_premieres?.unite}
                          <span className="text-xs text-gray-400 ml-1">({usedPercent}%)</span>
                        </p>
                      </div>
                      {/* Peremption */}
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Peremption</p>
                        <p className={`font-medium ${perem.color}`}>{lot.date_peremption} <span className="text-xs">({perem.label})</span></p>
                      </div>
                      {/* Productions */}
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Productions</p>
                        <p className="font-medium">{prods.length > 0 ? (
                          <span className="text-blue-600">{prods.length} production(s)</span>
                        ) : (
                          <span className="text-gray-400">Aucune</span>
                        )}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detail deplie */}
                {isExpanded && (
                  <div className="border-t bg-gray-50/50 p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                      {/* COLONNE 1 : Reception */}
                      <div>
                        <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</span>
                          Reception
                        </h3>
                        {lot.receptions ? (
                          <div className="bg-white rounded-lg border p-4 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">Date</span>
                              <span className="text-sm font-medium">{lot.receptions.date_reception}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">Fournisseur</span>
                              <span className="text-sm font-medium">{lot.receptions.fournisseurs?.nom || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">N BL</span>
                              <span className="text-sm">{lot.receptions.numero_bl || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">Quantite recue</span>
                              <span className="text-sm font-medium">{lot.quantite_recue} {lot.matieres_premieres?.unite}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg border p-4 text-sm text-gray-400">Pas de reception associee</div>
                        )}
                      </div>

                      {/* COLONNE 2 : Lot */}
                      <div>
                        <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                          Lot
                        </h3>
                        <div className="bg-white rounded-lg border p-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">N lot</span>
                            <span className="text-sm font-bold font-mono">{lot.numero_lot}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Matiere</span>
                            <span className="text-sm">{lot.matieres_premieres?.nom}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Date fabrication</span>
                            <span className="text-sm">{lot.date_fabrication || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Date peremption</span>
                            <span className={`text-sm font-medium ${perem.color}`}>{lot.date_peremption}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Recu</span>
                            <span className="text-sm">{lot.quantite_recue} {lot.matieres_premieres?.unite}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Restant</span>
                            <span className="text-sm font-medium">{lot.quantite_restante} {lot.matieres_premieres?.unite}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Consomme</span>
                            <span className="text-sm">{(lot.quantite_recue - lot.quantite_restante).toFixed(3)} {lot.matieres_premieres?.unite} ({usedPercent}%)</span>
                          </div>
                          {/* Barre de progression */}
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${parseInt(usedPercent) >= 100 ? 'bg-gray-400' : parseInt(usedPercent) >= 75 ? 'bg-orange-400' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(parseInt(usedPercent), 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          {lot.notes && (
                            <div className="pt-1">
                              <span className="text-xs text-gray-500">Notes: </span>
                              <span className="text-xs text-gray-600">{lot.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* COLONNE 3 : Productions */}
                      <div>
                        <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">3</span>
                          Productions ({prods.length})
                        </h3>
                        {prods.length > 0 ? (
                          <div className="space-y-3">
                            {prods.map((pl, i) => {
                              const prod = pl.productions
                              if (!prod) return null
                              const lignes = prod.production_lignes || []
                              return (
                                <div key={i} className="bg-white rounded-lg border p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-sm">{prod.produits_finis?.nom}</span>
                                    <span className="text-xs text-gray-400">{prod.date_production}</span>
                                  </div>
                                  {/* Conditionnements */}
                                  {lignes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      {lignes.map((l, j) => (
                                        <span key={j} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                                          {l.quantite} x {condLabels[l.type_conditionnement] || l.type_conditionnement} {l.grammage}g
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Quantite prelevee</span>
                                    <span className="font-medium text-purple-700">{pl.quantite_utilisee} {lot.matieres_premieres?.unite}</span>
                                  </div>
                                </div>
                              )
                            })}
                            {/* Total consomme */}
                            <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 text-center">
                              <span className="text-xs text-purple-600">Total consomme sur ce lot : </span>
                              <span className="text-sm font-bold text-purple-800">
                                {prods.reduce((s, p) => s + p.quantite_utilisee, 0).toFixed(3)} {lot.matieres_premieres?.unite}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white rounded-lg border p-4 text-sm text-gray-400 text-center">
                            Lot non utilise en production
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
