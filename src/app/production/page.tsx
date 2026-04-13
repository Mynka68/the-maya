'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface ProductionLigne {
  type_conditionnement: string
  grammage: number
  quantite: number
}

interface Production {
  id: string
  date_production: string
  quantite_produite: number
  type_conditionnement: string | null
  grammage: number | null
  numero_lot_produit: string
  statut: string
  notes: string | null
  produits_finis: { nom: string } | null
  production_lots: { quantite_utilisee: number; lots: { numero_lot: string; matieres_premieres: { nom: string; unite: string } | null } | null }[]
  production_lignes: ProductionLigne[]
}

const condLabels: Record<string, string> = { sachet: 'Sachet', boite: 'Boîte', echantillon: 'Échantillon' }
const condIcons: Record<string, string> = { sachet: '📦', boite: '🎁', echantillon: '🧪' }

const statutLabels: Record<string, string> = { en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' }
const statutColors: Record<string, string> = { en_cours: 'bg-blue-100 text-blue-800', terminee: 'bg-green-100 text-green-800', annulee: 'bg-red-100 text-red-800' }

function getTotalWeight(prod: Production): number {
  if (prod.production_lignes?.length > 0) {
    return prod.production_lignes.reduce((sum, l) => sum + l.quantite * l.grammage, 0) / 1000
  }
  if (prod.type_conditionnement && prod.grammage) {
    return prod.quantite_produite * prod.grammage / 1000
  }
  return 0
}

export default function ProductionPage() {
  const [productions, setProductions] = useState<Production[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('productions')
      .select('*, produits_finis(nom), production_lots(quantite_utilisee, lots(numero_lot, matieres_premieres(nom, unite))), production_lignes(type_conditionnement, grammage, quantite)')
      .order('date_production', { ascending: false })
    setProductions((data as unknown as Production[]) || [])
    setLoading(false)
  }

  async function markTerminee(id: string) {
    await supabase.from('productions').update({ statut: 'terminee' }).eq('id', id)
    load()
  }

  async function annulerProduction(id: string) {
    if (!confirm('Annuler cette production ? Les quantités seront restituées aux lots et la production sera supprimée.')) return

    // Get lots used by this production
    const { data: productionLots } = await supabase
      .from('production_lots')
      .select('lot_id, quantite_utilisee')
      .eq('production_id', id)

    // Restore quantities to each lot
    if (productionLots && productionLots.length > 0) {
      for (const pl of productionLots) {
        const { data: lot } = await supabase
          .from('lots')
          .select('quantite_restante, quantite_recue')
          .eq('id', pl.lot_id)
          .single()

        if (lot) {
          const newQty = lot.quantite_restante + pl.quantite_utilisee
          await supabase.from('lots').update({
            quantite_restante: newQty,
            statut: newQty >= lot.quantite_recue ? 'disponible' : 'en_cours',
          }).eq('id', pl.lot_id)
        }
      }
    }

    // Delete production (cascade deletes production_lots and production_lignes)
    await supabase.from('production_lots').delete().eq('production_id', id)
    await supabase.from('production_lignes').delete().eq('production_id', id)
    await supabase.from('productions').delete().eq('id', id)

    load()
  }

  function renderConditionnements(prod: Production) {
    // New format: multiple lines
    if (prod.production_lignes?.length > 0) {
      return (
        <div className="flex flex-wrap gap-2">
          {prod.production_lignes.map((l, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
              {condIcons[l.type_conditionnement] || ''} {l.quantite} x {condLabels[l.type_conditionnement] || l.type_conditionnement} {l.grammage}g
            </span>
          ))}
        </div>
      )
    }
    // Legacy: single type
    if (prod.type_conditionnement && prod.grammage) {
      return (
        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
          {condIcons[prod.type_conditionnement] || ''} {prod.quantite_produite} x {condLabels[prod.type_conditionnement] || prod.type_conditionnement} {prod.grammage}g
        </span>
      )
    }
    return <span className="text-sm text-gray-500">{prod.quantite_produite} unités</span>
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
          {productions.map((prod) => {
            const totalKg = getTotalWeight(prod)
            return (
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
                    {renderConditionnements(prod)}
                    {totalKg > 0 && (
                      <span className="text-xs text-gray-400">({totalKg.toFixed(3)} kg)</span>
                    )}
                    <span className="text-sm text-gray-400">{prod.date_production}</span>
                    <span className="text-gray-400">{expanded === prod.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded === prod.id && (
                  <div className="border-t px-5 py-4">
                    {/* Détail conditionnements */}
                    {prod.production_lignes?.length > 1 && (
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-600 mb-2">Détail conditionnements :</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {prod.production_lignes.map((l, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                              <div className="text-lg">{condIcons[l.type_conditionnement]}</div>
                              <div className="text-sm font-medium mt-1">{l.quantite} x {condLabels[l.type_conditionnement]} {l.grammage}g</div>
                              <div className="text-xs text-gray-400">{(l.quantite * l.grammage / 1000).toFixed(3)} kg</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                              <td className="py-2 text-right">{pl.quantite_utilisee} {pl.lots?.matieres_premieres?.unite}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-gray-400 text-sm">Aucun lot associé</p>
                    )}

                    {prod.notes && <p className="text-sm text-gray-500 mt-3">Notes: {prod.notes}</p>}

                    <div className="flex gap-2 mt-4">
                      <Link
                        href={`/production/fiche?id=${prod.id}`}
                        className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-800"
                      >
                        🖨️ Imprimer la fiche
                      </Link>
                      {prod.statut === 'en_cours' && (
                        <>
                          <button onClick={() => markTerminee(prod.id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                            Marquer terminée
                          </button>
                          <button onClick={() => annulerProduction(prod.id)} className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                            Annuler et supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
