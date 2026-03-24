import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // These routes are always public — never block
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
  if (pathname.startsWith('/vidyaai')) {
    const token = request.cookies.get('vidyaai-auth')
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/vidyaai/:path*']
}