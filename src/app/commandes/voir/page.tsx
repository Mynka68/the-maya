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
  prix_unitaire: number | null
  matiere_premiere_id: string
  matieres_premieres: { nom: string; unite: string } | null
}

interface ReceptionLiee {
  id: string
  date_reception: string
  numero_bl: string | null
  lots: { matiere_premiere_id: string; quantite_recue: number }[]
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
  const [receptions, setReceptions] = useState<ReceptionLiee[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (commandeId: string) => {
    const [cRes, rRes] = await Promise.all([
      supabase
        .from('commandes_fournisseur')
        .select('id, numero, date_commande, statut, notes, fournisseurs(nom, contact, email, telephone, numero_client), commande_lignes(id, quantite, prix_unitaire, matiere_premiere_id, matieres_premieres(nom, unite))')
        .eq('id', commandeId)
        .single(),
      supabase
        .from('receptions')
        .select('id, date_reception, numero_bl, lots(matiere_premiere_id, quantite_recue)')
        .eq('commande_id', commandeId)
        .order('date_reception', { ascending: true }),
    ])
    if (!cRes.data) {
      toast('error', 'Commande introuvable')
      router.push('/commandes')
      return
    }
    setCommande(cRes.data as unknown as Commande)
    setReceptions((rRes.data as unknown as ReceptionLiee[]) || [])
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
  const hasPrix = lignes.some(l => l.prix_unitaire != null)
  const totalHT = lignes.reduce((s, l) => s + Number(l.quantite) * (Number(l.prix_unitaire) || 0), 0)
  const f = commande.fournisseurs

  // Rapprochement : quantités reçues par matière via les réceptions rattachées
  const recuParMatiere = new Map<string, number>()
  for (const r of receptions) {
    for (const lot of r.lots || []) {
      recuParMatiere.set(lot.matiere_premiere_id, (recuParMatiere.get(lot.matiere_premiere_id) || 0) + Number(lot.quantite_recue))
    }
  }
  const suivi = lignes.map(l => {
    const recu = recuParMatiere.get(l.matiere_premiere_id) || 0
    const reliquat = Math.round((Number(l.quantite) - recu) * 1000) / 1000
    return { ligne: l, recu, reliquat }
  })
  const toutRecu = suivi.length > 0 && suivi.every(s => s.reliquat <= 0)
  const fmtNum = (n: number) => Number(n).toFixed(3).replace(/\.?0+$/, '')
  const fmtEur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

      {/* Suivi de livraison (écran uniquement, pas sur le BC envoyé au fournisseur) */}
      {(commande.statut === 'envoyee' || commande.statut === 'recue' || receptions.length > 0) && (
        <div className="no-print bg-card rounded-lg shadow p-5 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h2 className="font-semibold">Suivi de livraison</h2>
            <p className="text-sm text-gray-500">
              {receptions.length === 0
                ? 'Aucune réception rattachée — sélectionnez cette commande lors de la création de la réception.'
                : `${receptions.length} réception(s) rattachée(s) : ${receptions.map(r => r.numero_bl || r.date_reception).join(', ')}`}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase text-left">
                <th className="py-1">Matière</th>
                <th className="py-1 text-right">Commandé</th>
                <th className="py-1 text-right">Reçu</th>
                <th className="py-1 text-right">Reliquat</th>
                <th className="py-1 text-center">État</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suivi.map(({ ligne, recu, reliquat }) => (
                <tr key={ligne.id}>
                  <td className="py-2">{ligne.matieres_premieres?.nom}</td>
                  <td className="py-2 text-right">{fmtNum(Number(ligne.quantite))} {ligne.matieres_premieres?.unite}</td>
                  <td className="py-2 text-right">{fmtNum(recu)} {ligne.matieres_premieres?.unite}</td>
                  <td className={`py-2 text-right font-medium ${reliquat > 0 ? 'text-orange-600' : reliquat < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                    {reliquat > 0 ? fmtNum(reliquat) : reliquat < 0 ? `+${fmtNum(-reliquat)}` : '0'}
                  </td>
                  <td className="py-2 text-center">
                    {recu <= 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">⏳ En attente</span>
                    ) : reliquat > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">🟠 Partiel</span>
                    ) : reliquat < 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Excédent</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">✅ Complet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {toutRecu && commande.statut !== 'recue' && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-3">
              <p className="text-sm text-green-800">✅ Toutes les lignes sont livrées.</p>
              <button onClick={() => setStatut('recue')} className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700">
                Marquer la commande reçue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bon de commande imprimable */}
      <table className="report" id="bon-commande">
        <thead>
          <tr>
            <th colSpan={hasPrix ? 6 : 4} className="band-cell">
              <div className="report-band">
                <div className="report-band-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-horizontal-noir.svg" alt="Thé Maya" className="report-band-logo" />
                  <div className="report-band-title">BON DE COMMANDE</div>
                  <div className="report-band-sub">N° {commande.numero}</div>
                </div>
                <div className="report-band-right">
                  <div><strong>Date :</strong> {commande.date_commande}</div>
                  {f?.numero_client && <div><strong>N° client :</strong> {f.numero_client}</div>}
                  <div>{lignes.length} référence(s) · {Math.round(totalKg * 1000) / 1000} kg{hasPrix ? ` · ${fmtEur(totalHT)} € HT` : ''}</div>
                </div>
              </div>
            </th>
          </tr>
          <tr className="colhead">
            <th className="text-left" style={{ width: '100px' }}>Réf. article</th>
            <th className="text-left">Désignation</th>
            <th className="text-right" style={{ width: '90px' }}>Quantité</th>
            <th className="text-left" style={{ width: '50px' }}>Unité</th>
            {hasPrix && <th className="text-right" style={{ width: '90px' }}>PU HT (€)</th>}
            {hasPrix && <th className="text-right" style={{ width: '100px' }}>Montant HT (€)</th>}
          </tr>
        </thead>
        <tbody>
          {/* Blocs adresses */}
          <tr className="sign-row">
            <td colSpan={hasPrix ? 6 : 4} style={{ paddingBottom: '14px' }}>
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
                <td className="gcell text-[11px] text-right font-medium">{fmtNum(Number(l.quantite))}</td>
                <td className="gcell text-[11px]">{l.matieres_premieres?.unite || 'kg'}</td>
                {hasPrix && <td className="gcell text-[11px] text-right">{l.prix_unitaire != null ? fmtEur(Number(l.prix_unitaire)) : ''}</td>}
                {hasPrix && <td className="gcell text-[11px] text-right">{l.prix_unitaire != null ? fmtEur(Number(l.quantite) * Number(l.prix_unitaire)) : ''}</td>}
              </tr>
            )
          })}

          {/* Total */}
          <tr className="matiere-row">
            <td className="gcell" colSpan={2}><span className="font-bold">TOTAL</span></td>
            <td className="gcell text-right font-bold">{Math.round(totalKg * 1000) / 1000}</td>
            <td className="gcell font-bold">kg</td>
            {hasPrix && <td className="gcell"></td>}
            {hasPrix && <td className="gcell text-right font-bold">{fmtEur(totalHT)}</td>}
          </tr>

          {/* Notes + signature */}
          <tr className="sign-row">
            <td colSpan={hasPrix ? 6 : 4}>
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
