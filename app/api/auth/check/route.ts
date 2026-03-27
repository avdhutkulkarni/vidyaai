export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    let uid: string, email: string, displayName: string
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
      uid = decoded.uid
      email = decoded.email || ''
      displayName = decoded.name || ''
    } catch {
      return NextResponse.json({ error: 'Session expired.' }, { status: 401 })
    }

    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      // New user — create pending record
      await userRef.set({
        uid,
        email,
        displayName,
        approved: false,
        status: 'pending',
        plan: 'free',
        createdAt: new Date(),
        lastActive: new Date(),
      }, { merge: true })

      return NextResponse.json({ approved: false, status: 'pending' })
    }

    const userData = userSnap.data()!

    // Backfill email/name if missing (existing users)
    if (!userData.email || !userData.displayName) {
      await userRef.set({ email, displayName }, { merge: true })
    }

    // Paid users are always approved
    if (userData.plan === 'boost' && !userData.approved) {
      await userRef.set({ approved: true, status: 'approved' }, { merge: true })
      return NextResponse.json({ approved: true, status: 'approved', plan: 'boost' })
    }

    return NextResponse.json({
      approved: userData.approved === true,
      status: userData.status || 'pending',
      plan: userData.plan || 'free',
    })

  } catch (err) {
    console.error('auth/check error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
