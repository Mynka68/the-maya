'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LotRaw {
  id: string
  matiere_premiere_id: string
  numero_lot: string
  quantite_recue: number
  quantite_restante: number
  date_fabrication: string | null
  date_peremption: string
  statut: string
  notes: string | null
  matieres_premieres: { nom: string; categorie: string; unite: string } | null
}

interface ProduitFini {
  nom: string
}

interface StockLine {
  matiere_premiere_id: string
  nom: string
  categorie: string
  unite: string
  stock_total: number
  nb_lots: number
  produits_finis: string[]
}

const categorieLabels: Record<string, string> = {
  the: 'Thé',
  ingredient: 'Ingrédient',
  emballage: 'Emballage',
}

const categorieColors: Record<string, string> = {
  the: 'bg-green-100 text-green-800',
  ingredient: 'bg-purple-100 text-purple-800',
  emballage: 'bg-blue-100 text-blue-800',
}

const statutLabels: Record<string, string> = {
  disponible: 'Disponible',
  en_cours: 'En cours',
  epuise: 'Épuisé',
  perime: 'Périmé',
}

const statutColors: Record<string, string> = {
  disponible: 'bg-green-100 text-green-800',
  en_cours: 'bg-yellow-100 text-yellow-800',
  epuise: 'bg-gray-100 text-gray-600',
  perime: 'bg-red-100 text-red-800',
}

