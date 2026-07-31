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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vertical-noir.svg" alt="Thé Maya" className="h-28 w-auto mx-auto mb-4" />
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
