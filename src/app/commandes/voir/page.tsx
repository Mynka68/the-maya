'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useFeedback } from '@/components/Feedback'
import { splitRef } from '@/lib/refs'

interface Ligne {
  id: string
  quantite: number
  matieres_premieres: { nom: string; unite: string } | null
}

interface Commande {
  id: string
  numero: string
  date_commande: string
  statut: string
  notes: string | null
  fournisseurs: { nom: string; contact: string | null; email: string | null; telephone: string | null; numero_client: string | null } | null
  commande_lignes: Ligne[]
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

export default function VoirCommandePage() {
  const router = useRouter()
  const { toast } = useFeedback()
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [commande, setCommande] = useState<Commande | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (commandeId: string) => {
    const { data } = await supabase
      .from('commandes_fournisseur')
      .select('id, numero, date_commande, statut, notes, fournisseurs(nom, contact, email, telephone, numero_client), commande_lignes(id, quantite, matieres_premieres(nom, unite))')
      .eq('id', commandeId)
      .single()
    if (!data) {
      toast('error', 'Commande introuvable')
      router.push('/commandes')
      return
    }
    setCommande(data as unknown as Commande)
    setLoading(false)
  }, [router, toast])

  useEffect(() => {
    if (!id) {
      router.push('/commandes')
      return
    }
    load(id)
  }, [id, router, load])

  async function setStatut(statut: string) {
    if (!commande) return
    const { error } = await supabase.from('commandes_fournisseur').update({ statut }).eq('id', commande.id)
    if (error) {
      toast('error', `Erreur : ${error.message}`)
      return
    }
    toast('success', `Commande marquée « ${statutLabels[statut] || statut} »`)
    load(commande.id)
  }

  if (loading || !commande) return <p className="text-gray-500">Chargement...</p>

  const lignes = [...commande.commande_lignes].sort((a, b) =>
    (a.matieres_premieres?.nom || '').localeCompare(b.matieres_premieres?.nom || ''))
  const totalKg = lignes.reduce((s, l) => s + Number(l.quantite), 0)
  const f = commande.fournisseurs
  const emailSubject = encodeURIComponent(`Commande ${commande.numero} — Thé Maya / SASU MANDALAS`)
  const emailBody = encodeURIComponent(
    `Bonjour,\n\nVeuillez trouver ci-joint notre bon de commande ${commande.numero} (${lignes.length} référence(s), ${Math.round(totalKg * 1000) / 1000} kg).\n\nMerci de confirmer la bonne réception et le délai de livraison.\n\nCordialement,\nSASU MANDALAS — Thé Maya\n12 Rue André Kiener, Bât. Desjoyaux, 68000 Colmar, France`
  )

