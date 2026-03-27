'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Matiere {
  id: string
  nom: string
  categorie: 'the' | 'ingredient' | 'emballage'
  unite: string
  description: string | null
}

const categorieLabels: Record<string, string> = {
  the: 'Thé',
  ingredient: 'Ingrédient',
  emballage: 'Emballage',
}

const categorieColors: Record<string, string> = {
  the: 'bg-green-100 text-green-800',
  ingredient: 'bg-purple-100 text-purple-800',
  emballage: 'bg-blue-100 text-blue-800',
}

export default function MatieresPage() {
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nom: '', categorie: 'the' as string, unite: 'kg', description: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('matieres_premieres').select('*').order('nom')
    setMatieres(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.nom.trim()) return
    if (editId) {
      await supabase.from('matieres_premieres').update(form).eq('id', editId)
    } else {
      await supabase.from('matieres_premieres').insert(form)
    }
    setShowForm(false)
    setEditId(null)
    setForm({ nom: '', categorie: 'the', unite: 'kg', description: '' })
    load()
  }

  function edit(m: Matiere) {
    setForm({ nom: m.nom, categorie: m.categorie, unite: m.unite, description: m.description || '' })
    setEditId(m.id)
    setShowForm(true)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette matière première ?')) return
    await supabase.from('matieres_premieres').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Matières premières</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ nom: '', categorie: 'the', unite: 'kg', description: '' }) }}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition"
        >
          + Ajouter
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">{editId ? 'Modifier' : 'Nouvelle matière première'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              placeholder="Nom"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="border rounded-lg px-3 py-2"
            />
            <select
              value={form.categorie}
              onChange={(e) => setForm({ ...form, categorie: e.target.value })}
              className="border rounded-lg px-3 py-2"
            >
              <option value="the">Thé</option>
              <option value="ingredient">Ingrédient</option>
              <option value="emballage">Emballage</option>
            </select>
            <input
              placeholder="Unité (kg, unités, litres...)"
              value={form.unite}
              onChange={(e) => setForm({ ...form, unite: e.target.value })}
              className="border rounded-lg px-3 py-2"
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light">
              {editId ? 'Modifier' : 'Ajouter'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catégorie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unité</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {matieres.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{m.nom}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${categorieColors[m.categorie]}`}>
                      {categorieLabels[m.categorie]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{m.unite}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{m.description || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => edit(m)} className="text-primary hover:underline text-sm mr-3">Modifier</button>
                    <button onClick={() => remove(m.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                  </td>
                </tr>
              ))}
              {matieres.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Aucune matière première</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
