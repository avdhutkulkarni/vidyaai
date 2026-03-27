export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

const ADMIN_UIDS = (process.env.ADMIN_UIDS || '')
  .split(',').map(u => u.trim()).filter(Boolean)

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
    return ADMIN_UIDS.includes(decoded.uid) ? decoded.uid : null
  } catch { return null }
}

// ── GET — list users by filter ──
export async function GET(req: NextRequest) {
  const adminUid = await verifyAdmin(req)
  if (!adminUid) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'pending'
    const pageLimit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const col = adminDb.collection('users') as any
    let q = col.orderBy('createdAt', 'desc')
    if (filter !== 'all') q = col.where('status', '==', filter).orderBy('createdAt', 'desc')
    q = q.limit(pageLimit)

    const [snap, pendingSnap] = await Promise.all([
      q.get(),
      adminDb.collection('users').where('status', '==', 'pending').count().get()
    ])

    const users = snap.docs.map((doc: any) => {
      const d = doc.data()
      return {
        uid: doc.id,
        displayName: d.displayName || 'Unknown',
        email: d.email || '',
        studentClass: d.studentClass || null,
        plan: d.plan || 'free',
        status: d.status || 'pending',
        approved: d.approved || false,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        lastActive: d.lastActive?.toDate?.()?.toISOString() || null,
        totalDoubts: d.totalDoubts || 0,
      }
    })

    return NextResponse.json({
      success: true,
      users,
      pendingCount: pendingSnap.data().count
    })

  } catch (err) {
    console.error('admin/users GET error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// ── POST — approve / reject / revoke / add_email / remove_email ──
export async function POST(req: NextRequest) {
  const adminUid = await verifyAdmin(req)
  if (!adminUid) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  try {
    const body = await req.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'action required.' }, { status: 400 })
    }

    const now = new Date()

    // ── Add email to whitelist (pre-approve before signup) ──
    if (action === 'add_email') {
      const email = String(body.email || '').toLowerCase().trim()
      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
      }
      await adminDb.collection('whitelist').doc(email).set({
        email,
        plan: body.plan || 'free',
        addedBy: adminUid,
        addedAt: now,
      })
      // If user already signed up with this email, approve them now
      const existingSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get()
      if (!existingSnap.empty) {
        await existingSnap.docs[0].ref.set(
          { approved: true, status: 'approved', approvedAt: now, approvedBy: adminUid },
          { merge: true }
        )
        return NextResponse.json({ success: true, message: `${email} added and approved ✓` })
      }
      return NextResponse.json({ success: true, message: `${email} added to whitelist ✓` })
    }

    // ── Remove email from whitelist ──
    if (action === 'remove_email') {
      const email = String(body.email || '').toLowerCase().trim()
      if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 })
      await adminDb.collection('whitelist').doc(email).delete()
      return NextResponse.json({ success: true, message: `${email} removed from whitelist.` })
    }

    // ── User actions (require uid) ──
    const { uid } = body
    if (!uid) return NextResponse.json({ error: 'uid required.' }, { status: 400 })

    const userRef = adminDb.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    if (action === 'approve') {
      await userRef.set(
        { approved: true, status: 'approved', approvedAt: now, approvedBy: adminUid },
        { merge: true }
      )
      return NextResponse.json({ success: true, message: 'User approved ✓' })
    }

    if (action === 'reject') {
      await userRef.set(
        { approved: false, status: 'rejected', rejectedAt: now, rejectedBy: adminUid },
        { merge: true }
      )
      return NextResponse.json({ success: true, message: 'User rejected.' })
    }

    if (action === 'revoke') {
      await userRef.set(
        { approved: false, status: 'pending', revokedAt: now, revokedBy: adminUid },
        { merge: true }
      )
      return NextResponse.json({ success: true, message: 'Access revoked.' })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  } catch (err) {
    console.error('admin/users POST error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
