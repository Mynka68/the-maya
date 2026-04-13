'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface ProduitFini {
  id: string
  nom: string
  matiere_premiere_id: string | null
  matieres_premieres: { nom: string; unite: string; categorie: string } | null
}

interface Lot {
  id: string
  numero_lot: string
  quantite_restante: number
  date_peremption: string
  matiere_premiere_id: string
  matieres_premieres: { nom: string; unite: string } | null
}

interface LotUsage { lot_id: string; quantite_utilisee: string }

function getPeremptionColor(dateStr: string): string {
  const today = new Date()
  const peremption = new Date(dateStr)
  const diffDays = Math.ceil((peremption.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'text-red-600'
  if (diffDays <= 30) return 'text-red-500'
  if (diffDays <= 60) return 'text-orange-500'
  return 'text-gray-600'
}

function getDaysLeft(dateStr: string): string {
  const today = new Date()
  const peremption = new Date(dateStr)
  const diffDays = Math.ceil((peremption.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `périmé depuis ${Math.abs(diffDays)}j`
  return `${diffDays}j restants`
}

export default function NouvelleProductionPage() {
  const router = useRouter()
  const [produits, setProduits] = useState<ProduitFini[]>([])
  const [allLots, setAllLots] = useState<Lot[]>([])
  const [produitId, setProduitId] = useState('')
  const [dateProduction, setDateProduction] = useState(new Date().toISOString().split('T')[0])
  const [quantiteProduite, setQuantiteProduite] = useState('')
  const [numeroLotProduit, setNumeroLotProduit] = useState('')
  const [notes, setNotes] = useState('')
  const [lotsUtilises, setLotsUtilises] = useState<LotUsage[]>([{ lot_id: '', quantite_utilisee: '' }])
  const [saving, setSaving] = useState(false)

  // Derived state
  const selectedProduit = produits.find(p => p.id === produitId)
  const matiereAssociee = selectedProduit?.matieres_premieres
  const matiereId = selectedProduit?.matiere_premiere_id

  // Lots filtrés pour la matière première du produit sélectionné
  const lotsDisponibles = matiereId
    ? allLots.filter(l => l.matiere_premiere_id === matiereId)
    : allLots

  useEffect(() => {
    Promise.all([
      supabase.from('produits_finis').select('id, nom, matiere_premiere_id, matieres_premieres(nom, unite, categorie)').order('nom'),
      supabase.from('lots').select('id, numero_lot, quantite_restante, date_peremption, matiere_premiere_id, matieres_premieres(nom, unite)')
        .in('statut', ['disponible', 'en_cours'])
        .gt('quantite_restante', 0)
        .order('date_peremption', { ascending: true }),
    ]).then(([p, l]) => {
      setProduits((p.data as unknown as ProduitFini[]) || [])
      setAllLots((l.data as unknown as Lot[]) || [])
    })
  }, [])

  // Quand on sélectionne un produit, auto-sélectionner le lot FEFO
  function handleProduitChange(newProduitId: string) {
    setProduitId(newProduitId)

    const produit = produits.find(p => p.id === newProduitId)
    if (produit?.matiere_premiere_id) {
      // Trouver le lot avec la date de péremption la plus proche (FEFO)
      const lotsMatiere = allLots.filter(l => l.matiere_premiere_id === produit.matiere_premiere_id)
      if (lotsMatiere.length > 0) {
        // Le premier lot est déjà le plus proche (trié par date_peremption ASC)
        setLotsUtilises([{ lot_id: lotsMatiere[0].id, quantite_utilisee: '' }])
      } else {
        setLotsUtilises([{ lot_id: '', quantite_utilisee: '' }])
      }
    } else {
      setLotsUtilises([{ lot_id: '', quantite_utilisee: '' }])
    }
  }

  function updateLotUsage(index: number, field: keyof LotUsage, value: string) {
    const updated = [...lotsUtilises]
    updated[index] = { ...updated[index], [field]: value }
    setLotsUtilises(updated)
  }

  function addLotUsage() {
    // Auto-sélectionner le prochain lot FEFO non encore utilisé
    const usedLotIds = lotsUtilises.map(l => l.lot_id)
    const nextLot = lotsDisponibles.find(l => !usedLotIds.includes(l.id))
    setLotsUtilises([...lotsUtilises, { lot_id: nextLot?.id || '', quantite_utilisee: '' }])
  }

  function removeLotUsage(index: number) {
    if (lotsUtilises.length === 1) return
    setLotsUtilises(lotsUtilises.filter((_, i) => i !== index))
  }

  function getLotInfo(lotId: string) {
    return allLots.find(l => l.id === lotId)
  }

  async function save() {
    if (!produitId || !quantiteProduite || !numeroLotProduit) {
      alert('Veuillez remplir le produit, la quantité et le n° de lot produit')
      return
    }
    const validLots = lotsUtilises.filter(l => l.lot_id && l.quantite_utilisee)
    if (validLots.length === 0) {
      alert('Veuillez sélectionner au moins un lot à consommer')
      return
    }

    // Vérifier les quantités
    for (const lu of validLots) {
      const lot = getLotInfo(lu.lot_id)
      if (lot && parseFloat(lu.quantite_utilisee) > lot.quantite_restante) {
        alert(`Quantité demandée pour le lot ${lot.numero_lot} dépasse le stock restant (${lot.quantite_restante} ${lot.matieres_premieres?.unite})`)
        return
      }
    }

    setSaving(true)

    const { data: production, error } = await supabase.from('productions').insert({
      produit_fini_id: produitId,
      date_production: dateProduction,
      quantite_produite: parseFloat(quantiteProduite),
      numero_lot_produit: numeroLotProduit,
      notes: notes || null,
    }).select().single()

    if (error || !production) {
      alert('Erreur lors de la création de la production')
      setSaving(false)
      return
    }

    // Insérer les lots utilisés
    const productionLots = validLots.map(l => ({
      production_id: production.id,
      lot_id: l.lot_id,
      quantite_utilisee: parseFloat(l.quantite_utilisee),
    }))
    await supabase.from('production_lots').insert(productionLots)

    // Mettre à jour les quantités restantes des lots
    for (const lu of validLots) {
      const lot = getLotInfo(lu.lot_id)
      if (lot) {
        const newQty = lot.quantite_restante - parseFloat(lu.quantite_utilisee)
        await supabase.from('lots').update({
          quantite_restante: newQty,
          statut: newQty <= 0 ? 'epuise' : 'en_cours',
        }).eq('id', lu.lot_id)
      }
    }

    router.push('/production')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Nouvelle production</h1>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Produit fini</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            <select value={produitId} onChange={(e) => handleProduitChange(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
              <option value="">-- Sélectionner --</option>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° lot produit *</label>
            <input value={numeroLotProduit} onChange={(e) => setNumeroLotProduit(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantité produite *</label>
            <input type="number" step="0.01" value={quantiteProduite} onChange={(e) => setQuantiteProduite(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de production</label>
            <input type="date" value={dateProduction} onChange={(e) => setDateProduction(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
        </div>

        {/* Bandeau matière première associée */}
        {selectedProduit && matiereAssociee && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <span className="text-green-600 text-lg">🍃</span>
            <div>
              <p className="text-sm font-medium text-green-800">
                Matière première : <strong>{matiereAssociee.nom}</strong> ({matiereAssociee.unite})
              </p>
              <p className="text-xs text-green-600">
                {lotsDisponibles.length} lot(s) disponible(s) — le lot avec la péremption la plus proche est pré-sélectionné
              </p>
            </div>
          </div>
        )}

        {selectedProduit && !matiereAssociee && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <p className="text-sm text-yellow-800">
              Ce produit n&apos;a pas de matière première associée. Allez dans <strong>Produits finis</strong> pour en associer une.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">
            Lots consommés (traçabilité)
            {matiereAssociee && <span className="text-sm font-normal text-gray-500 ml-2">— {matiereAssociee.nom}</span>}
          </h2>
          <button onClick={addLotUsage} className="text-primary hover:underline text-sm">+ Ajouter un lot</button>
        </div>

        <div className="space-y-3">
          {lotsUtilises.map((lu, i) => {
            const lotInfo = getLotInfo(lu.lot_id)
            const isFefo = i === 0 && lotInfo && lotsDisponibles.length > 0 && lotInfo.id === lotsDisponibles[0]?.id
            return (
              <div key={i} className={`border rounded-lg p-3 ${isFefo ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                {isFefo && (
                  <div className="mb-2">
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
                      FEFO — Péremption la plus proche
                    </span>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Lot *</label>
                    <select value={lu.lot_id} onChange={(e) => updateLotUsage(i, 'lot_id', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm">
                      <option value="">-- Sélectionner un lot --</option>
                      {lotsDisponibles.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.numero_lot} — {l.matieres_premieres?.nom} — reste: {l.quantite_restante} {l.matieres_premieres?.unite} — exp: {l.date_peremption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <label className="block text-xs text-gray-500 mb-1">
                      Quantité * {lotInfo && <span className="text-gray-400">(max: {lotInfo.quantite_restante})</span>}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lu.quantite_utilisee}
                      onChange={(e) => updateLotUsage(i, 'quantite_utilisee', e.target.value)}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                    />
                  </div>
                  {lotsUtilises.length > 1 && (
                    <button onClick={() => removeLotUsage(i)} className="text-red-500 hover:underline text-sm pb-2">Retirer</button>
                  )}
                </div>
                {lotInfo && (
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="text-gray-500">Stock restant: <strong>{lotInfo.quantite_restante} {lotInfo.matieres_premieres?.unite}</strong></span>
                    <span className={getPeremptionColor(lotInfo.date_peremption)}>
                      Péremption: {lotInfo.date_peremption} ({getDaysLeft(lotInfo.date_peremption)})
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={save} disabled={saving} className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer la production'}
        </button>
        <button onClick={() => router.push('/production')} className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300">
          Annuler
        </button>
      </div>
    </div>
  )
}