  return (
    <>
      {/* Barre d'actions (jamais imprimée) */}
      <div className="no-print mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary-dark">Commande {commande.numero}</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[commande.statut] || ''}`}>
              {statutLabels[commande.statut] || commande.statut}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => window.print()} className="bg-primary text-white px-5 py-2 rounded-lg hover:bg-primary-light transition">
              🖨️ Imprimer / PDF
            </button>
            {f?.email && (
              <a
                href={`mailto:${f.email}?subject=${emailSubject}&body=${emailBody}`}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                ✉️ Email au fournisseur
              </a>
            )}
            {commande.statut === 'brouillon' && (
              <button onClick={() => setStatut('envoyee')} className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 transition">
                Marquer envoyée
              </button>
            )}
            {commande.statut === 'envoyee' && (
              <button onClick={() => setStatut('recue')} className="bg-green-100 text-green-800 px-4 py-2 rounded-lg hover:bg-green-200 transition">
                Marquer reçue
              </button>
            )}
            <Link href="/commandes" className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">
              Retour
            </Link>
          </div>
        </div>
        {commande.statut === 'recue' && (
          <p className="text-sm text-green-700 mt-2">
            ✅ Commande reçue — pensez à créer la <Link href="/receptions/nouveau" className="underline">réception</Link> (import du bon de livraison) pour entrer les lots en stock.
          </p>
        )}
        <p className="text-xs text-gray-400 mt-2">Astuce : « Imprimer / PDF » puis « Enregistrer au format PDF » pour obtenir le fichier à joindre à votre email.</p>
      </div>

      {/* Bon de commande imprimable */}
      <table className="report" id="bon-commande">
        <thead>
          <tr>
            <th colSpan={4} className="band-cell">
              <div className="report-band">
                <div className="report-band-left">
                  <div className="report-band-title">🍵 THÉ MAYA — BON DE COMMANDE</div>
                  <div className="report-band-sub">N° {commande.numero}</div>
                </div>
                <div className="report-band-right">
                  <div><strong>Date :</strong> {commande.date_commande}</div>
                  {f?.numero_client && <div><strong>N° client :</strong> {f.numero_client}</div>}
                  <div>{lignes.length} référence(s) · {Math.round(totalKg * 1000) / 1000} kg</div>
                </div>
              </div>
            </th>
          </tr>
          <tr className="colhead">
            <th className="text-left" style={{ width: '110px' }}>Réf. article</th>
            <th className="text-left">Désignation</th>
            <th className="text-right" style={{ width: '110px' }}>Quantité</th>
            <th className="text-left" style={{ width: '60px' }}>Unité</th>
          </tr>
        </thead>
        <tbody>
          {/* Blocs adresses */}
          <tr className="sign-row">
            <td colSpan={4} style={{ paddingBottom: '14px' }}>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="border border-gray-300 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Émetteur</p>
                  <p className="font-bold">SASU MANDALAS — Thé Maya</p>
                  <p>12 Rue André Kiener, Bât. Desjoyaux</p>
                  <p>68000 Colmar, France</p>
                  <p className="text-gray-500 text-xs mt-1">themaya.fr</p>
                </div>
                <div className="border border-gray-300 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fournisseur</p>
                  <p className="font-bold">{f?.nom || '-'}</p>
                  {f?.contact && <p>{f.contact}</p>}
                  {f?.email && <p>{f.email}</p>}
                  {f?.telephone && <p>{f.telephone}</p>}
                  {f?.numero_client && <p className="text-gray-500 text-xs mt-1">Notre n° client : {f.numero_client}</p>}
                </div>
              </div>
            </td>
          </tr>

          {/* Lignes de commande */}
          {lignes.map((l) => {
            const { ref, designation } = splitRef(l.matieres_premieres?.nom || '')
            return (
              <tr key={l.id}>
                <td className="gcell font-mono text-[11px] font-bold">{ref || '—'}</td>
                <td className="gcell text-[11px]">{designation}</td>
                <td className="gcell text-[11px] text-right font-medium">{Number(l.quantite).toFixed(3).replace(/\.?0+$/, '')}</td>
                <td className="gcell text-[11px]">{l.matieres_premieres?.unite || 'kg'}</td>
              </tr>
            )
          })}

          {/* Total */}
          <tr className="matiere-row">
            <td className="gcell" colSpan={2}><span className="font-bold">TOTAL</span></td>
            <td className="gcell text-right font-bold">{Math.round(totalKg * 1000) / 1000}</td>
            <td className="gcell font-bold">kg</td>
          </tr>

          {/* Notes + signature */}
          <tr className="sign-row">
            <td colSpan={4}>
              {commande.notes && (
                <div className="border border-gray-300 rounded-lg p-3 text-sm mt-2 mb-4">
                  <p className="font-bold text-xs uppercase text-gray-500 mb-1">Instructions / notes</p>
                  <p>{commande.notes}</p>
                </div>
              )}
              <div className="text-sm mt-2 mb-6">
                <p>Merci de confirmer la bonne réception de cette commande ainsi que le délai de livraison prévu.</p>
                <p className="mt-1">Livraison : SASU MANDALAS, 12 Rue André Kiener, Bât. Desjoyaux, 68000 Colmar, France.</p>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm font-bold mb-1">Pour SASU MANDALAS</p>
                  <div className="border-b border-gray-500 h-14"></div>
                  <p className="text-xs text-gray-400 mt-1">Nom / Signature / Date</p>
                </div>
                <div></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
