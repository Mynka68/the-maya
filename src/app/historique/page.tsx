'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { downloadCsv } from '@/lib/csv'

interface ProduitFini {
  id: string
  nom: string
  matiere_premiere_id: string | null
  matieres_premieres: { nom: string; unite: string } | null
}

interface LotHist {
  id: string
  numero_lot: string
  quantite_recue: number
  quantite_restante: number
  statut: string
  created_at: string
  date_peremption: string
  receptions: { date_reception: string; numero_bl: string | null; fournisseurs: { nom: string } | null } | null
}

interface ProdHist {
  quantite_utilisee: number
  lots: { numero_lot: string } | null
  productions: {
    id: string
    date_production: string
    numero_lot_produit: string
    statut: string
    produits_finis: { nom: string } | null
    production_lignes: { type_conditionnement: string; grammage: number; quantite: number }[]
  } | null
}

interface Mouvement {
  date: string
  type: 'reception' | 'production'
  reference: string
  detail: string
  entree: number
  sortie: number
  solde: number
  productionId?: string
}

const condLabels: Record<string, string> = { sachet: 'Sachet', boite: 'Boîte', pot: 'Pot', echantillon: 'Échantillon' }
const statutProdLabels: Record<string, string> = { en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' }

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })

export default function HistoriquePage() {
  const [produits, setProduits] = useState<ProduitFini[]>([])
  const [produitId, setProduitId] = useState('')
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [lots, setLots] = useState<LotHist[]>([])
  const [loading, setLoading] = useState(false)

  const selected = produits.find(p => p.id === produitId)
  const unite = selected?.matieres_premieres?.unite || 'kg'

  useEffect(() => {
    supabase
      .from('produits_finis')
      .select('id, nom, matiere_premiere_id, matieres_premieres(nom, unite)')
      .not('matiere_premiere_id', 'is', null)
      .order('nom')
      .then(({ data }) => setProduits((data as unknown as ProduitFini[]) || []))
  }, [])

  const loadHistorique = useCallback(async (matiereId: string) => {
    setLoading(true)

    const [lotsRes, prodsRes] = await Promise.all([
      supabase
        .from('lots')
        .select('id, numero_lot, quantite_recue, quantite_restante, statut, created_at, date_peremption, receptions(date_reception, numero_bl, fournisseurs(nom))')
        .eq('matiere_premiere_id', matiereId)
        .order('created_at', { ascending: true }),
      supabase
        .from('production_lots')
        .select('quantite_utilisee, lots!inner(numero_lot, matiere_premiere_id), productions(id, date_production, numero_lot_produit, statut, produits_finis(nom), production_lignes(type_conditionnement, grammage, quantite))')
        .eq('lots.matiere_premiere_id', matiereId),
    ])

    const lotsData = (lotsRes.data as unknown as LotHist[]) || []
    const prodsData = (prodsRes.data as unknown as ProdHist[]) || []
    setLots(lotsData)

    // Entrées : une ligne par lot reçu
    const entrees = lotsData.map(lot => ({
      date: lot.receptions?.date_reception || lot.created_at.split('T')[0],
      type: 'reception' as const,
      reference: lot.numero_lot,
      detail: [
        lot.receptions?.fournisseurs?.nom,
        lot.receptions?.numero_bl ? `BL ${lot.receptions.numero_bl}` : null,
        `DLUO ${lot.date_peremption}`,
      ].filter(Boolean).join(' · '),
      entree: Number(lot.quantite_recue),
      sortie: 0,
    }))

    // Sorties : consommations regroupées par production
    const byProduction = new Map<string, { date: string; reference: string; statut: string; lignes: string; lots: string[]; total: number }>()
    for (const pl of prodsData) {
      const prod = pl.productions
      if (!prod) continue
      const existing = byProduction.get(prod.id)
      if (existing) {
        existing.total += Number(pl.quantite_utilisee)
        if (pl.lots?.numero_lot) existing.lots.push(pl.lots.numero_lot)
      } else {
        byProduction.set(prod.id, {
          date: prod.date_production,
          reference: prod.numero_lot_produit,
          statut: prod.statut,
          lignes: (prod.production_lignes || [])
            .map(l => `${l.quantite} x ${condLabels[l.type_conditionnement] || l.type_conditionnement} ${l.grammage}g`)
            .join(', '),
          lots: pl.lots?.numero_lot ? [pl.lots.numero_lot] : [],
          total: Number(pl.quantite_utilisee),
        })
      }
    }

    const sorties = Array.from(byProduction.entries()).map(([id, p]) => ({
      date: p.date,
      type: 'production' as const,
      reference: p.reference,
      detail: [p.lignes, p.lots.length ? `lot(s) ${p.lots.join(', ')}` : null, statutProdLabels[p.statut] || null]
        .filter(Boolean).join(' · '),
      entree: 0,
      sortie: p.total,
      productionId: id,
    }))

    // Chronologie + solde courant (réceptions avant productions à date égale)
    const all = [...entrees, ...sorties].sort((a, b) =>
      a.date === b.date ? (a.type === 'reception' ? -1 : 1) - (b.type === 'reception' ? -1 : 1) : a.date.localeCompare(b.date)
    )
    let solde = 0
    setMouvements(all.map(m => {
      solde = Math.round((solde + m.entree - m.sortie) * 1000) / 1000
      return { ...m, solde }
    }))

    setLoading(false)
  }, [])

  function handleProduitChange(id: string) {
    setProduitId(id)
    const p = produits.find(x => x.id === id)
    if (p?.matiere_premiere_id) {
      loadHistorique(p.matiere_premiere_id)
    } else {
      setMouvements([])
      setLots([])
    }
  }

  const totalRecu = mouvements.reduce((s, m) => s + m.entree, 0)
  const totalConsomme = mouvements.reduce((s, m) => s + m.sortie, 0)
  const soldeFinal = mouvements.length > 0 ? mouvements[mouvements.length - 1].solde : 0
  const stockReel = lots.reduce((s, l) => s + Number(l.quantite_restante), 0)
  const ecart = Math.round((stockReel - soldeFinal) * 1000) / 1000

  function exportCsv() {
    downloadCsv(`historique_${(selected?.nom || 'produit').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
      mouvements.map(m => ({
        'Date': m.date,
        'Type': m.type === 'reception' ? 'Réception' : 'Production',
        'Référence': m.reference,
        'Détail': m.detail,
        [`Entrée (${unite})`]: m.entree || '',
        [`Sortie (${unite})`]: m.sortie || '',
        [`Solde (${unite})`]: m.solde,
      })))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Historique</h1>
        {mouvements.length > 0 && (
          <button onClick={exportCsv} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition text-sm">
            ⬇️ Export CSV
          </button>
        )}
      </div>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Produit fini *</label>
        <select value={produitId} onChange={(e) => handleProduitChange(e.target.value)} className="border rounded-lg px-3 py-2 w-full max-w-lg">
          <option value="">-- Sélectionner un produit fini --</option>
          {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        {selected?.matieres_premieres && (
          <p className="text-xs text-gray-500 mt-2">
            Matière première suivie : <strong>{selected.matieres_premieres.nom}</strong> ({unite})
          </p>
        )}
      </div>

      {loading && <p className="text-gray-500">Chargement de l&apos;historique...</p>}

      {!loading && produitId && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-lg shadow p-5">
              <p className="text-sm text-gray-500">Total reçu</p>
              <p className="text-2xl font-bold text-green-600">+{fmt(totalRecu)} {unite}</p>
            </div>
            <div className="bg-card rounded-lg shadow p-5">
              <p className="text-sm text-gray-500">Total consommé</p>
              <p className="text-2xl font-bold text-red-500">-{fmt(totalConsomme)} {unite}</p>
            </div>
            <div className="bg-card rounded-lg shadow p-5">
              <p className="text-sm text-gray-500">Stock restant (calculé)</p>
              <p className="text-2xl font-bold text-primary">{fmt(soldeFinal)} {unite}</p>
            </div>
            <div className={`bg-card rounded-lg shadow p-5 ${ecart !== 0 ? 'border border-orange-300' : ''}`}>
              <p className="text-sm text-gray-500">Stock en base</p>
              <p className={`text-2xl font-bold ${ecart !== 0 ? 'text-orange-500' : 'text-primary'}`}>{fmt(stockReel)} {unite}</p>
              {ecart !== 0 && <p className="text-xs text-orange-600 mt-1">⚠️ Écart de {fmt(ecart)} {unite} avec l&apos;historique</p>}
            </div>
          </div>

          {mouvements.length === 0 ? (
            <p className="text-gray-400 text-center py-8 bg-card rounded-lg shadow">Aucun mouvement pour ce produit</p>
          ) : (
            <div className="bg-card rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mouvement</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Référence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Détail</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entrée</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sortie</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Solde</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mouvements.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{m.date}</td>
                      <td className="px-4 py-3">
                        {m.type === 'reception' ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">📦 Réception</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">🏭 Production</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">
                        {m.productionId ? (
                          <Link href={`/production/fiche?id=${m.productionId}`} className="text-primary hover:underline">{m.reference}</Link>
                        ) : m.reference}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{m.detail}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                        {m.entree > 0 ? `+${fmt(m.entree)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-500 font-medium">
                        {m.sortie > 0 ? `-${fmt(m.sortie)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold">{fmt(m.solde)} {unite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!produitId && !loading && (
        <p className="text-gray-400 text-center py-12">Sélectionnez un produit fini pour voir son historique complet : réceptions, productions et stock justifié.</p>
      )}
    </div>
  )
}
