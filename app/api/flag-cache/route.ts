import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { flagCacheEntry } from '@/lib/cache'
import { getSyllabusVersion } from '@/lib/syllabusVersion'

export async function POST(req: NextRequest) {
  try {
    // ── 1. VERIFY FIREBASE TOKEN ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login again.' },
        { status: 401 }
      )
    }

    const idToken = authHeader.split('Bearer ')[1]

    try {
      await adminAuth.verifyIdToken(idToken)
    } catch {
      return NextResponse.json(
        { error: 'Session expired. Please login again.' },
        { status: 401 }
      )
    }

    // ── 2. PARSE REQUEST ──
    const body = await req.json()
    const {
      questionHash,
      studentClass,
      subject,
      type,
      uid
    } = body

    if (!questionHash || !studentClass || !subject || !type || !uid) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    // ── 3. GET SYLLABUS VERSION ──
    const syllabusVersion = await getSyllabusVersion(studentClass)

    // ── 4. FLAG THE ENTRY ──
    const result = await flagCacheEntry({
      questionHash,
      studentClass,
      subject,
      type,
      syllabusVersion,
      uid
    })

    // ── 5. RETURN RESULT ──
    if (result.removed) {
      return NextResponse.json({
        success: true,
        removed: true,
        message: 'Thank you! This answer has been removed and will be reviewed. 🙏'
      })
    }

    return NextResponse.json({
      success: true,
      removed: false,
      flagCount: result.flagCount,
      message: 'Thank you for your feedback! 🙏'
    })

  } catch (err) {
    console.error('flag-cache error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again. 🙏' },
      { status: 500 }
    )
  }
}