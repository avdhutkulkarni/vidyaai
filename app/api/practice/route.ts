export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export async function POST(req: NextRequest) {
  try {
    // ── 1. VERIFY TOKEN ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    let uid: string
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1])
      uid = decoded.uid
    } catch {
      return NextResponse.json({ error: 'Session expired.' }, { status: 401 })
    }

    // ── 2. PARSE BODY ──
    const { question, type, concept, subject, studentClass } = await req.json()

    if (!question || !type) {
      return NextResponse.json({ error: 'question and type are required.' }, { status: 400 })
    }

    // ── 3. SAVE TO FIREBASE ──
    await adminDb
      .collection('practiceQuestions')
      .doc(uid)
      .collection('questions')
      .add({
        question,
        type,                        // 'similar' | 'tricky'
        concept: concept || 'General',
        subject: subject || 'General',
        studentClass: studentClass || 12,
        solved: false,
        uid,
        createdAt: new Date()
      })

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('practice POST error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
