import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import {
  getDoubtHistory,
  getDoubtById,
  markDoubtResolved,
  groupDoubtsByDate
} from '@/lib/doubtHistory'

// ─────────────────────────────────────────
// VERIFY TOKEN HELPER
// ─────────────────────────────────────────

async function verifyToken(req: NextRequest): Promise<{
  verified: boolean
  uid: string | null
}> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { verified: false, uid: null }
  }

  try {
    const idToken = authHeader.split('Bearer ')[1]
    const { adminAuth: auth } = await import('@/lib/firebaseAdmin')
    const decoded = await auth.verifyIdToken(idToken)
    return { verified: true, uid: decoded.uid }
  } catch {
    return { verified: false, uid: null }
  }
}

// ─────────────────────────────────────────
// GET — FETCH DOUBT HISTORY
// ─────────────────────────────────────────

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

    let verifiedUid: string
    try {
      const idToken = authHeader.split('Bearer ')[1]
      const decoded = await adminAuth.verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch {
      return NextResponse.json(
        { error: 'Session expired. Please login again.' },
        { status: 401 }
      )
    }

    // ── 2. APPROVAL CHECK ──
    const userSnap = await adminDb.collection('users').doc(verifiedUid).get()
    if (!userSnap.exists || !userSnap.data()?.approved) {
      return NextResponse.json({ error: 'Access not approved.', code: 'NOT_APPROVED' }, { status: 403 })
    }

    // ── 3. PARSE PARAMS ──
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') || 'list'
    const doubtId = searchParams.get('doubtId')
    const isPaid = searchParams.get('isPaid') === 'true'

    // ── 3. GET SINGLE DOUBT ──
    if (action === 'single' && doubtId) {
      const result = await getDoubtById({
        uid: verifiedUid,
        doubtId
      })

      if (!result.found) {
        return NextResponse.json(
          { error: 'Doubt not found.' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        doubt: result.doubt
      })
    }

    // ── 4. GET DOUBT LIST ──
    const { doubts } = await getDoubtHistory({
      uid: verifiedUid,
      isPaid
    })

    const grouped = groupDoubtsByDate(doubts)

    return NextResponse.json({
      success: true,
      grouped,
      total: doubts.length,
      isPaid,
      accessNote: isPaid
        ? 'Showing full history'
        : 'Showing last 7 days. Boost to see full history!'
    })

  } catch (err) {
    console.error('doubt-history GET error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again. 🙏' },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────
// POST — MARK RESOLVED / ASK AGAIN
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. VERIFY TOKEN ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login again.' },
        { status: 401 }
      )
    }

    let verifiedUid: string
    try {
      const idToken = authHeader.split('Bearer ')[1]
      const decoded = await adminAuth.verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch {
      return NextResponse.json(
        { error: 'Session expired. Please login again.' },
        { status: 401 }
      )
    }

    // ── 2. APPROVAL CHECK ──
    const userSnap2 = await adminDb.collection('users').doc(verifiedUid).get()
    if (!userSnap2.exists || !userSnap2.data()?.approved) {
      return NextResponse.json({ error: 'Access not approved.', code: 'NOT_APPROVED' }, { status: 403 })
    }

    // ── 3. PARSE BODY ──
    const body = await req.json()
    const { action, doubtId, resolved } = body

    if (!action || !doubtId) {
      return NextResponse.json(
        { error: 'action and doubtId are required.' },
        { status: 400 }
      )
    }

    // ── 3. MARK RESOLVED ──
    if (action === 'mark_resolved') {
      await markDoubtResolved({
        uid: verifiedUid,
        doubtId,
        resolved: resolved ?? true
      })

      return NextResponse.json({
        success: true,
        message: resolved
          ? 'Doubt marked as resolved! ✅'
          : 'Doubt marked as unresolved.'
      })
    }

    // ── 4. ASK AGAIN — GET CONTEXT ──
    if (action === 'ask_again') {
      const result = await getDoubtById({
        uid: verifiedUid,
        doubtId
      })

      if (!result.found || !result.doubt) {
        return NextResponse.json(
          { error: 'Doubt not found.' },
          { status: 404 }
        )
      }

      // Return previous answer as context for fresh chat
      return NextResponse.json({
        success: true,
        context: {
          previousQuestion: result.doubt.question,
          previousAnswer: result.doubt.stepwiseAnswer,
          concept: result.doubt.concept,
          subject: result.doubt.subject,
          chapter: result.doubt.chapter,
          systemNote: `Student previously asked about ${result.doubt.concept}. Previous explanation was given. Student has a follow up doubt. Do not repeat the full explanation. Go straight to the follow up.`
        }
      })
    }

    return NextResponse.json(
      { error: 'Unknown action.' },
      { status: 400 }
    )

  } catch (err) {
    console.error('doubt-history POST error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again. 🙏' },
      { status: 500 }
    )
  }
}