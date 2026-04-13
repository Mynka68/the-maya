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

interface LigneConditionnement {
  type: string
  grammage: number
  label: string
  quantite: string
}

interface LotUsage { lot_id: string; quantite_utilisee: string }

const CONDITIONNEMENTS = [
  { type: 'sachet', grammage: 100, label: 'Sachet 100g', icon: '📦' },
  { type: 'sachet', grammage: 50, label: 'Sachet 50g', icon: '📦' },
  { type: 'sachet', grammage: 15, label: 'Sachet 15g', icon: '📦' },
  { type: 'boite', grammage: 100, label: 'Boîte 100g', icon: '🎁' },
  { type: 'boite', grammage: 50, label: 'Boîte 50g', icon: '🎁' },
  { type: 'boite', grammage: 15, label: 'Boîte 15g', icon: '🎁' },
  { type: 'echantillon', grammage: 3, label: 'Échantillon 3g', icon: '🧪' },
]

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
  const [notes, setNotes] = useState('')
  const [lignes, setLignes] = useState<LigneConditionnement[]>([])
  const [lotsUtilises, setLotsUtilises] = useState<LotUsage[]>([])
  const [saving, setSaving] = useState(false)

  const selectedProduit = produits.find(p => p.id === produitId)
  const matiereAssociee = selectedProduit?.matieres_premieres
  const matiereId = selectedProduit?.matiere_premiere_id
  const unite = matiereAssociee?.unite || 'kg'

  const lotsDisponibles = matiereId
    ? allLots.filter(l => l.matiere_premiere_id === matiereId)
    : allLots

  // Calcul du poids total de toutes les lignes
  const poidsTotalGrammes = lignes.reduce((sum, l) => sum + (parseInt(l.quantite) || 0) * l.grammage, 0)
  const poidsTotalKg = poidsTotalGrammes / 1000
  const poidsTotalDisplay = unite === 'kg' ? poidsTotalKg : poidsTotalGrammes
  const totalUnites = lignes.reduce((sum, l) => sum + (parseInt(l.quantite) || 0), 0)

  const totalConsomme = lotsUtilises.reduce((sum, lu) => sum + (parseFloat(lu.quantite_utilisee) || 0), 0)
  const resteAAffecter = poidsTotalDisplay - totalConsomme

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

  function handleProduitChange(newProduitId: string) {
    setProduitId(newProduitId)
    setLignes([])
    const produit = produits.find(p => p.id === newProduitId)
    if (produit?.matiere_premiere_id) {
      const lotsMatiere = allLots.filter(l => l.matiere_premiere_id === produit.matiere_premiere_id)
      if (lotsMatiere.length > 0) {
        setLotsUtilises([{ lot_id: lotsMatiere[0].id, quantite_utilisee: '' }])
      } else {
        setLotsUtilises([{ lot_id: '', quantite_utilisee: '' }])
      }
    } else {
      setLotsUtilises([{ lot_id: '', quantite_utilisee: '' }])
    }
  }

  function addLigne(condIndex: number) {
    const c = CONDITIONNEMENTS[condIndex]
    // Check if already exists
    const existing = lignes.findIndex(l => l.type === c.type && l.grammage === c.grammage)
    if (existing >= 0) return // already added
    setLignes([...lignes, { type: c.type, grammage: c.grammage, label: c.label, quantite: '' }])
  }

  function updateLigneQuantite(index: number, quantite: string) {
    const updated = [...lignes]
    updated[index] = { ...updated[index], quantite }
    setLignes(updated)
  }

  function removeLigne(index: number) {
    setLignes(lignes.filter((_, i) => i !== index))
  }

  function autoFillLots() {
    if (poidsTotalDisplay <= 0) return

    // Build lot list from FEFO order, adding lots as needed
    const newLots: LotUsage[] = []
    let remaining = poidsTotalDisplay

    for (const lot of lotsDisponibles) {
      if (remaining <= 0) break
      const toUse = Math.min(remaining, lot.quantite_restante)
      newLots.push({ lot_id: lot.id, quantite_utilisee: toUse.toFixed(3) })
      remaining -= toUse
    }

    if (newLots.length === 0) {
      newLots.push({ lot_id: '', quantite_utilisee: '' })
    }

    setLotsUtilises(newLots)
  }

  function updateLotUsage(index: number, field: keyof LotUsage, value: string) {
    const updated = [...lotsUtilises]
    updated[index] = { ...updated[index], [field]: value }
    setLotsUtilises(updated)
  }

  function addLotUsage() {
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
    if (!produitId) {
      alert('Veuillez sélectionner un produit')
      return
    }
    const validLignes = lignes.filter(l => parseInt(l.quantite) > 0)
    if (validLignes.length === 0) {
      alert('Veuillez ajouter au moins un conditionnement avec une quantité')
      return
    }
    const validLots = lotsUtilises.filter(l => l.lot_id && l.quantite_utilisee && parseFloat(l.quantite_utilisee) > 0)
    if (validLots.length === 0) {
      alert('Veuillez affecter de la matière première depuis au moins un lot')
      return
    }

    for (const lu of validLots) {
      const lot = getLotInfo(lu.lot_id)
      if (lot && parseFloat(lu.quantite_utilisee) > lot.quantite_restante) {
        alert(`Quantité demandée pour le lot ${lot.numero_lot} dépasse le stock restant (${lot.quantite_restante} ${lot.matieres_premieres?.unite})`)
        return
      }
    }

    setSaving(true)

    // Create production with total quantity and first conditionnement for backward compat
    const { data: production, error } = await supabase.from('productions').insert({
      produit_fini_id: produitId,
      date_production: dateProduction,
      quantite_produite: totalUnites,
      type_conditionnement: validLignes[0].type,
      grammage: validLignes[0].grammage,
      numero_lot_produit: `PROD-${Date.now()}`,
      notes: notes || null,
    }).select().single()

    if (error || !production) {
      alert('Erreur lors de la création de la production')
      setSaving(false)
      return
    }

    // Insert production lines
    const lignesInsert = validLignes.map(l => ({
      production_id: production.id,
      type_conditionnement: l.type,
      grammage: l.grammage,
      quantite: parseInt(l.quantite),
    }))
    await supabase.from('production_lignes').insert(lignesInsert)

    // Insert lot usage
    const productionLots = validLots.map(l => ({
      production_id: production.id,
      lot_id: l.lot_id,
      quantite_utilisee: parseFloat(l.quantite_utilisee),
    }))
    await supabase.from('production_lots').insert(productionLots)

    // Update lot quantities
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

    router.push(`/production/fiche?id=${production.id}`)
  }

  const ligneTypes = lignes.map(l => `${l.type}-${l.grammage}`)

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Nouvelle production</h1>

      {/* Produit */}
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Produit fini</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            <select value={produitId} onChange={(e) => handleProduitChange(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
              <option value="">-- Sélectionner --</option>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de production</label>
            <input type="date" value={dateProduction} onChange={(e) => setDateProduction(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
        </div>

        {selectedProduit && matiereAssociee && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <span className="text-green-600 text-lg">🍃</span>
            <div>
              <p className="text-sm font-medium text-green-800">
                Matière première : <strong>{matiereAssociee.nom}</strong> ({matiereAssociee.unite})
              </p>
              <p className="text-xs text-green-600">
                {lotsDisponibles.length} lot(s) disponible(s)
              </p>
            </div>
          </div>
        )}

        {selectedProduit && !matiereAssociee && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <p className="text-sm text-yellow-800">
              Ce produit n&apos;a pas de matière première associée.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </div>
      </div>

      {/* Conditionnements */}
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Conditionnements</h2>

        {/* Boutons pour ajouter */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
          {CONDITIONNEMENTS.map((c, i) => {
            const key = `${c.type}-${c.grammage}`
            const isAdded = ligneTypes.includes(key)
            return (
              <button
                key={i}
                type="button"
                onClick={() => !isAdded && addLigne(i)}
                disabled={isAdded}
                className={`border rounded-lg px-3 py-3 text-sm text-center transition ${
                  isAdded
                    ? 'border-primary bg-primary/10 text-primary font-medium opacity-60 cursor-not-allowed'
                    : 'border-gray-200 hover:border-primary hover:bg-primary/5 text-gray-700'
                }`}
              >
                <div className="font-medium">{c.icon}</div>
                <div className="mt-1">{c.label}</div>
                {isAdded && <div className="text-xs mt-1">✓ ajouté</div>}
              </button>
            )
          })}
        </div>

        {/* Lignes ajoutées */}
        {lignes.length > 0 ? (
          <div className="space-y-3">
            {lignes.map((ligne, i) => {
              const qte = parseInt(ligne.quantite) || 0
              const poids = qte * ligne.grammage
              const condInfo = CONDITIONNEMENTS.find(c => c.type === ligne.type && c.grammage === ligne.grammage)
              return (
                <div key={i} className="flex items-center gap-3 border rounded-lg p-3 bg-gray-50">
                  <span className="text-lg">{condInfo?.icon || '📦'}</span>
                  <span className="font-medium text-sm w-32">{ligne.label}</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="Nombre d'unités"
                      value={ligne.quantite}
                      onChange={(e) => updateLigneQuantite(i, e.target.value)}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                    />
                  </div>
                  {qte > 0 && (
                    <span className="text-xs text-gray-500 w-28 text-right">
                      = {poids}g ({(poids / 1000).toFixed(3)} kg)
                    </span>
                  )}
                  <button onClick={() => removeLigne(i)} className="text-red-500 hover:underline text-sm">✕</button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center py-4">Cliquez sur un conditionnement ci-dessus pour l&apos;ajouter</p>
        )}

        {/* Résumé total */}
        {lignes.length > 0 && poidsTotalGrammes > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">
                  Total : <strong>{totalUnites} unités</strong> — <strong>{poidsTotalGrammes}g</strong> ({poidsTotalKg.toFixed(3)} kg)
                </p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {lignes.filter(l => parseInt(l.quantite) > 0).map((l, i) => (
                    <span key={i} className="text-xs text-blue-600">
                      {parseInt(l.quantite)} x {l.label}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Matière première nécessaire : <strong>{poidsTotalDisplay.toFixed(3)} {unite}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={autoFillLots}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition whitespace-nowrap"
              >
                Auto-remplir les lots
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lots consommés */}
      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold">
              Lots consommés (traçabilité)
              {matiereAssociee && <span className="text-sm font-normal text-gray-500 ml-2">— {matiereAssociee.nom}</span>}
            </h2>
            {poidsTotalDisplay > 0 && (
              <p className={`text-xs mt-1 ${Math.abs(resteAAffecter) < 0.001 ? 'text-green-600' : resteAAffecter > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                {Math.abs(resteAAffecter) < 0.001
                  ? '✅ Quantité correcte affectée'
                  : resteAAffecter > 0
                    ? `⚠️ Reste ${resteAAffecter.toFixed(3)} ${unite} à affecter`
                    : `❌ Dépassement de ${Math.abs(resteAAffecter).toFixed(3)} ${unite}`
                }
              </p>
            )}
          </div>
          <button onClick={addLotUsage} className="text-primary hover:underline text-sm">+ Ajouter un lot</button>
        </div>

        <div className="space-y-3">
          {lotsUtilises.map((lu, i) => {
            const lotInfo = getLotInfo(lu.lot_id)
            const isFefo = lotInfo && lotsDisponibles.length > 0 && lotInfo.id === lotsDisponibles[0]?.id
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
                          {l.numero_lot} — reste: {l.quantite_restante} {l.matieres_premieres?.unite} — exp: {l.date_peremption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <label className="block text-xs text-gray-500 mb-1">
                      Quantité ({unite}) * {lotInfo && <span className="text-gray-400">(max: {lotInfo.quantite_restante})</span>}
                    </label>
                    <input
                      type="number"
                      step="0.001"
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
