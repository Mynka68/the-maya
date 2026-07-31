'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useFeedback } from '@/components/Feedback'

interface Commande {
  id: string
  numero: string
  date_commande: string
  statut: string
  notes: string | null
  fournisseurs: { nom: string } | null
  commande_lignes: { quantite: number; matieres_premieres: { unite: string } | null }[]
}

const statutLabels: Record<string, string> = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée',
  recue: 'Reçue',
  annulee: 'Annulée',
}

const statutColors: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  envoyee: 'bg-blue-100 text-blue-800',
  recue: 'bg-green-100 text-green-800',
  annulee: 'bg-red-100 text-red-800',
}

export default function CommandesPage() {
  const { toast, confirm } = useFeedback()
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('commandes_fournisseur')
      .select('id, numero, date_commande, statut, notes, fournisseurs(nom), commande_lignes(quantite, matieres_premieres(unite))')
      .order('date_commande', { ascending: false })
      .order('created_at', { ascending: false })
    setCommandes((data as unknown as Commande[]) || [])
    setLoading(false)
  }

  async function remove(id: string, numero: string) {
    const ok = await confirm(`Supprimer la commande ${numero} ?`)
    if (!ok) return
    const { error } = await supabase.from('commandes_fournisseur').delete().eq('id', id)
    if (error) {
      toast('error', `Erreur lors de la suppression : ${error.message}`)
      return
    }
    toast('success', 'Commande supprimée')
    load()
  }

  function totalKg(c: Commande) {
    return c.commande_lignes.reduce((s, l) => s + Number(l.quantite), 0)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Commandes fournisseur</h1>
        <Link href="/commandes/nouvelle" className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition">
          + Nouvelle commande
        </Link>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° commande</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lignes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {commandes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm font-medium">
                    <Link href={`/commandes/voir?id=${c.id}`} className="text-primary hover:underline">{c.numero}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm">{c.date_commande}</td>
                  <td className="px-6 py-4 text-sm">{c.fournisseurs?.nom || '-'}</td>
                  <td className="px-6 py-4 text-sm text-right">{c.commande_lignes.length}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{totalKg(c).toFixed(3).replace(/\.?0+$/, '')} kg</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[c.statut] || ''}`}>
                      {statutLabels[c.statut] || c.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <Link href={`/commandes/voir?id=${c.id}`} className="text-primary hover:underline mr-3">Voir / PDF</Link>
                    {c.statut === 'brouillon' && (
                      <button onClick={() => remove(c.id, c.numero)} className="text-red-500 hover:underline">Supprimer</button>
                    )}
                  </td>
                </tr>
              ))}
              {commandes.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                  Aucune commande. Créez votre première commande fournisseur pour générer un bon de commande PDF.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
