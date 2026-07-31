'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/Feedback'
import { splitRef } from '@/lib/refs'

interface Fournisseur { id: string; nom: string }

interface ProduitFini {
  id: string
  nom: string
  matiere_premiere_id: string | null
  matieres_premieres: { nom: string; unite: string; categorie: string } | null
}

interface Matiere { id: string; nom: string; unite: string; categorie: string }

interface ItemCommande {
  matiere_premiere_id: string
  produitNom: string | null // nom du produit fini (null si matière seule)
  matiereNom: string
  unite: string
  categorie: string
  stock: number
}

const categorieLabels: Record<string, string> = { the: 'Thé', ingredient: 'Ingrédient', emballage: 'Emballage' }

export default function NouvelleCommandePage() {
  const router = useRouter()
  const { toast } = useFeedback()

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [fournisseurId, setFournisseurId] = useState('')
  const [dateCommande, setDateCommande] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemCommande[]>([])
  const [selection, setSelection] = useState<Record<string, string>>({}) // matiere_id -> quantite saisie
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('fournisseurs').select('id, nom').order('nom'),
      supabase.from('produits_finis').select('id, nom, matiere_premiere_id, matieres_premieres(nom, unite, categorie)').order('nom'),
      supabase.from('matieres_premieres').select('id, nom, unite, categorie').order('nom'),
      supabase.from('lots').select('matiere_premiere_id, quantite_restante').in('statut', ['disponible', 'en_cours']).gt('quantite_restante', 0),
    ]).then(([fRes, pRes, mRes, lRes]) => {
      const fs = fRes.data || []
      setFournisseurs(fs)
      // Alveus par défaut s'il existe
      const alveus = fs.find(f => f.nom.toUpperCase().includes('ALVEUS'))
      if (alveus) setFournisseurId(alveus.id)

      const stocks = new Map<string, number>()
      for (const l of (lRes.data as unknown as { matiere_premiere_id: string; quantite_restante: number }[]) || []) {
        stocks.set(l.matiere_premiere_id, (stocks.get(l.matiere_premiere_id) || 0) + Number(l.quantite_restante))
      }

      const produits = (pRes.data as unknown as ProduitFini[]) || []
      const matieres = (mRes.data as unknown as Matiere[]) || []

      const list: ItemCommande[] = []
      const covered = new Set<string>()
      for (const p of produits) {
        if (!p.matiere_premiere_id || !p.matieres_premieres) continue
        covered.add(p.matiere_premiere_id)
        list.push({
          matiere_premiere_id: p.matiere_premiere_id,
          produitNom: p.nom,
          matiereNom: p.matieres_premieres.nom,
          unite: p.matieres_premieres.unite,
          categorie: p.matieres_premieres.categorie,
          stock: stocks.get(p.matiere_premiere_id) || 0,
        })
      }
      for (const m of matieres) {
        if (covered.has(m.id)) continue
        list.push({
          matiere_premiere_id: m.id,
          produitNom: null,
          matiereNom: m.nom,
          unite: m.unite,
          categorie: m.categorie,
          stock: stocks.get(m.id) || 0,
        })
      }
      setItems(list)
      setLoading(false)
    })
  }, [])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter(i =>
      (i.produitNom || '').toLowerCase().includes(term) || i.matiereNom.toLowerCase().includes(term)
    )
  }, [items, search])

  const produitsItems = filteredItems.filter(i => i.produitNom)
  const autresItems = filteredItems.filter(i => !i.produitNom)

  function toggle(matiereId: string, checked: boolean) {
    setSelection(prev => {
      const next = { ...prev }
      if (checked) {
        if (!(matiereId in next)) next[matiereId] = ''
      } else {
        delete next[matiereId]
      }
      return next
    })
  }

  function setQty(matiereId: string, qty: string) {
    setSelection(prev => ({ ...prev, [matiereId]: qty }))
  }

  function addLowStock() {
    const low = items.filter(i => i.stock < 2)
    if (low.length === 0) {
      toast('info', 'Aucune matière en stock faible (< 2)')
      return
    }
    setSelection(prev => {
      const next = { ...prev }
      for (const i of low) {
        if (!(i.matiere_premiere_id in next)) next[i.matiere_premiere_id] = ''
      }
      return next
    })
    toast('success', `${low.length} matière(s) en stock faible ajoutée(s) à la sélection`)
  }

  const nbSelected = Object.keys(selection).length
  const totalKg = items
    .filter(i => i.matiere_premiere_id in selection)
    .reduce((s, i) => s + (parseFloat(selection[i.matiere_premiere_id]) || 0), 0)

  async function save() {
    if (!fournisseurId) {
      toast('error', 'Veuillez sélectionner un fournisseur')
      return
    }
    const lignes = Object.entries(selection)
      .map(([matiereId, qty]) => ({ matiere_premiere_id: matiereId, quantite: parseFloat(qty) }))
      .filter(l => l.quantite > 0)
    if (lignes.length === 0) {
      toast('error', 'Veuillez sélectionner au moins une matière avec une quantité')
      return
    }

    setSaving(true)

    // Numéro séquentiel : BC-ANNEE-XXX
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('commandes_fournisseur')
      .select('id', { count: 'exact', head: true })
      .ilike('numero', `BC-${year}-%`)
    const numero = `BC-${year}-${String((count || 0) + 1).padStart(3, '0')}`

    const { data: commande, error } = await supabase.from('commandes_fournisseur').insert({
      numero,
      fournisseur_id: fournisseurId,
      date_commande: dateCommande,
      notes: notes || null,
    }).select().single()

    if (error || !commande) {
      toast('error', `Erreur lors de la création : ${error?.message || 'inconnue'}`)
      setSaving(false)
      return
    }

    const { error: lignesError } = await supabase.from('commande_lignes').insert(
      lignes.map(l => ({ commande_id: commande.id, ...l }))
    )
    if (lignesError) {
      toast('error', `Erreur sur les lignes : ${lignesError.message}`)
      setSaving(false)
      return
    }

    toast('success', `Commande ${numero} créée`)
    router.push(`/commandes/voir?id=${commande.id}`)
  }

  function renderRow(item: ItemCommande) {
    const checked = item.matiere_premiere_id in selection
    const { ref } = splitRef(item.matiereNom)
    return (
      <div key={item.matiere_premiere_id + (item.produitNom || '')} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'bg-gray-50'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(item.matiere_premiere_id, e.target.checked)}
          className="rounded w-4 h-4"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {item.produitNom || item.matiereNom}
            {item.produitNom && <span className="text-xs text-gray-500 ml-2">→ {item.matiereNom}</span>}
          </p>
          <p className="text-xs text-gray-500">
            {ref && <span className="font-mono bg-gray-100 px-1 rounded mr-2">Réf. {ref}</span>}
            {categorieLabels[item.categorie] || item.categorie}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
          item.stock <= 0 ? 'bg-red-100 text-red-800' : item.stock < 2 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
        }`}>
          stock : {Math.round(item.stock * 1000) / 1000} {item.unite}
        </span>
        {checked && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder="Qté"
              value={selection[item.matiere_premiere_id]}
              onChange={(e) => setQty(item.matiere_premiere_id, e.target.value)}
              className="border rounded-lg px-2 py-1.5 w-24 text-sm"
              autoFocus={selection[item.matiere_premiere_id] === ''}
            />
            <span className="text-xs text-gray-500">{item.unite}</span>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p className="text-gray-500">Chargement...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Nouvelle commande fournisseur</h1>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
            <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
              <option value="">-- Sélectionner --</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de commande</label>
            <input type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (livraison, urgence...)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-lg px-3 py-2 w-full" placeholder="Ex : livraison souhaitée avant le 15" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="font-semibold">Produits à commander</h2>
          <div className="flex gap-3 items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="border rounded-lg px-3 py-2 text-sm w-56"
            />
            <button onClick={addLowStock} className="bg-orange-100 text-orange-800 px-3 py-2 rounded-lg text-sm hover:bg-orange-200 transition whitespace-nowrap">
              ⚠️ Ajouter les stocks faibles
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {produitsItems.map(renderRow)}
        </div>

        {autresItems.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
              Autres matières premières sans produit fini associé ({autresItems.length})
            </summary>
            <div className="space-y-2 mt-3">
              {autresItems.map(renderRow)}
            </div>
          </details>
        )}

        {filteredItems.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-6">Aucun résultat pour cette recherche</p>
        )}
      </div>

      {/* Barre de résumé */}
      <div className="sticky bottom-4 bg-white border shadow-lg rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{nbSelected}</strong> matière(s) sélectionnée(s)
          {totalKg > 0 && <> — total <strong>{Math.round(totalKg * 1000) / 1000} kg</strong></>}
        </p>
        <div className="flex gap-3">
          <button onClick={() => router.push('/commandes')} className="bg-gray-200 px-5 py-2 rounded-lg hover:bg-gray-300">
            Annuler
          </button>
          <button onClick={save} disabled={saving} className="bg-primary text-white px-5 py-2 rounded-lg hover:bg-primary-light transition disabled:opacity-50">
            {saving ? 'Création...' : 'Créer le bon de commande'}
          </button>
        </div>
      </div>
    </div>
  )
}
