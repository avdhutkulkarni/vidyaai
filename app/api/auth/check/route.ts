export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

const ADMIN_UIDS = (process.env.ADMIN_UIDS || '')
  .split(',').map(u => u.trim()).filter(Boolean)

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

    // Admin UIDs are always approved — auto-create/update their doc
    if (ADMIN_UIDS.includes(uid)) {
      const userRef = adminDb.collection('users').doc(uid)
      await userRef.set(
        { uid, email, displayName, approved: true, status: 'approved', plan: 'admin', lastActive: new Date() },
        { merge: true }
      )
      return NextResponse.json({ approved: true, status: 'approved', plan: 'admin' })
    }

    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      // Auto-approve all new users for now
      await userRef.set({
        uid,
        email,
        displayName,
        approved: true,
        status: 'approved',
        plan: 'free',
        createdAt: new Date(),
        lastActive: new Date(),
      }, { merge: true })

      return NextResponse.json({ approved: true, status: 'approved' })
    }

    const userData = userSnap.data()!

    // Backfill email/name if missing
    if (!userData.email || !userData.displayName) {
      await userRef.set({ email, displayName }, { merge: true })
    }

    // Update last active + ensure approved
    if (!userData.approved) {
      await userRef.set({ approved: true, status: 'approved', lastActive: new Date() }, { merge: true })
    } else {
      await userRef.set({ lastActive: new Date() }, { merge: true })
    }

    return NextResponse.json({
      approved: true,
      status: 'approved',
      plan: userData.plan || 'free',
    })

  } catch (err) {
    console.error('auth/check error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
