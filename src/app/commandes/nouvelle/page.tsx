'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFeedback } from '@/components/Feedback'
import { splitRef } from '@/lib/refs'

interface Fournisseur { id: string; nom: string }

interface ProduitFini {
  id: string
  nom: string
  matiere_premiere_id: string | null
  matieres_premieres: { nom: string; unite: string; categorie: string } | null
}

interface Matiere { id: string; nom: string; unite: string; categorie: string; prix_achat: number | null }

interface ItemCommande {
  matiere_premiere_id: string
  produitNom: string | null // nom du produit fini (null si matière seule)
  matiereNom: string
  unite: string
  categorie: string
  stock: number
  consoMois: number // consommation moyenne / mois (90 derniers jours)
  suggestion: number // qté suggérée = 2 mois de conso - stock, arrondie
  prixDefaut: number | null
}

// Couverture cible : 2 mois de consommation
const MOIS_COUVERTURE = 2

function arrondiDemi(n: number): number {
  return Math.max(0, Math.round(n * 2) / 2)
}

const categorieLabels: Record<string, string> = { the: 'Thé', ingredient: 'Ingrédient', emballage: 'Emballage' }

export default function NouvelleCommandePage() {
  const router = useRouter()
  const { toast } = useFeedback()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const isEdit = !!editId

  const [numeroEdit, setNumeroEdit] = useState<string | null>(null)
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [fournisseurId, setFournisseurId] = useState('')
  const [dateCommande, setDateCommande] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemCommande[]>([])
  const [selection, setSelection] = useState<Record<string, { qty: string; prix: string }>>({}) // matiere_id -> saisie
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const date90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    Promise.all([
      supabase.from('fournisseurs').select('id, nom').order('nom'),
      supabase.from('produits_finis').select('id, nom, matiere_premiere_id, matieres_premieres(nom, unite, categorie)').order('nom'),
      supabase.from('matieres_premieres').select('id, nom, unite, categorie, prix_achat').order('nom'),
      supabase.from('lots').select('matiere_premiere_id, quantite_restante').in('statut', ['disponible', 'en_cours']).gt('quantite_restante', 0),
      supabase.from('production_lots')
        .select('quantite_utilisee, lots!inner(matiere_premiere_id), productions!inner(date_production)')
        .gte('productions.date_production', date90),
    ]).then(async ([fRes, pRes, mRes, lRes, consoRes]) => {
      const fs = fRes.data || []
      setFournisseurs(fs)
      // Alveus par défaut s'il existe (création uniquement)
      if (!editId) {
        const alveus = fs.find(f => f.nom.toUpperCase().includes('ALVEUS'))
        if (alveus) setFournisseurId(alveus.id)
      }

      const stocks = new Map<string, number>()
      for (const l of (lRes.data as unknown as { matiere_premiere_id: string; quantite_restante: number }[]) || []) {
        stocks.set(l.matiere_premiere_id, (stocks.get(l.matiere_premiere_id) || 0) + Number(l.quantite_restante))
      }

      // Consommation des 90 derniers jours par matière → moyenne mensuelle
      const conso = new Map<string, number>()
      interface ConsoRow { quantite_utilisee: number; lots: { matiere_premiere_id: string } | null }
      for (const c of (consoRes.data as unknown as ConsoRow[]) || []) {
        const mid = c.lots?.matiere_premiere_id
        if (!mid) continue
        conso.set(mid, (conso.get(mid) || 0) + Number(c.quantite_utilisee))
      }

      const produits = (pRes.data as unknown as ProduitFini[]) || []
      const matieres = (mRes.data as unknown as Matiere[]) || []
      const prixParMatiere = new Map(matieres.map(m => [m.id, m.prix_achat]))

      const buildItem = (matiereId: string, produitNom: string | null, nom: string, unite: string, categorie: string): ItemCommande => {
        const stock = stocks.get(matiereId) || 0
        const consoMois = (conso.get(matiereId) || 0) / 3
        return {
          matiere_premiere_id: matiereId,
          produitNom,
          matiereNom: nom,
          unite,
          categorie,
          stock,
          consoMois: Math.round(consoMois * 100) / 100,
          suggestion: arrondiDemi(consoMois * MOIS_COUVERTURE - stock),
          prixDefaut: prixParMatiere.get(matiereId) ?? null,
        }
      }

      const list: ItemCommande[] = []
      const covered = new Set<string>()
      for (const p of produits) {
        if (!p.matiere_premiere_id || !p.matieres_premieres) continue
        covered.add(p.matiere_premiere_id)
        list.push(buildItem(p.matiere_premiere_id, p.nom, p.matieres_premieres.nom, p.matieres_premieres.unite, p.matieres_premieres.categorie))
      }
      for (const m of matieres) {
        if (covered.has(m.id)) continue
        list.push(buildItem(m.id, null, m.nom, m.unite, m.categorie))
      }
      setItems(list)

      // Mode édition : charge la commande existante et pré-remplit la sélection
      if (editId) {
        const { data: cmd } = await supabase
          .from('commandes_fournisseur')
          .select('numero, fournisseur_id, date_commande, statut, notes, commande_lignes(matiere_premiere_id, quantite, prix_unitaire)')
          .eq('id', editId)
          .single()
        if (!cmd) {
          toast('error', 'Commande introuvable')
          router.push('/commandes')
          return
        }
        if (cmd.statut === 'recue' || cmd.statut === 'annulee') {
          toast('error', `Une commande « ${cmd.statut === 'recue' ? 'reçue' : 'annulée'} » ne peut plus être modifiée`)
          router.push(`/commandes/voir?id=${editId}`)
          return
        }
        setNumeroEdit(cmd.numero)
        setFournisseurId(cmd.fournisseur_id || '')
        setDateCommande(cmd.date_commande)
        setNotes(cmd.notes || '')
        const sel: Record<string, { qty: string; prix: string }> = {}
        for (const l of (cmd.commande_lignes as { matiere_premiere_id: string; quantite: number; prix_unitaire: number | null }[]) || []) {
          sel[l.matiere_premiere_id] = {
            qty: String(l.quantite),
            prix: l.prix_unitaire != null ? String(l.prix_unitaire) : '',
          }
        }
        setSelection(sel)
      }

      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter(i =>
      (i.produitNom || '').toLowerCase().includes(term) || i.matiereNom.toLowerCase().includes(term)
    )
  }, [items, search])

  const produitsItems = filteredItems.filter(i => i.produitNom)
  const autresItems = filteredItems.filter(i => !i.produitNom)

  function defaultEntry(item: ItemCommande): { qty: string; prix: string } {
    return { qty: '', prix: item.prixDefaut != null ? String(item.prixDefaut) : '' }
  }

  function toggle(item: ItemCommande, checked: boolean) {
    setSelection(prev => {
      const next = { ...prev }
      if (checked) {
        if (!(item.matiere_premiere_id in next)) next[item.matiere_premiere_id] = defaultEntry(item)
      } else {
        delete next[item.matiere_premiere_id]
      }
      return next
    })
  }

  function setField(matiereId: string, field: 'qty' | 'prix', value: string) {
    setSelection(prev => ({ ...prev, [matiereId]: { ...prev[matiereId], [field]: value } }))
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
        if (!(i.matiere_premiere_id in next)) next[i.matiere_premiere_id] = defaultEntry(i)
      }
      return next
    })
    toast('success', `${low.length} matière(s) en stock faible ajoutée(s) à la sélection`)
  }

  // Sélectionne toutes les matières avec une suggestion > 0 et pré-remplit les quantités suggérées
  function applySuggestions() {
    const suggested = items.filter(i => i.suggestion > 0)
    if (suggested.length === 0) {
      toast('info', 'Aucune suggestion : les stocks couvrent la consommation des prochains mois')
      return
    }
    setSelection(prev => {
      const next = { ...prev }
      for (const i of suggested) {
        const existing = next[i.matiere_premiere_id]
        next[i.matiere_premiere_id] = {
          qty: existing?.qty ? existing.qty : String(i.suggestion),
          prix: existing?.prix ? existing.prix : (i.prixDefaut != null ? String(i.prixDefaut) : ''),
        }
      }
      return next
    })
    toast('success', `${suggested.length} quantité(s) suggérée(s) appliquée(s) (couverture ${MOIS_COUVERTURE} mois de consommation)`)
  }

  const nbSelected = Object.keys(selection).length
  const selectedItems = items.filter(i => i.matiere_premiere_id in selection)
  const totalKg = selectedItems.reduce((s, i) => s + (parseFloat(selection[i.matiere_premiere_id]?.qty) || 0), 0)
  const totalHT = selectedItems.reduce((s, i) => {
    const sel = selection[i.matiere_premiere_id]
    const q = parseFloat(sel?.qty) || 0
    const p = parseFloat(sel?.prix) || 0
    return s + q * p
  }, 0)

  async function save() {
    if (!fournisseurId) {
      toast('error', 'Veuillez sélectionner un fournisseur')
      return
    }
    const lignes = Object.entries(selection)
      .map(([matiereId, sel]) => ({
        matiere_premiere_id: matiereId,
        quantite: parseFloat(sel.qty),
        prix_unitaire: sel.prix !== '' && !isNaN(parseFloat(sel.prix)) ? parseFloat(sel.prix) : null,
      }))
      .filter(l => l.quantite > 0)
    if (lignes.length === 0) {
      toast('error', 'Veuillez sélectionner au moins une matière avec une quantité')
      return
    }

    setSaving(true)

    if (isEdit && editId) {
      // Mise à jour : entête + remplacement des lignes (numéro et statut conservés)
      const { error } = await supabase.from('commandes_fournisseur').update({
        fournisseur_id: fournisseurId,
        date_commande: dateCommande,
        notes: notes || null,
      }).eq('id', editId)
      if (error) {
        toast('error', `Erreur lors de la modification : ${error.message}`)
        setSaving(false)
        return
      }

      const { error: delError } = await supabase.from('commande_lignes').delete().eq('commande_id', editId)
      if (delError) {
        toast('error', `Erreur lors de la mise à jour des lignes : ${delError.message}`)
        setSaving(false)
        return
      }
      const { error: insError } = await supabase.from('commande_lignes').insert(
        lignes.map(l => ({ commande_id: editId, ...l }))
      )
      if (insError) {
        toast('error', `Erreur sur les lignes : ${insError.message}`)
        setSaving(false)
        return
      }

      toast('success', `Commande ${numeroEdit || ''} modifiée`)
      router.push(`/commandes/voir?id=${editId}`)
      return
    }

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
    const sel = selection[item.matiere_premiere_id]
    const { ref } = splitRef(item.matiereNom)
    return (
      <div key={item.matiere_premiere_id + (item.produitNom || '')} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${checked ? 'border-primary bg-primary/5' : 'bg-gray-50'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(item, e.target.checked)}
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
            {item.consoMois > 0 && <span className="ml-2">· conso ~{item.consoMois} {item.unite}/mois</span>}
            {item.suggestion > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelection(prev => ({
                    ...prev,
                    [item.matiere_premiere_id]: {
                      qty: String(item.suggestion),
                      prix: prev[item.matiere_premiere_id]?.prix || (item.prixDefaut != null ? String(item.prixDefaut) : ''),
                    },
                  }))
                }}
                className="ml-2 text-primary hover:underline"
                title={`Couverture ${MOIS_COUVERTURE} mois de consommation moins le stock actuel`}
              >
                💡 suggéré : {item.suggestion} {item.unite}
              </button>
            )}
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
              value={sel?.qty ?? ''}
              onChange={(e) => setField(item.matiere_premiere_id, 'qty', e.target.value)}
              className="border rounded-lg px-2 py-1.5 w-20 text-sm"
              autoFocus={sel?.qty === ''}
            />
            <span className="text-xs text-gray-500">{item.unite}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="€/kg"
              value={sel?.prix ?? ''}
              onChange={(e) => setField(item.matiere_premiere_id, 'prix', e.target.value)}
              className="border rounded-lg px-2 py-1.5 w-20 text-sm ml-2"
              title="Prix d'achat HT par unité (mémorisé pour la prochaine commande)"
            />
            <span className="text-xs text-gray-500">€/{item.unite}</span>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p className="text-gray-500">Chargement...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">
        {isEdit ? `Modifier la commande ${numeroEdit || ''}` : 'Nouvelle commande fournisseur'}
      </h1>

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
            <button onClick={applySuggestions} className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-sm hover:bg-primary/20 transition whitespace-nowrap" title={`Sélectionne et pré-remplit les quantités pour couvrir ${MOIS_COUVERTURE} mois de consommation`}>
              💡 Appliquer les suggestions
            </button>
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
          {totalHT > 0 && <> — <strong>{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT</strong></>}
        </p>
        <div className="flex gap-3">
          <button onClick={() => router.push(isEdit ? `/commandes/voir?id=${editId}` : '/commandes')} className="bg-gray-200 px-5 py-2 rounded-lg hover:bg-gray-300">
            Annuler
          </button>
          <button onClick={save} disabled={saving} className="bg-primary text-white px-5 py-2 rounded-lg hover:bg-primary-light transition disabled:opacity-50">
            {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer les modifications' : 'Créer le bon de commande'}
          </button>
        </div>
      </div>
    </div>
  )
}
