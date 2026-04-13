'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/receptions', label: 'Réceptions', icon: '📦' },
  { href: '/lots', label: 'Lots', icon: '🏷️' },
  { href: '/stocks', label: 'Stocks', icon: '📋' },
  { href: '/production', label: 'Production', icon: '🏭' },
  { href: '/matieres', label: 'Matières premières', icon: '🍃' },
  { href: '/produits', label: 'Produits finis', icon: '☕' },
  { href: '/fournisseurs', label: 'Fournisseurs', icon: '🤝' },
  { href: '/audit', label: 'Audit / Traçabilité', icon: '🔍' },
  { href: '/utilisateurs', label: 'Utilisateurs', icon: '👥', adminOnly: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, signOut } = useAuth()

  return (
    <aside className="w-64 bg-sidebar text-white min-h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-wide">🍵 Thé Maya</h1>
        <p className="text-xs text-white/60 mt-1">Gestion de production</p>
      </div>
      <nav className="flex-1 py-4">
        {navItems
          .filter((item) => !('adminOnly' in item && item.adminOnly) || isAdmin)
          .map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
      </nav>
      <div className="p-4 border-t border-white/10">
        <p className="text-xs text-white/60 truncate mb-2">{user?.email}</p>
        <button
          onClick={signOut}
          className="text-sm text-white/70 hover:text-white transition-colors"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
