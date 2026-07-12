'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useEffect } from 'react'
import Sidebar from './Sidebar'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  useEffect(() => {
    // Filet client : si pas de session partagée, retour au Hub (le middleware l'a déjà
    // normalement bloqué côté serveur).
    if (!loading && !user) {
      window.location.href =
        'https://hub.apps.mynoa.fr/?next=' + encodeURIComponent(window.location.href)
    }
  }, [loading, user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <p className="text-xl font-bold text-primary-dark mb-2">🍵 Thé Maya</p>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-64 p-8">{children}</main>
    </>
  )
}