function getPeremptionColor(dateStr: string): string {
  const today = new Date()
  const peremption = new Date(dateStr)
  const diffDays = Math.ceil((peremption.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'text-red-600 font-semibold'
  if (diffDays <= 30) return 'text-red-500'
  if (diffDays <= 60) return 'text-orange-500'
  return 'text-gray-700'
}

function getPeremptionLabel(dateStr: string): string | null {
  const today = new Date()
  const peremption = new Date(dateStr)
  const diffDays = Math.ceil((peremption.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Périmé'
  if (diffDays <= 30) return `${diffDays}j`
  if (diffDays <= 60) return `${diffDays}j`
  return null
}

export default function StocksPage() {
  const [stocks, setStocks] = useState<StockLine[]>([])
  const [allLots, setAllLots] = useState<LotRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategorie, setFilterCategorie] = useState('')
  const [filterNiveau, setFilterNiveau] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'nom' | 'stock' | 'lots' | 'produit'>('nom')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [lotsRes, produitsRes] = await Promise.all([
      supabase
        .from('lots')
        .select('id, matiere_premiere_id, numero_lot, quantite_recue, quantite_restante, date_fabrication, date_peremption, statut, notes, matieres_premieres(nom, categorie, unite)')
        .in('statut', ['disponible', 'en_cours'])
        .order('date_peremption', { ascending: true }),
      supabase
        .from('produits_finis')
        .select('nom, matiere_premiere_id')
        .not('matiere_premiere_id', 'is', null),
    ])

    const lots = (lotsRes.data as unknown as LotRaw[]) || []
    setAllLots(lots)

    // Map matiere_premiere_id -> produit fini names
    const produitsByMatiere = new Map<string, string[]>()
    for (const p of (produitsRes.data as unknown as { nom: string; matiere_premiere_id: string }[]) || []) {
      const existing = produitsByMatiere.get(p.matiere_premiere_id) || []
      existing.push(p.nom)
      produitsByMatiere.set(p.matiere_premiere_id, existing)
    }

    // Agréger par matière première
    const map = new Map<string, StockLine>()
    for (const lot of lots) {
      const id = lot.matiere_premiere_id
      const existing = map.get(id)
      if (existing) {
        existing.stock_total += Number(lot.quantite_restante)
        existing.nb_lots += 1
      } else {
        map.set(id, {
          matiere_premiere_id: id,
          nom: lot.matieres_premieres?.nom || 'Inconnu',
          categorie: lot.matieres_premieres?.categorie || '',
          unite: lot.matieres_premieres?.unite || '',
          stock_total: Number(lot.quantite_restante),
          nb_lots: 1,
          produits_finis: produitsByMatiere.get(id) || [],
        })
      }
    }

    setStocks(Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom)))
    setLoading(false)
  }

  function getNiveau(stock: StockLine): 'rupture' | 'faible' | 'ok' {
    if (stock.stock_total <= 0) return 'rupture'
    if (stock.nb_lots <= 1) return 'faible'
    return 'ok'
  }

  function niveauBadge(stock: StockLine) {
    const n = getNiveau(stock)
    if (n === 'rupture') return <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium">Rupture</span>
    if (n === 'faible') return <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-medium">Faible</span>
    return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">OK</span>
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  function sortIndicator(field: typeof sortField) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">&#8597;</span>
    return <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>
  }

  function getLotsForMatiere(matiereId: string): LotRaw[] {
    return allLots.filter(l => l.matiere_premiere_id === matiereId)
  }

  const filtered = stocks
    .filter(s => {
      if (filterCategorie && s.categorie !== filterCategorie) return false
      if (filterNiveau && getNiveau(s) !== filterNiveau) return false
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase()
        const matchNom = s.nom.toLowerCase().includes(term)
        const matchProduit = s.produits_finis.some(p => p.toLowerCase().includes(term))
        if (!matchNom && !matchProduit) return false
      }
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortField === 'nom') cmp = a.nom.localeCompare(b.nom)
      else if (sortField === 'stock') cmp = a.stock_total - b.stock_total
      else if (sortField === 'lots') cmp = a.nb_lots - b.nb_lots
      else if (sortField === 'produit') cmp = (a.produits_finis[0] || '').localeCompare(b.produits_finis[0] || '')
      return sortAsc ? cmp : -cmp
    })

  const totalItems = stocks.length
  const rupture = stocks.filter(s => s.stock_total <= 0).length
  const faible = stocks.filter(s => s.nb_lots <= 1 && s.stock_total > 0).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Stocks</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Matières en stock</p>
          <p className="text-3xl font-bold text-primary">{totalItems}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Stock faible</p>
          <p className="text-3xl font-bold text-warning">{faible}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">En rupture</p>
          <p className="text-3xl font-bold text-danger">{rupture}</p>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Rechercher</label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Matière première ou produit fini..."
              className="border rounded-lg px-3 py-2 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
            <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes</option>
              <option value="the">Thé</option>
              <option value="ingredient">Ingrédient</option>
              <option value="emballage">Emballage</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Niveau</label>
            <select value={filterNiveau} onChange={(e) => setFilterNiveau(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              <option value="ok">OK</option>
              <option value="faible">Faible</option>
              <option value="rupture">Rupture</option>
            </select>
          </div>
          <div className="self-end">
            <span className="text-sm text-gray-500">{filtered.length} matière(s)</span>
          </div>
          {(searchTerm || filterCategorie || filterNiveau) && (
            <button
              onClick={() => { setSearchTerm(''); setFilterCategorie(''); setFilterNiveau('') }}
              className="text-sm text-gray-500 hover:text-gray-700 underline self-end"
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('nom')}>
                  Matière première {sortIndicator('nom')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('produit')}>
                  Produit fini {sortIndicator('produit')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catégorie</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('stock')}>
                  Stock total {sortIndicator('stock')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('lots')}>
                  Lots actifs {sortIndicator('lots')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Niveau</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => {
                const isExpanded = expandedId === s.matiere_premiere_id
                const lotsDetail = isExpanded ? getLotsForMatiere(s.matiere_premiere_id) : []
                return (
                  <>
                    <tr
                      key={s.matiere_premiere_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : s.matiere_premiere_id)}
                    >
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          <span className="text-primary hover:underline">{s.nom}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {s.produits_finis.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {s.produits_finis.map((nom, i) => (
                              <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                ☕ {nom}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Non associé</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${categorieColors[s.categorie] || ''}`}>
                          {categorieLabels[s.categorie] || s.categorie}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{s.stock_total.toFixed(2)} {s.unite}</td>
                      <td className="px-6 py-4 text-right">{s.nb_lots}</td>
                      <td className="px-6 py-4">{niveauBadge(s)}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.matiere_premiere_id}-detail`}>
                        <td colSpan={6} className="px-6 py-0">
                          <div className="bg-gray-50 rounded-lg my-2 overflow-hidden border">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">N° Lot</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté reçue</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qté restante</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date fab.</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date péremption</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {lotsDetail.map((lot) => {
                                  const usedPercent = lot.quantite_recue > 0
                                    ? ((lot.quantite_recue - lot.quantite_restante) / lot.quantite_recue * 100).toFixed(0)
                                    : '0'
                                  const peremptionLabel = getPeremptionLabel(lot.date_peremption)
                                  return (
                                    <tr key={lot.id} className="hover:bg-white">
                                      <td className="px-4 py-2.5 text-sm font-mono">{lot.numero_lot}</td>
                                      <td className="px-4 py-2.5 text-sm text-right">{lot.quantite_recue} {s.unite}</td>
                                      <td className="px-4 py-2.5 text-sm text-right">
                                        <span className={lot.quantite_restante === 0 ? 'text-gray-400' : 'font-medium'}>
                                          {lot.quantite_restante} {s.unite}
                                        </span>
                                        {Number(usedPercent) > 0 && (
                                          <span className="text-xs text-gray-400 ml-1">({usedPercent}%)</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-sm text-gray-500">{lot.date_fabrication || '-'}</td>
                                      <td className="px-4 py-2.5 text-sm">
                                        <span className={getPeremptionColor(lot.date_peremption)}>{lot.date_peremption}</span>
                                        {peremptionLabel && (
                                          <span className={`text-xs ml-1 ${getPeremptionColor(lot.date_peremption)}`}>({peremptionLabel})</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${statutColors[lot.statut] || 'bg-gray-100 text-gray-600'}`}>
                                          {statutLabels[lot.statut] || lot.statut}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-sm text-gray-500">{lot.notes || '-'}</td>
                                    </tr>
                                  )
                                })}
                                {lotsDetail.length === 0 && (
                                  <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">Aucun lot disponible</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Aucun stock</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
