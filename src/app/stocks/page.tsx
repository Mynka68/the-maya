'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LotRaw {
  matiere_premiere_id: string
  quantite_restante: number
  matieres_premieres: { nom: string; categorie: string; unite: string } | null
}

interface StockLine {
  matiere_premiere_id: string
  nom: string
  categorie: string
  unite: string
  stock_total: number
  nb_lots: number
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

export default function StocksPage() {
  const [stocks, setStocks] = useState<StockLine[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategorie, setFilterCategorie] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('lots')
      .select('matiere_premiere_id, quantite_restante, matieres_premieres(nom, categorie, unite)')
      .in('statut', ['disponible', 'en_cours'])

    const lots = (data as unknown as LotRaw[]) || []

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
        })
      }
    }

    setStocks(Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom)))
    setLoading(false)
  }

  function niveauBadge(stock: StockLine) {
    if (stock.stock_total <= 0) return <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium">Rupture</span>
    if (stock.nb_lots <= 1) return <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-medium">Faible</span>
    return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">OK</span>
  }

  const filtered = stocks.filter(s => {
    if (filterCategorie && s.categorie !== filterCategorie) return false
    return true
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

      <div className="flex gap-4 mb-6">
        <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes catégories</option>
          <option value="the">Thé</option>
          <option value="ingredient">Ingrédient</option>
          <option value="emballage">Emballage</option>
        </select>
        <span className="text-sm text-gray-500 self-center">{filtered.length} matière(s)</span>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matière première</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catégorie</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lots actifs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Niveau</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.matiere_premiere_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{s.nom}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${categorieColors[s.categorie] || ''}`}>
                      {categorieLabels[s.categorie] || s.categorie}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">{s.stock_total.toFixed(2)} {s.unite}</td>
                  <td className="px-6 py-4 text-right">{s.nb_lots}</td>
                  <td className="px-6 py-4">{niveauBadge(s)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Aucun stock</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
