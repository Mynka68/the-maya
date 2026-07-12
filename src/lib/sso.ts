// ── SSO d'équipe — gate middleware (edge) ──
// Barrière serveur : n'autorise que les membres du Hub (session partagée + 2FA aal2 +
// hub_members). Protège aussi les routes /api (dont /api/extract-bon, jusqu'ici ouverte).
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const HUB_URL = 'https://hub.apps.mynoa.fr'
const HUB_SUPABASE_URL = 'https://qlxnzqrofvueyncdbuoc.supabase.co'
const HUB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseG56cXJvZnZ1ZXluY2RidW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5MzY2NzcsImV4cCI6MjA3MTUxMjY3N30.9Ww8CoahszeCGnHzkHr0jRwCjfccv0otD7fAguQd07A'
const COOKIE_DOMAIN = '.apps.mynoa.fr'

function isLocal(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

export async function ssoGate(req: NextRequest, appUrl: string): Promise<NextResponse> {
  const host = req.headers.get('host') || ''
  if (isLocal(host)) return NextResponse.next({ request: req })

  const canonical = new URL(appUrl)
  if (host !== canonical.host) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname + req.nextUrl.search, canonical.origin),
    )
  }

  const res = NextResponse.next({ request: req })
  const supabase = createServerClient(HUB_SUPABASE_URL, HUB_ANON, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, { ...options, domain: COOKIE_DOMAIN }),
        )
      },
    },
    cookieOptions: { domain: COOKIE_DOMAIN },
  })

  let ok = false
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      const { data: member } = await supabase
        .from('hub_members')
        .select('email')
        .maybeSingle()
      ok = !!member
    }
  }
  if (ok) return res

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  const back = canonical.origin + req.nextUrl.pathname + req.nextUrl.search
  return NextResponse.redirect(`${HUB_URL}/?next=${encodeURIComponent(back)}`)
}
