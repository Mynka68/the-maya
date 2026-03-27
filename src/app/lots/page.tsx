'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Lot {
  id: string
  numero_lot: string
  quantite_recue: number
  quantite_restante: number
  date_fabrication: string | null
  date_peremption: string
  statut: string
  notes: string | null
  matieres_premieres: { nom: string; categorie: string; unite: string } | null
  receptions: { date_reception: string; fournisseurs: { nom: string } | null } | null
}

const statutLabels: Record<string, string> = {
  disponible: 'Disponible',
  en_cours: 'En cours',
  epuise: 'Épuisé',
  perime: 'Périmé',
}

const statutColors: Record<string, string> = {
  disponible: 'bg-green-100 text-green-800',
  en_cours: 'bg-blue-100 text-blue-800',
  epuise: 'bg-gray-100 text-gray-800',
  perime: 'bg-red-100 text-red-800',
}

export default function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategorie, setFilterCategorie] = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('lots')
      .select('*, matieres_premieres(nom, categorie, unite), receptions(date_reception, fournisseurs(nom))')
      .order('date_peremption', { ascending: true })
    setLots((data as unknown as Lot[]) || [])
    setLoading(false)
  }

  function daysUntil(date: string) {
    const diff = new Date(date).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function peremptionBadge(date: string) {
    const days = daysUntil(date)
    if (days < 0) return <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium">Périmé ({Math.abs(days)}j)</span>
    if (days < 30) return <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-medium">{days}j</span>
    if (days < 60) return <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 font-medium">{days}j</span>
    return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">{days}j</span>
  }

  const filtered = lots.filter(l => {
    if (filterCategorie && l.matieres_premieres?.categorie !== filterCategorie) return false
    if (filterStatut && l.statut !== filterStatut) return false
    return true
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Lots</h1>

      <div className="flex gap-4 mb-6">
        <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes catégories</option>
          <option value="the">Thé</option>
          <option value="ingredient">Ingrédient</option>
          <option value="emballage">Emballage</option>
        </select>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tous statuts</option>
          <option value="disponible">Disponible</option>
          <option value="en_cours">En cours</option>
          <option value="epuise">Épuisé</option>
          <option value="perime">Périmé</option>
        </select>
        <span className="text-sm text-gray-500 self-center">{filtered.length} lot(s)</span>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Lot</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matière</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reçu</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Restant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Péremption</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((lot) => (
                <tr key={lot.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm font-medium">{lot.numero_lot}</td>
                  <td className="px-4 py-3 text-sm">{lot.matieres_premieres?.nom}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{lot.receptions?.fournisseurs?.nom || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">{lot.quantite_recue} {lot.matieres_premieres?.unite}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{lot.quantite_restante} {lot.matieres_premieres?.unite}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{lot.date_peremption}</span>
                      {peremptionBadge(lot.date_peremption)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[lot.statut]}`}>
                      {statutLabels[lot.statut]}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Aucun lot</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
