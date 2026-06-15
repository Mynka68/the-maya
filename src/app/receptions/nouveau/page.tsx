'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import DocumentManager from '@/components/DocumentManager'
import { useFeedback } from '@/components/Feedback'

interface Fournisseur { id: string; nom: string }
interface Matiere { id: string; nom: string; categorie: string; unite: string }
interface LotForm {
  id?: string
  matiere_premiere_id: string
  numero_lot: string
  quantite_recue: string
  quantite_restante?: number
  consommee?: number
  date_fabrication: string
  date_peremption: string
  notes: string
}

const emptyLot: LotForm = { matiere_premiere_id: '', numero_lot: '', quantite_recue: '', date_fabrication: '', date_peremption: '', notes: '' }

interface BonLigne {
  code: string
  description: string
  quantite: number
  unite?: string
  numero_lot?: string | null
  date_peremption?: string | null
}
interface ExtractedBon {
  fournisseur?: string
  date_livraison?: string
  numero_bl?: string
  numero_commande?: string | null
  lignes?: BonLigne[]
}

const isoDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')

export default function ReceptionFormPage() {
  const router = useRouter()
  const { toast } = useFeedback()
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
  const [importing, setImporting] = useState(false)

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
      toast('error', 'Réception introuvable')
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
        consommee: l.quantite_recue - l.quantite_restante,
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

  // Retrouve la matière première dont le nom commence par le même code article que la ligne du bon.
  function matiereIdForCode(code: string): string {
    const digits = (code || '').replace(/\D/g, '')
    if (!digits) return ''
    const found = matieres.find(m => ((m.nom.match(/\d+/) || [])[0] === digits))
    return found?.id || ''
  }

  async function importBon(file: File) {
    setImporting(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/extract-bon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mediaType: file.type }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast('error', data.error || "Échec de l'extraction du bon")
        return
      }
      applyBon(data.bon as ExtractedBon)
    } catch (e) {
      toast('error', `Erreur : ${e instanceof Error ? e.message : 'inconnue'}`)
    } finally {
      setImporting(false)
    }
  }

  function applyBon(bon: ExtractedBon) {
    if (bon.fournisseur) {
      const needle = bon.fournisseur.toLowerCase()
      const f = fournisseurs.find(x => needle.includes(x.nom.toLowerCase()) || x.nom.toLowerCase().includes(needle))
      if (f) setFournisseurId(f.id)
    }
    if (isoDate(bon.date_livraison)) setDateReception(bon.date_livraison!)
    if (bon.numero_bl) setNumeroBl(bon.numero_bl)
    if (bon.numero_commande) setNotes(`Commande ${bon.numero_commande}`)

    const newLots: LotForm[] = (bon.lignes || []).map(l => ({
      matiere_premiere_id: matiereIdForCode(l.code),
      numero_lot: l.numero_lot || '',
      quantite_recue: l.quantite != null ? String(l.quantite) : '',
      date_fabrication: '',
      date_peremption: isoDate(l.date_peremption),
      notes: `${l.code || ''} ${l.description || ''}`.trim(),
    }))

    if (newLots.length === 0) {
      toast('error', "Aucune ligne article n'a été trouvée sur le bon.")
      return
    }

    setLots(newLots)
    const matched = newLots.filter(l => l.matiere_premiere_id).length
    const unmatched = newLots.length - matched
    toast(
      'success',
      `${newLots.length} ligne(s) importée(s), ${matched} rapprochée(s) automatiquement` +
        (unmatched ? `, ${unmatched} à compléter` : '') +
        '. Vérifiez les quantités (le bon est en « Unit », votre stock en kg).',
    )
  }

  async function save() {
    if (!lots.every(l => l.matiere_premiere_id && l.numero_lot && l.quantite_recue && l.date_peremption)) {
      toast('error', 'Veuillez remplir tous les champs obligatoires pour chaque lot (matière, n° lot, quantité, date péremption)')
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
        toast('error', `Erreur lors de la modification de la réception : ${error.message}`)
        setSaving(false)
        return
      }

      // Delete removed lots
      if (lotsToDelete.length > 0) {
        const { error: delError } = await supabase.from('lots').delete().in('id', lotsToDelete)
        if (delError) {
          toast('error', `Impossible de supprimer un lot : ${delError.message}. S'il a été utilisé en production, il ne peut pas être supprimé.`)
          setSaving(false)
          return
        }
      }

      // Update existing lots and insert new ones
      for (const lot of lots) {
        if (lot.id) {
          // La quantité restante suit la nouvelle quantité reçue moins ce qui a déjà été consommé
          const newRecue = parseFloat(lot.quantite_recue)
          const consommee = lot.consommee ?? 0
          const { error: updError } = await supabase.from('lots').update({
            matiere_premiere_id: lot.matiere_premiere_id,
            numero_lot: lot.numero_lot,
            quantite_recue: newRecue,
            quantite_restante: Math.max(0, newRecue - consommee),
            date_fabrication: lot.date_fabrication || null,
            date_peremption: lot.date_peremption,
            notes: lot.notes || null,
          }).eq('id', lot.id)
          if (updError) {
            toast('error', `Erreur sur le lot ${lot.numero_lot} : ${updError.message}`)
            setSaving(false)
            return
          }
        } else {
          // Insert new lot
          const { error: insError } = await supabase.from('lots').insert({
            reception_id: editId,
            matiere_premiere_id: lot.matiere_premiere_id,
            numero_lot: lot.numero_lot,
            quantite_recue: parseFloat(lot.quantite_recue),
            quantite_restante: parseFloat(lot.quantite_recue),
            date_fabrication: lot.date_fabrication || null,
            date_peremption: lot.date_peremption,
            notes: lot.notes || null,
          })
          if (insError) {
            toast('error', `Erreur sur le lot ${lot.numero_lot} : ${insError.message}`)
            setSaving(false)
            return
          }
        }
      }
      toast('success', 'Réception modifiée')
    } else {
      // Create new reception
      const { data: reception, error } = await supabase.from('receptions').insert({
        fournisseur_id: fournisseurId || null,
        date_reception: dateReception,
        numero_bl: numeroBl || null,
        notes: notes || null,
      }).select().single()

      if (error || !reception) {
        toast('error', `Erreur lors de la création de la réception : ${error?.message || 'erreur inconnue'}`)
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
        toast('error', `Erreur lors de la création des lots : ${lotsError.message}`)
        setSaving(false)
        return
      }
      toast('success', 'Réception enregistrée')
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

      {!isEdit && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-primary-dark">📄 Importer un bon de livraison</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Scan ou PDF — la date, le n° de BL et les lots sont pré-remplis (rapprochement par code article).
            </p>
          </div>
          <label className={`inline-block px-4 py-2 rounded-lg text-sm transition ${importing ? 'bg-gray-300 text-gray-500 cursor-wait' : 'bg-primary text-white hover:bg-primary-light cursor-pointer'}`}>
            {importing ? '⏳ Analyse en cours…' : 'Choisir un fichier'}
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              disabled={importing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importBon(f); e.target.value = '' }}
            />
          </label>
        </div>
      )}

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
