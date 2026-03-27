'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Fournisseur {
  id: string
  nom: string
  contact: string | null
  email: string | null
  telephone: string | null
}

export default function FournisseursPage() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nom: '', contact: '', email: '', telephone: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('fournisseurs').select('*').order('nom')
    setFournisseurs(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.nom.trim()) return
    if (editId) {
      await supabase.from('fournisseurs').update(form).eq('id', editId)
    } else {
      await supabase.from('fournisseurs').insert(form)
    }
    setShowForm(false)
    setEditId(null)
    setForm({ nom: '', contact: '', email: '', telephone: '' })
    load()
  }

  function edit(f: Fournisseur) {
    setForm({ nom: f.nom, contact: f.contact || '', email: f.email || '', telephone: f.telephone || '' })
    setEditId(f.id)
    setShowForm(true)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce fournisseur ?')) return
    await supabase.from('fournisseurs').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Fournisseurs</h1>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ nom: '', contact: '', email: '', telephone: '' }) }}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition"
        >
          + Ajouter
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">{editId ? 'Modifier' : 'Nouveau fournisseur'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Téléphone" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="border rounded-lg px-3 py-2" />
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fournisseurs.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{f.nom}</td>
                  <td className="px-6 py-4 text-gray-500">{f.contact || '-'}</td>
                  <td className="px-6 py-4 text-gray-500">{f.email || '-'}</td>
                  <td className="px-6 py-4 text-gray-500">{f.telephone || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => edit(f)} className="text-primary hover:underline text-sm mr-3">Modifier</button>
                    <button onClick={() => remove(f.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                  </td>
                </tr>
              ))}
              {fournisseurs.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Aucun fournisseur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
