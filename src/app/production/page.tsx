'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Production {
  id: string
  date_production: string
  quantite_produite: number
  numero_lot_produit: string
  statut: string
  notes: string | null
  produits_finis: { nom: string }
  production_lots: { quantite_utilisee: number; lots: { numero_lot: string; matieres_premieres: { nom: string } } }[]
}

const statutLabels: Record<string, string> = { en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' }
const statutColors: Record<string, string> = { en_cours: 'bg-blue-100 text-blue-800', terminee: 'bg-green-100 text-green-800', annulee: 'bg-red-100 text-red-800' }

export default function ProductionPage() {
  const [productions, setProductions] = useState<Production[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('productions')
      .select('*, produits_finis(nom), production_lots(quantite_utilisee, lots(numero_lot, matieres_premieres(nom)))')
      .order('date_production', { ascending: false })
    setProductions(data || [])
    setLoading(false)
  }

  async function updateStatut(id: string, statut: string) {
    await supabase.from('productions').update({ statut }).eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Production</h1>
        <Link href="/production/nouvelle" className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition">
          + Nouvelle production
        </Link>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="space-y-4">
          {productions.length === 0 && <p className="text-gray-400 text-center py-8">Aucune production</p>}
          {productions.map((prod) => (
            <div key={prod.id} className="bg-card rounded-lg shadow">
              <div
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === prod.id ? null : prod.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <span className="font-medium">{prod.produits_finis?.nom}</span>
                    <span className="text-gray-500 ml-2 text-sm">#{prod.numero_lot_produit}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[prod.statut]}`}>
                    {statutLabels[prod.statut]}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">{prod.quantite_produite} unités</span>
                  <span className="text-sm text-gray-400">{prod.date_production}</span>
                  <span className="text-gray-400">{expanded === prod.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === prod.id && (
                <div className="border-t px-5 py-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Traçabilité - Lots utilisés :</h3>
                  {prod.production_lots?.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs uppercase">
                          <th className="text-left py-1">N° Lot</th>
                          <th className="text-left py-1">Matière</th>
                          <th className="text-right py-1">Quantité utilisée</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prod.production_lots.map((pl, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 font-mono">{pl.lots?.numero_lot}</td>
                            <td className="py-2 text-gray-600">{pl.lots?.matieres_premieres?.nom}</td>
                            <td className="py-2 text-right">{pl.quantite_utilisee}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-400 text-sm">Aucun lot associé</p>
                  )}

                  {prod.notes && <p className="text-sm text-gray-500 mt-3">Notes: {prod.notes}</p>}

                  {prod.statut === 'en_cours' && (
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => updateStatut(prod.id, 'terminee')} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                        Marquer terminée
                      </button>
                      <button onClick={() => updateStatut(prod.id, 'annulee')} className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
