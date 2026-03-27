'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DocumentManager from '@/components/DocumentManager'

interface Produit {
  id: string
  nom: string
  description: string | null
}

export default function ProduitsPage() {
  const [produits, setProduits] = useState<Produit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [docCounts, setDocCounts] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ nom: '', description: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('produits_finis').select('*').order('nom')
    const items = data || []
    setProduits(items)

    if (items.length > 0) {
      const { data: docs } = await supabase
        .from('documents')
        .select('entity_id')
        .eq('entity_type', 'produit_fini')
        .in('entity_id', items.map(p => p.id))
      const counts: Record<string, number> = {}
      docs?.forEach((d: { entity_id: string }) => {
        counts[d.entity_id] = (counts[d.entity_id] || 0) + 1
      })
      setDocCounts(counts)
    }

    setLoading(false)
  }

  async function save() {
    if (!form.nom.trim()) return
    if (editId) {
      await supabase.from('produits_finis').update(form).eq('id', editId)
    } else {
      await supabase.from('produits_finis').insert(form)
    }
    setShowForm(false)
    setEditId(null)
    setForm({ nom: '', description: '' })
    load()
  }

  function edit(p: Produit) {
    setForm({ nom: p.nom, description: p.description || '' })
    setEditId(p.id)
    setShowForm(true)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce produit fini ?')) return
    const { data: docs } = await supabase
      .from('documents')
      .select('fichier_path')
      .eq('entity_type', 'produit_fini')
      .eq('entity_id', id)
    if (docs && docs.length > 0) {
      await supabase.storage.from('documents').remove(docs.map(d => d.fichier_path))
      await supabase.from('documents').delete().eq('entity_type', 'produit_fini').eq('entity_id', id)
    }
    await supabase.from('produits_finis').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Produits finis</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ nom: '', description: '' }) }}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition"
        >
          + Ajouter
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">{editId ? 'Modifier' : 'Nouveau produit fini'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light">{editId ? 'Modifier' : 'Ajouter'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">Annuler</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docs techniques</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {produits.map((p) => (
                <>
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{p.nom}</td>
                    <td className="px-6 py-4">
                      {docCounts[p.id] ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                          📎 {docCounts[p.id]}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{p.description || '-'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="text-primary hover:underline text-sm">
                        {expandedId === p.id ? 'Fermer' : '📎 Documents'}
                      </button>
                      <button onClick={() => edit(p)} className="text-primary hover:underline text-sm">Modifier</button>
                      <button onClick={() => remove(p.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                    </td>
                  </tr>
                  {expandedId === p.id && (
                    <tr key={`${p.id}-docs`}>
                      <td colSpan={4} className="px-6 py-4 bg-gray-50/50">
                        <DocumentManager
                          entityType="produit_fini"
                          entityId={p.id}
                          label="Documents techniques produit (fiches Thé Maya)"
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {produits.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Aucun produit fini</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
