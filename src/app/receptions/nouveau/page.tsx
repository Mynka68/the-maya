'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import DocumentManager from '@/components/DocumentManager'

interface Fournisseur { id: string; nom: string }
interface Matiere { id: string; nom: string; categorie: string; unite: string }
interface LotForm {
  id?: string
  matiere_premiere_id: string
  numero_lot: string
  quantite_recue: string
  quantite_restante?: number
  date_fabrication: string
  date_peremption: string
  notes: string
}

const emptyLot: LotForm = { matiere_premiere_id: '', numero_lot: '', quantite_recue: '', date_fabrication: '', date_peremption: '', notes: '' }

export default function ReceptionFormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const isEdit = !!editId

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [fournisseurId, setFournisseurId] = useState('')
  const [dateReception, setDateReception] = useState(new Date().toISOString().split('T')[0])
  const [numeroBl, setNumeroBl] = useState('')
  const [notes, setNotes] = useState('')
  const [lots, setLots] = useState<LotForm[]>([{ ...emptyLot }])
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(isEdit)
  const [lotsToDelete, setLotsToDelete] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('fournisseurs').select('id, nom').order('nom'),
      supabase.from('matieres_premieres').select('id, nom, categorie, unite').order('nom'),
    ]).then(([f, m]) => {
      setFournisseurs(f.data || [])
      setMatieres(m.data || [])
    })

    if (editId) {
      loadReception(editId)
    }
  }, [editId])

  async function loadReception(id: string) {
    const { data: reception } = await supabase
      .from('receptions')
      .select('*')
      .eq('id', id)
      .single()

    if (!reception) {
      alert('Réception introuvable')
      router.push('/receptions')
      return
    }

    setFournisseurId(reception.fournisseur_id || '')
    setDateReception(reception.date_reception)
    setNumeroBl(reception.numero_bl || '')
    setNotes(reception.notes || '')

    const { data: lotsData } = await supabase
      .from('lots')
      .select('*')
      .eq('reception_id', id)
      .order('created_at')

    if (lotsData && lotsData.length > 0) {
      setLots(lotsData.map(l => ({
        id: l.id,
        matiere_premiere_id: l.matiere_premiere_id,
        numero_lot: l.numero_lot,
        quantite_recue: String(l.quantite_recue),
        quantite_restante: l.quantite_restante,
        date_fabrication: l.date_fabrication || '',
        date_peremption: l.date_peremption,
        notes: l.notes || '',
      })))
    }

    setLoadingEdit(false)
  }

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
    const lot = lots[index]
    if (lot.id) {
      setLotsToDelete([...lotsToDelete, lot.id])
    }
    setLots(lots.filter((_, i) => i !== index))
  }

  async function save() {
    if (!lots.every(l => l.matiere_premiere_id && l.numero_lot && l.quantite_recue && l.date_peremption)) {
      alert('Veuillez remplir tous les champs obligatoires pour chaque lot (matière, n° lot, quantité, date péremption)')
      return
    }
    setSaving(true)

    if (isEdit) {
      // Update reception
      const { error } = await supabase.from('receptions').update({
        fournisseur_id: fournisseurId || null,
        date_reception: dateReception,
        numero_bl: numeroBl || null,
        notes: notes || null,
      }).eq('id', editId)

      if (error) {
        alert('Erreur lors de la modification de la réception')
        setSaving(false)
        return
      }

      // Delete removed lots
      if (lotsToDelete.length > 0) {
        await supabase.from('production_lots').delete().in('lot_id', lotsToDelete)
        await supabase.from('lots').delete().in('id', lotsToDelete)
      }

      // Update existing lots and insert new ones
      for (const lot of lots) {
        if (lot.id) {
          // Update existing lot
          await supabase.from('lots').update({
            matiere_premiere_id: lot.matiere_premiere_id,
            numero_lot: lot.numero_lot,
            quantite_recue: parseFloat(lot.quantite_recue),
            quantite_restante: lot.quantite_restante !== undefined
              ? lot.quantite_restante + (parseFloat(lot.quantite_recue) - (lot.quantite_restante + (parseFloat(lot.quantite_recue) - parseFloat(lot.quantite_recue))))
              : parseFloat(lot.quantite_recue),
            date_fabrication: lot.date_fabrication || null,
            date_peremption: lot.date_peremption,
            notes: lot.notes || null,
          }).eq('id', lot.id)
        } else {
          // Insert new lot
          await supabase.from('lots').insert({
            reception_id: editId,
            matiere_premiere_id: lot.matiere_premiere_id,
            numero_lot: lot.numero_lot,
            quantite_recue: parseFloat(lot.quantite_recue),
            quantite_restante: parseFloat(lot.quantite_recue),
            date_fabrication: lot.date_fabrication || null,
            date_peremption: lot.date_peremption,
            notes: lot.notes || null,
          })
        }
      }
    } else {
      // Create new reception
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
    }

    router.push('/receptions')
  }

  if (loadingEdit) {
    return <p className="text-gray-500">Chargement de la réception...</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">
        {isEdit ? 'Modifier la réception' : 'Nouvelle réception'}
      </h1>

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

      {/* Documents section - only in edit mode */}
      {isEdit && editId && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <DocumentManager
            entityType="reception"
            entityId={editId}
            label="Documents de réception (bons de livraison, certificats...)"
          />
        </div>
      )}

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Lots reçus</h2>
          <button onClick={addLot} className="text-primary hover:underline text-sm">+ Ajouter un lot</button>
        </div>

        <div className="space-y-4">
          {lots.map((lot, i) => (
            <div key={lot.id || `new-${i}`} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-600">
                  Lot #{i + 1}
                  {lot.id && <span className="text-xs text-gray-400 ml-2">(existant)</span>}
                </span>
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
          {saving ? 'Enregistrement...' : (isEdit ? 'Enregistrer les modifications' : 'Enregistrer la réception')}
        </button>
        <button onClick={() => router.push('/receptions')} className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300">
          Annuler
        </button>
      </div>
    </div>
  )
}
