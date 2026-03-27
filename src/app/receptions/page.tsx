'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Reception {
  id: string
  date_reception: string
  numero_bl: string | null
  notes: string | null
  fournisseurs: { nom: string } | null
  lots: { id: string }[]
}

export default function ReceptionsPage() {
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('receptions')
      .select('*, fournisseurs(nom), lots(id)')
      .order('date_reception', { ascending: false })
    setReceptions(data || [])
    setLoading(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette réception et ses lots ?')) return
    await supabase.from('lots').delete().eq('reception_id', id)
    await supabase.from('receptions').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Réceptions</h1>
        <Link href="/receptions/nouveau" className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition">
          + Nouvelle réception
        </Link>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° BL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nb lots</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {receptions.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{r.date_reception}</td>
                  <td className="px-6 py-4">{r.fournisseurs?.nom || '-'}</td>
                  <td className="px-6 py-4 text-gray-500">{r.numero_bl || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-sm font-medium">
                      {r.lots?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{r.notes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                  </td>
                </tr>
              ))}
              {receptions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Aucune réception</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
