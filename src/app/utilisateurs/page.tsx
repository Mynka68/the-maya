'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface UserProfile {
  id: string
  email: string
  name: string | null
  created_at: string
  user_roles: { role: string }[]
}

export default function UtilisateursPage() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, created_at, user_roles(role)')
      .order('created_at', { ascending: false })
    setUsers((data as unknown as UserProfile[]) || [])
    setLoading(false)
  }

  async function invite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setMessage('')

    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: inviteEmail },
    })

    if (error || data?.error) {
      setMessage(data?.error || error?.message || 'Erreur lors de l\'invitation')
    } else {
      setMessage('Invitation envoyée avec succès !')
      setInviteEmail('')
      setShowInvite(false)
      setTimeout(() => setMessage(''), 3000)
      load()
    }
    setInviting(false)
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Accès réservé aux administrateurs</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">Utilisateurs</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition"
        >
          + Inviter un utilisateur
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('succès') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      {showInvite && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <h2 className="font-semibold mb-4">Inviter un utilisateur</h2>
          <div className="flex gap-4">
            <input
              type="email"
              placeholder="Email de l'utilisateur"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="border rounded-lg px-3 py-2 flex-1"
            />
            <button
              onClick={invite}
              disabled={inviting}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light disabled:opacity-50"
            >
              {inviting ? 'Envoi...' : 'Envoyer l\'invitation'}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
            >
              Annuler
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">L'utilisateur recevra un email avec un lien pour créer son mot de passe.</p>
        </div>
      )}

      {loading ? <p className="text-gray-500">Chargement...</p> : (
        <div className="bg-card rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Membre depuis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const role = u.user_roles?.[0]?.role || 'user'
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{u.name || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Aucun utilisateur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
