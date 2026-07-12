import type { NextRequest } from 'next/server'

import { ssoGate } from '@/lib/sso'

// URL canonique sous le domaine du cookie partagé.
const APP_URL = 'https://production.apps.mynoa.fr'

// Tout est protégé par le SSO d'équipe (connexion + 2FA au Hub), pages ET API
// (y compris /api/extract-bon). Aucune route publique.
export async function middleware(req: NextRequest) {
  return ssoGate(req, APP_URL)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
