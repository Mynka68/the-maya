'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Lot {
  id: string
  numero_lot: string
  quantite_restante: number
  date_peremption: string
  statut: string
  matieres_premieres: { nom: string; unite: string } | null
}

interface Production {
  id: string
  numero_lot_produit: string
  date_production: string
  quantite_produite: number
  statut: string
  produits_finis: { nom: string } | null
}

export default function Dashboard() {
  const [lotsExpiring, setLotsExpiring] = useState<Lot[]>([])
  const [recentProductions, setRecentProductions] = useState<Production[]>([])
  const [stats, setStats] = useState({ lotsDisponibles: 0, productionsMois: 0, lotsCritiques: 0, totalMatieres: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const now = new Date()
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [lotsRes, prodsRes, statsLotsRes, statsProdRes, matiereRes] = await Promise.all([
      supabase
        .from('lots')
        .select('*, matieres_premieres(nom, unite)')
        .in('statut', ['disponible', 'en_cours'])
        .lte('date_peremption', in30days)
        .order('date_peremption', { ascending: true })
        .limit(10),
      supabase
        .from('productions')
        .select('*, produits_finis(nom)')
        .order('date_production', { ascending: false })
        .limit(5),
      supabase
        .from('lots')
        .select('id', { count: 'exact' })
        .eq('statut', 'disponible'),
      supabase
        .from('productions')
        .select('id', { count: 'exact' })
        .gte('date_production', startOfMonth),
      supabase
        .from('matieres_premieres')
        .select('id', { count: 'exact' }),
    ])

    setLotsExpiring((lotsRes.data as unknown as Lot[]) || [])
    setRecentProductions((prodsRes.data as unknown as Production[]) || [])
    setStats({
      lotsDisponibles: statsLotsRes.count || 0,
      productionsMois: statsProdRes.count || 0,
      lotsCritiques: (lotsRes.data || []).length,
      totalMatieres: matiereRes.count || 0,
    })
    setLoading(false)
  }

  function daysUntil(date: string) {
    const diff = new Date(date).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function peremptionColor(date: string) {
    const days = daysUntil(date)
    if (days < 0) return 'bg-red-100 text-red-800'
    if (days < 30) return 'bg-orange-100 text-orange-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Chargement...</p></div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary-dark mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Lots disponibles</p>
          <p className="text-3xl font-bold text-primary">{stats.lotsDisponibles}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Productions ce mois</p>
          <p className="text-3xl font-bold text-primary">{stats.productionsMois}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Lots critiques (&lt;30j)</p>
          <p className="text-3xl font-bold text-danger">{stats.lotsCritiques}</p>
        </div>
        <div className="bg-card rounded-lg shadow p-5">
          <p className="text-sm text-gray-500">Matières premières</p>
          <p className="text-3xl font-bold text-primary">{stats.totalMatieres}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg shadow">
          <div className="p-5 border-b flex justify-between items-center">
            <h2 className="font-semibold text-lg">Lots proches péremption</h2>
            <Link href="/lots" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="p-5">
            {lotsExpiring.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucun lot critique</p>
            ) : (
              <div className="space-y-3">
                {lotsExpiring.map((lot) => (
                  <div key={lot.id} className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{lot.numero_lot}</span>
                      <span className="text-gray-500 text-sm ml-2">{lot.matieres_premieres?.nom}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{lot.quantite_restante} {lot.matieres_premieres?.unite}</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${peremptionColor(lot.date_peremption)}`}>
                        {daysUntil(lot.date_peremption) < 0
                          ? `Périmé (${Math.abs(daysUntil(lot.date_peremption))}j)`
                          : `${daysUntil(lot.date_peremption)}j restants`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow">
          <div className="p-5 border-b flex justify-between items-center">
            <h2 className="font-semibold text-lg">Dernières productions</h2>
            <Link href="/production" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="p-5">
            {recentProductions.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucune production récente</p>
            ) : (
              <div className="space-y-3">
                {recentProductions.map((prod) => (
                  <div key={prod.id} className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{prod.produits_finis?.nom}</span>
                      <span className="text-gray-500 text-sm ml-2">#{prod.numero_lot_produit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{prod.quantite_produite} unités</span>
                      <span className="text-xs text-gray-400">{prod.date_production}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
