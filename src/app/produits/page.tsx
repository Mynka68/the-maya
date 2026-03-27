'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [form, setForm] = useState({ nom: '', description: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('produits_finis').select('*').order('nom')
    setProduits(data || [])
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {produits.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{p.nom}</td>
                  <td className="px-6 py-4 text-gray-500">{p.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => edit(p)} className="text-primary hover:underline text-sm mr-3">Modifier</button>
                    <button onClick={() => remove(p.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                  </td>
                </tr>
              ))}
              {produits.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400">Aucun produit fini</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
