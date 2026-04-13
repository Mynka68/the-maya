'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface ProductionLigne {
  type_conditionnement: string
  grammage: number
  quantite: number
}

interface ProductionLot {
  quantite_utilisee: number
  lots: {
    numero_lot: string
    date_peremption: string
    matieres_premieres: { nom: string; unite: string } | null
  } | null
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
  created_at: string
  produits_finis: {
    nom: string
    matieres_premieres: { nom: string; unite: string } | null
  } | null
  production_lots: ProductionLot[]
  production_lignes: ProductionLigne[]
}

const condLabels: Record<string, string> = { sachet: 'Sachet', boite: 'Boite', echantillon: 'Echantillon' }

export default function FicheProductionPage() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [production, setProduction] = useState<Production | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('productions')
      .select('*, produits_finis(nom, matieres_premieres(nom, unite)), production_lots(quantite_utilisee, lots(numero_lot, date_peremption, matieres_premieres(nom, unite))), production_lignes(type_conditionnement, grammage, quantite)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setProduction(data as unknown as Production)
        setLoading(false)
      })
  }, [id])

  if (loading) return <p className="p-8 text-gray-500">Chargement...</p>
  if (!production) return <p className="p-8 text-red-500">Production introuvable</p>

  const hasLignes = production.production_lignes?.length > 0
  const lignes = hasLignes
    ? production.production_lignes
    : production.type_conditionnement && production.grammage
      ? [{ type_conditionnement: production.type_conditionnement, grammage: production.grammage, quantite: production.quantite_produite }]
      : []

  const totalPoids = lignes.reduce((sum, l) => sum + l.quantite * l.grammage, 0)
  const totalUnites = lignes.reduce((sum, l) => sum + l.quantite, 0)
  const matiere = production.produits_finis?.matieres_premieres

  return (
    <>
      {/* Styles d'impression */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #fiche-production, #fiche-production * { visibility: visible; }
          #fiche-production { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Barre d'actions (masquée à l'impression) */}
      <div className="no-print flex gap-3 mb-6">
        <button
          onClick={() => window.print()}
          className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition"
        >
          Imprimer la fiche
        </button>
        <Link href="/production" className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">
          Retour
        </Link>
      </div>

      {/* Fiche de production */}
      <div id="fiche-production" className="bg-white max-w-3xl mx-auto">
        {/* En-tete */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">FICHE DE PRODUCTION</h1>
              <p className="text-sm text-gray-600 mt-1">The Maya</p>
            </div>
            <div className="text-right text-sm">
              <p><strong>Date :</strong> {production.date_production}</p>
              <p><strong>Ref :</strong> {production.numero_lot_produit}</p>
              <p className="mt-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  production.statut === 'terminee' ? 'bg-green-100 text-green-800' :
                  production.statut === 'annulee' ? 'bg-red-100 text-red-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {production.statut === 'terminee' ? 'Terminee' : production.statut === 'annulee' ? 'Annulee' : 'En cours'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Produit */}
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Produit fini</h2>
          <div className="border rounded-lg p-4">
            <p className="text-lg font-bold">{production.produits_finis?.nom}</p>
            {matiere && (
              <p className="text-sm text-gray-600 mt-1">
                Matiere premiere : <strong>{matiere.nom}</strong> ({matiere.unite})
              </p>
            )}
          </div>
        </div>

        {/* Conditionnements */}
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Conditionnements</h2>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2 text-left text-sm">Type</th>
                <th className="border px-4 py-2 text-right text-sm">Grammage</th>
                <th className="border px-4 py-2 text-right text-sm">Quantite</th>
                <th className="border px-4 py-2 text-right text-sm">Poids total</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td className="border px-4 py-2 text-sm">{condLabels[l.type_conditionnement] || l.type_conditionnement}</td>
                  <td className="border px-4 py-2 text-right text-sm">{l.grammage}g</td>
                  <td className="border px-4 py-2 text-right text-sm font-medium">{l.quantite}</td>
                  <td className="border px-4 py-2 text-right text-sm">{(l.quantite * l.grammage / 1000).toFixed(3)} kg</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td className="border px-4 py-2 text-sm" colSpan={2}>TOTAL</td>
                <td className="border px-4 py-2 text-right text-sm">{totalUnites} unites</td>
                <td className="border px-4 py-2 text-right text-sm">{(totalPoids / 1000).toFixed(3)} kg</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Lots utilises */}
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Lots de matiere premiere utilises</h2>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2 text-left text-sm">N lot</th>
                <th className="border px-4 py-2 text-left text-sm">Matiere</th>
                <th className="border px-4 py-2 text-right text-sm">Quantite utilisee</th>
                <th className="border px-4 py-2 text-left text-sm">Date peremption</th>
              </tr>
            </thead>
            <tbody>
              {production.production_lots.map((pl, i) => (
                <tr key={i}>
                  <td className="border px-4 py-2 text-sm font-mono">{pl.lots?.numero_lot}</td>
                  <td className="border px-4 py-2 text-sm">{pl.lots?.matieres_premieres?.nom}</td>
                  <td className="border px-4 py-2 text-right text-sm font-medium">{pl.quantite_utilisee} {pl.lots?.matieres_premieres?.unite}</td>
                  <td className="border px-4 py-2 text-sm">{pl.lots?.date_peremption}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td className="border px-4 py-2 text-sm" colSpan={2}>TOTAL CONSOMME</td>
                <td className="border px-4 py-2 text-right text-sm">
                  {production.production_lots.reduce((s, pl) => s + pl.quantite_utilisee, 0).toFixed(3)} {matiere?.unite || 'kg'}
                </td>
                <td className="border px-4 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {production.notes && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase text-gray-500 mb-2">Notes</h2>
            <div className="border rounded-lg p-4 text-sm">{production.notes}</div>
          </div>
        )}

        {/* Zone signatures */}
        <div className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm font-bold uppercase text-gray-500 mb-1">Prepare par</p>
            <div className="border-b border-gray-400 h-16"></div>
            <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-gray-500 mb-1">Verifie par</p>
            <div className="border-b border-gray-400 h-16"></div>
            <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
          </div>
        </div>
      </div>
    </>
  )
}
