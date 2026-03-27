'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Fournisseur { id: string; nom: string }
interface Matiere { id: string; nom: string; categorie: string; unite: string }
interface LotForm {
  matiere_premiere_id: string
  numero_lot: string
  quantite_recue: string
  date_fabrication: string
  date_peremption: string
  notes: string
}

const emptyLot: LotForm = { matiere_premiere_id: '', numero_lot: '', quantite_recue: '', date_fabrication: '', date_peremption: '', notes: '' }

export default function NouvelleReceptionPage() {
  const router = useRouter()
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [fournisseurId, setFournisseurId] = useState('')
  const [dateReception, setDateReception] = useState(new Date().toISOString().split('T')[0])
  const [numeroBl, setNumeroBl] = useState('')
  const [notes, setNotes] = useState('')
  const [lots, setLots] = useState<LotForm[]>([{ ...emptyLot }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('fournisseurs').select('id, nom').order('nom'),
      supabase.from('matieres_premieres').select('id, nom, categorie, unite').order('nom'),
    ]).then(([f, m]) => {
      setFournisseurs(f.data || [])
      setMatieres(m.data || [])
    })
  }, [])

  function updateLot(index: number, field: keyof LotForm, value: string) {
    const updated = [...lots]
    updated[index] = { ...updated[index], [field]: value }
    setLots(updated)
  }

  function addLot() {
    setLots([...lots, { ...emptyLot }])
  }

  function removeLot(index: number) {
    if (lots.length === 1) return
    setLots(lots.filter((_, i) => i !== index))
  }

  async function save() {
    if (!lots.every(l => l.matiere_premiere_id && l.numero_lot && l.quantite_recue && l.date_peremption)) {
      alert('Veuillez remplir tous les champs obligatoires pour chaque lot (matière, n° lot, quantité, date péremption)')
      return
    }
    setSaving(true)

    const { data: reception, error } = await supabase.from('receptions').insert({
      fournisseur_id: fournisseurId || null,
      date_reception: dateReception,
      numero_bl: numeroBl || null,
      notes: notes || null,
    }).select().single()

    if (error || !reception) {
      alert('Erreur lors de la création de la réception')
      setSaving(false)
      return
    }

    const lotsToInsert = lots.map(l => ({
      reception_id: reception.id,
      matiere_premiere_id: l.matiere_premiere_id,
      numero_lot: l.numero_lot,
      quantite_recue: parseFloat(l.quantite_recue),
      quantite_restante: parseFloat(l.quantite_recue),
      date_fabrication: l.date_fabrication || null,
      date_peremption: l.date_peremption,
      notes: l.notes || null,
    }))

    const { error: lotsError } = await supabase.from('lots').insert(lotsToInsert)
    if (lotsError) {
      alert('Erreur lors de la création des lots')
      setSaving(false)
      return
    }

    router.push('/receptions')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Nouvelle réception</h1>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <h2 className="font-semibold mb-4">Informations générales</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de réception</label>
            <input type="date" value={dateReception} onChange={(e) => setDateReception(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
            <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
              <option value="">-- Sélectionner --</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° Bon de livraison</label>
            <input value={numeroBl} onChange={(e) => setNumeroBl(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Lots reçus</h2>
          <button onClick={addLot} className="text-primary hover:underline text-sm">+ Ajouter un lot</button>
        </div>

        <div className="space-y-4">
          {lots.map((lot, i) => (
            <div key={i} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-600">Lot #{i + 1}</span>
                {lots.length > 1 && (
                  <button onClick={() => removeLot(i)} className="text-red-500 hover:underline text-sm">Retirer</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Matière première *</label>
                  <select value={lot.matiere_premiere_id} onChange={(e) => updateLot(i, 'matiere_premiere_id', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm">
                    <option value="">-- Sélectionner --</option>
                    {matieres.map(m => <option key={m.id} value={m.id}>{m.nom} ({m.unite})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">N° de lot *</label>
                  <input value={lot.numero_lot} onChange={(e) => updateLot(i, 'numero_lot', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Quantité reçue *</label>
                  <input type="number" step="0.01" value={lot.quantite_recue} onChange={(e) => updateLot(i, 'quantite_recue', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date fabrication</label>
                  <input type="date" value={lot.date_fabrication} onChange={(e) => updateLot(i, 'date_fabrication', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date péremption *</label>
                  <input type="date" value={lot.date_peremption} onChange={(e) => updateLot(i, 'date_peremption', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input value={lot.notes} onChange={(e) => updateLot(i, 'notes', e.target.value)} className="border rounded-lg px-3 py-2 w-full text-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={save} disabled={saving} className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-light transition disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer la réception'}
        </button>
        <button onClick={() => router.push('/receptions')} className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300">
          Annuler
        </button>
      </div>
    </div>
  )
}
