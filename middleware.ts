import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always public
  if (
    pathname === '/' ||
    pathname === '/vidyaai-login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Block /vidyaai without auth cookie
  if (pathname.startsWith('/vidyaai') && pathname !== '/vidyaai-login') {
    const token = request.cookies.get('vidyaai-auth')
    if (!token) return NextResponse.redirect(new URL('/vidyaai-login', request.url))
  }

  // /admin handles its own Firebase auth — no cookie check needed here

return NextResponse.next()
}

export const config = {
  matcher: ['/vidyaai/:path*', '/admin/:path*']
}
