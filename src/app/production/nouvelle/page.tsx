'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface ProduitFini { id: string; nom: string }
interface Lot {
  id: string
  numero_lot: string
  quantite_restante: number
  date_peremption: string
  matieres_premieres: { nom: string; unite: string }
}
interface LotUsage { lot_id: string; quantite_utilisee: string }

export default function NouvelleProductionPage() {
  const router = useRouter()
  const [produits, setProduits] = useState<ProduitFini[]>([])
  const [lotsDisponibles, setLotsDisponibles] = useState<Lot[]>([])
  const [produitId, setProduitId] = useState('')
  const [dateProduction, setDateProduction] = useState(new Date().toISOString().split('T')[0])
  const [quantiteProduite, setQuantiteProduite] = useState('')
  const [numeroLotProduit, setNumeroLotProduit] = useState('')
  const [notes, setNotes] = useState('')
  const [lotsUtilises, setLotsUtilises] = useState<LotUsage[]>([{ lot_id: '', quantite_utilisee: '' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('produits_finis').select('id, nom').order('nom'),
      supabase.from('lots').select('id, numero_lot, quantite_restante, date_peremption, matieres_premieres(nom, unite)')
        .in('statut', ['disponible', 'en_cours'])
        .gt('quantite_restante', 0)
        .order('date_peremption', { ascending: true }),
    ]).then(([p, l]) => {
      setProduits(p.data || [])
      setLotsDisponibles(l.data || [])
    })
  }, [])

  function updateLotUsage(index: number, field: keyof LotUsage, value: string) {
    const updated = [...lotsUtilises]
    updated[index] = { ...updated[index], [field]: value }
    setLotsUtilises(updated)
  }

  function addLotUsage() {
    setLotsUtilises([...lotsUtilises, { lot_id: '', quantite_utilisee: '' }])
  }

  function removeLotUsage(index: number) {
    if (lotsUtilises.length === 1) return
    setLotsUtilises(lotsUtilises.filter((_, i) => i !== index))
  }

  function getLotInfo(lotId: string) {
    return lotsDisponibles.find(l => l.id === lotId)
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
            <select value={produitId} onChange={(e) => setProduitId(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
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
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Lots consommés (traçabilité)</h2>
          <button onClick={addLotUsage} className="text-primary hover:underline text-sm">+ Ajouter un lot</button>
        </div>

        <div className="space-y-3">
          {lotsUtilises.map((lu, i) => {
            const lotInfo = getLotInfo(lu.lot_id)
            return (
              <div key={i} className="flex items-end gap-3 border rounded-lg p-3 bg-gray-50">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Lot *</label>
                  <select value={lu.lot_id} onChange={(e) => updateLotUsage(i, 'lot_id', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm">
                    <option value="">-- Sélectionner un lot --</option>
                    {lotsDisponibles.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.numero_lot} - {l.matieres_premieres?.nom} (reste: {l.quantite_restante} {l.matieres_premieres?.unite}) - exp: {l.date_peremption}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-48">
                  <label className="block text-xs text-gray-500 mb-1">
                    Quantité * {lotInfo && <span className="text-gray-400">(max: {lotInfo.quantite_restante} {lotInfo.matieres_premieres?.unite})</span>}
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
