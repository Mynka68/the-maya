import { createBrowserClient } from '@supabase/ssr'

// SSO d'équipe : la session vient du Hub via un cookie partagé sur .apps.mynoa.fr.
// Comme les DONNÉES de the-maya sont sur le MÊME projet Supabase que le Hub, cette session
// (email + 2FA) satisfait directement la RLS — aucune connexion propre à l'app.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const cookieOptions: { path: string; sameSite: 'lax'; secure: boolean; domain?: string } = {
  path: '/',
  sameSite: 'lax',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
}
if (typeof window !== 'undefined' && window.location.hostname.endsWith('.apps.mynoa.fr')) {
  cookieOptions.domain = '.apps.mynoa.fr'
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions })
