'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import DocumentManager from '@/components/DocumentManager'

interface Reception {
  id: string
  date_reception: string
  numero_bl: string | null
  notes: string | null
  fournisseurs: { nom: string } | null
  lots: { id: string }[]
}

interface DocCount {
  entity_id: string
  count: number
}

export default function ReceptionsPage() {
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [docCounts, setDocCounts] = useState<Record<string, number>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('receptions')
      .select('*, fournisseurs(nom), lots(id)')
      .order('date_reception', { ascending: false })
    const recs = (data as unknown as Reception[]) || []
    setReceptions(recs)

    // Load document counts
    if (recs.length > 0) {
      const { data: docs } = await supabase
        .from('documents')
        .select('entity_id')
        .eq('entity_type', 'reception')
        .in('entity_id', recs.map(r => r.id))
      const counts: Record<string, number> = {}
      docs?.forEach((d: { entity_id: string }) => {
        counts[d.entity_id] = (counts[d.entity_id] || 0) + 1
      })
      setDocCounts(counts)
    }

    setLoading(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette réception et ses lots ?')) return
    // Delete associated documents from storage
    const { data: docs } = await supabase
      .from('documents')
      .select('fichier_path')
      .eq('entity_type', 'reception')
      .eq('entity_id', id)
    if (docs && docs.length > 0) {
      await supabase.storage.from('documents').remove(docs.map(d => d.fichier_path))
      await supabase.from('documents').delete().eq('entity_type', 'reception').eq('entity_id', id)
    }
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Docs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {receptions.map((r) => (
                <>
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{r.date_reception}</td>
                    <td className="px-6 py-4">{r.fournisseurs?.nom || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{r.numero_bl || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-sm font-medium">
                        {r.lots?.length || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {docCounts[r.id] ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                          📎 {docCounts[r.id]}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{r.notes || '-'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="text-primary hover:underline text-sm"
                      >
                        {expandedId === r.id ? 'Fermer' : '📎 Documents'}
                      </button>
                      <button onClick={() => remove(r.id)} className="text-red-500 hover:underline text-sm">Supprimer</button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr key={`${r.id}-docs`}>
                      <td colSpan={7} className="px-6 py-4 bg-gray-50/50">
                        <DocumentManager
                          entityType="reception"
                          entityId={r.id}
                          label="Documents de réception (bons de livraison, certificats...)"
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {receptions.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Aucune réception</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
