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

interface MonthBar {
  label: string
  kg: number
  count: number
}

interface StockMatiere {
  nom: string
  unite: string
  categorie: string
  total: number
}

export default function Dashboard() {
  const [lotsExpiring, setLotsExpiring] = useState<Lot[]>([])
  const [recentProductions, setRecentProductions] = useState<Production[]>([])
  const [stats, setStats] = useState({ lotsDisponibles: 0, productionsMois: 0, lotsCritiques: 0, totalMatieres: 0 })
  const [monthBars, setMonthBars] = useState<MonthBar[]>([])
  const [stocksMatieres, setStocksMatieres] = useState<StockMatiere[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const now = new Date()
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0]

    const [lotsRes, prodsRes, statsLotsRes, statsProdRes, matiereRes, chartRes, stockRes] = await Promise.all([
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
      supabase
        .from('productions')
        .select('date_production, quantite_produite, grammage, production_lignes(grammage, quantite)')
        .gte('date_production', sixMonthsAgo),
      supabase
        .from('lots')
        .select('quantite_restante, matieres_premieres(nom, unite, categorie)')
        .in('statut', ['disponible', 'en_cours']),
    ])

    setLotsExpiring((lotsRes.data as unknown as Lot[]) || [])
    setRecentProductions((prodsRes.data as unknown as Production[]) || [])
    setStats({
      lotsDisponibles: statsLotsRes.count || 0,
      productionsMois: statsProdRes.count || 0,
      lotsCritiques: (lotsRes.data || []).length,
      totalMatieres: matiereRes.count || 0,
    })

    // Productions par mois (6 derniers mois)
    interface ChartProd { date_production: string; quantite_produite: number; grammage: number | null; production_lignes: { grammage: number; quantite: number }[] }
    const chartProds = (chartRes.data as unknown as ChartProd[]) || []
    const bars: MonthBar[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const inMonth = chartProds.filter(p => p.date_production.startsWith(key))
      const kg = inMonth.reduce((sum, p) => {
        if (p.production_lignes?.length > 0) {
          return sum + p.production_lignes.reduce((s, l) => s + l.quantite * l.grammage, 0) / 1000
        }
        return sum + (p.grammage ? p.quantite_produite * p.grammage / 1000 : 0)
      }, 0)
      bars.push({
        label: d.toLocaleDateString('fr-FR', { month: 'short' }),
        kg: Math.round(kg * 100) / 100,
        count: inMonth.length,
      })
    }
    setMonthBars(bars)

    // Stock total par matière première (lots disponibles + en cours)
    interface StockLot { quantite_restante: number; matieres_premieres: { nom: string; unite: string; categorie: string } | null }
    const stockLots = (stockRes.data as unknown as StockLot[]) || []
    const byMatiere: Record<string, StockMatiere> = {}
    for (const lot of stockLots) {
      if (!lot.matieres_premieres) continue
      const m = lot.matieres_premieres
      if (!byMatiere[m.nom]) byMatiere[m.nom] = { nom: m.nom, unite: m.unite, categorie: m.categorie, total: 0 }
      byMatiere[m.nom].total += lot.quantite_restante
    }
    setStocksMatieres(Object.values(byMatiere).sort((a, b) => a.total - b.total))

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

  const maxKg = Math.max(...monthBars.map(b => b.kg), 0.001)

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/production/nouvelle" className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-light transition">
            + Nouvelle production
          </Link>
          <Link href="/receptions/nouveau" className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm hover:bg-primary/20 transition">
            + Nouvelle réception
          </Link>
          <Link href="/stocks/inventaire" className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300 transition">
            🖨️ Inventaire
          </Link>
        </div>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Productions des 6 derniers mois */}
        <div className="bg-card rounded-lg shadow">
          <div className="p-5 border-b">
            <h2 className="font-semibold text-lg">Production des 6 derniers mois</h2>
          </div>
          <div className="p-5">
            {monthBars.every(b => b.count === 0) ? (
              <p className="text-gray-400 text-sm">Aucune production sur la période</p>
            ) : (
              <div className="flex items-end gap-3 h-44">
                {monthBars.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-xs font-medium text-gray-600 mb-1">
                      {b.kg > 0 ? `${b.kg} kg` : ''}
                    </span>
                    <div
                      className="w-full bg-primary/80 rounded-t hover:bg-primary transition"
                      style={{ height: `${Math.max((b.kg / maxKg) * 100, b.count > 0 ? 4 : 1)}%` }}
                      title={`${b.count} production(s) — ${b.kg} kg`}
                    />
                    <span className="text-xs text-gray-500 mt-2 capitalize">{b.label}</span>
                    <span className="text-[10px] text-gray-400">{b.count} prod.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stocks par matière première */}
        <div className="bg-card rounded-lg shadow">
          <div className="p-5 border-b flex justify-between items-center">
            <h2 className="font-semibold text-lg">Stocks par matière</h2>
            <Link href="/stocks" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="p-5">
            {stocksMatieres.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucun stock disponible</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {stocksMatieres.slice(0, 10).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{m.nom}</span>
                    <span className={`font-medium whitespace-nowrap ${m.total <= 0 ? 'text-red-600' : m.total < 1 ? 'text-orange-500' : 'text-gray-700'}`}>
                      {Math.round(m.total * 1000) / 1000} {m.unite}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
