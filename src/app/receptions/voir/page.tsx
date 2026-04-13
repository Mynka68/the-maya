'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DocumentManager from '@/components/DocumentManager'

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
}

interface Reception {
  id: string
  date_reception: string
  numero_bl: string | null
  notes: string | null
  created_at: string
  fournisseurs: { nom: string; contact: string | null; email: string | null; telephone: string | null } | null
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
  if (diffDays < 0) return '⚠️ Périmé'
  if (diffDays <= 30) return `⚠️ ${diffDays}j restants`
  if (diffDays <= 60) return `${diffDays}j restants`
  return null
}

export default function VoirReceptionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [reception, setReception] = useState<Reception | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      router.push('/receptions')
      return
    }
    loadData(id)
  }, [id])

  async function loadData(receptionId: string) {
    const [recResult, lotsResult] = await Promise.all([
      supabase
        .from('receptions')
        .select('*, fournisseurs(nom, contact, email, telephone)')
        .eq('id', receptionId)
        .single(),
      supabase
        .from('lots')
        .select('*, matieres_premieres(nom, categorie, unite)')
        .eq('reception_id', receptionId)
        .order('created_at'),
    ])

    if (!recResult.data) {
      alert('Réception introuvable')
      router.push('/receptions')
      return
    }

    setReception(recResult.data as unknown as Reception)
    setLots((lotsResult.data as unknown as Lot[]) || [])
    setLoading(false)
  }

  if (loading) {
    return <p className="text-gray-500">Chargement...</p>
  }

  if (!reception || !id) return null

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Réception du {reception.date_reception}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Créée le {new Date(reception.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/receptions/nouveau?id=${id}`}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition text-sm"
          >
            ✏️ Modifier
          </Link>
          <button
            onClick={() => router.push('/receptions')}
            className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 transition text-sm"
          >
            ← Retour
          </button>
        </div>
      </div>

      {/* Informations générales */}
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4 text-gray-800">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date de réception</p>
            <p className="font-medium">{reception.date_reception}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fournisseur</p>
            <p className="font-medium">{reception.fournisseurs?.nom || <span className="text-gray-400">Non renseigné</span>}</p>
            {reception.fournisseurs?.email && (
              <p className="text-xs text-gray-400 mt-0.5">{reception.fournisseurs.email}</p>
            )}
            {reception.fournisseurs?.telephone && (
              <p className="text-xs text-gray-400">{reception.fournisseurs.telephone}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">N° Bon de livraison</p>
            <p className="font-medium">{reception.numero_bl || <span className="text-gray-400">-</span>}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{reception.notes || <span className="text-gray-400">-</span>}</p>
          </div>
        </div>
      </div>

      {/* Lots */}
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">Lots reçus ({lots.length})</h2>
        </div>

        {lots.length === 0 ? (
          <p className="text-gray-400 text-center py-4">Aucun lot enregistré</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matière</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Lot</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qté reçue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qté restante</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date fab.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date péremption</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lots.map((lot) => {
                  const peremptionLabel = getPeremptionLabel(lot.date_peremption)
                  const usedPercent = lot.quantite_recue > 0
                    ? ((lot.quantite_recue - lot.quantite_restante) / lot.quantite_recue * 100).toFixed(0)
                    : '0'
                  return (
                    <tr key={lot.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{lot.matieres_premieres?.nom || '-'}</span>
                          {lot.matieres_premieres?.categorie && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${categorieColors[lot.matieres_premieres.categorie]}`}>
                              {categorieLabels[lot.matieres_premieres.categorie]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">{lot.numero_lot}</td>
                      <td className="px-4 py-3 text-sm">
                        {lot.quantite_recue} {lot.matieres_premieres?.unite || ''}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={lot.quantite_restante === 0 ? 'text-gray-400' : 'font-medium'}>
                            {lot.quantite_restante} {lot.matieres_premieres?.unite || ''}
                          </span>
                          {lot.quantite_restante < lot.quantite_recue && (
                            <span className="text-xs text-gray-400">({usedPercent}% utilisé)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{lot.date_fabrication || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <span className={getPeremptionColor(lot.date_peremption)}>{lot.date_peremption}</span>
                          {peremptionLabel && (
                            <p className="text-xs mt-0.5">{peremptionLabel}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${statutColors[lot.statut] || 'bg-gray-100 text-gray-600'}`}>
                          {statutLabels[lot.statut] || lot.statut}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{lot.notes || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-card rounded-lg shadow p-6">
        <DocumentManager
          entityType="reception"
          entityId={id}
          label="Documents de réception (bons de livraison, certificats...)"
        />
      </div>
    </div>
  )
}
