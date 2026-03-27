export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { getUsageToday } from '@/lib/doubtLimit'

export async function GET(req: NextRequest) {
  try {
    // ── 1. VERIFY TOKEN ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login again.' },
        { status: 401 }
      )
    }

    let uid: string
    try {
      const idToken = authHeader.split('Bearer ')[1]
      const decoded = await adminAuth.verifyIdToken(idToken)
      uid = decoded.uid
    } catch {
      return NextResponse.json(
        { error: 'Session expired. Please login again.' },
        { status: 401 }
      )
    }

    // ── 2. PARSE PARAMS ──
    const { searchParams } = new URL(req.url)
    const studentClassParam = searchParams.get('studentClass')
    const studentClass = studentClassParam ? parseInt(studentClassParam, 10) : 10

    if (isNaN(studentClass)) {
      return NextResponse.json(
        { error: 'Invalid studentClass parameter.' },
        { status: 400 }
      )
    }

    // ── 3. GET USAGE ──
    const usage = await getUsageToday(uid, studentClass)

    return NextResponse.json({ success: true, ...usage })

  } catch (err) {
    console.error('usage GET error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again. 🙏' },
      { status: 500 }
    )
  }
}
