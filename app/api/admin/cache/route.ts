import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
import { updateSyllabusVersion, getAllSyllabusVersions } from '@/lib/syllabusVersion'

// ─────────────────────────────────────────
// VERIFY ADMIN
// ─────────────────────────────────────────

const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(u => u.trim())

async function verifyAdmin(req: NextRequest): Promise<{
  allowed: boolean
  uid: string | null
}> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { allowed: false, uid: null }
  }

  try {
    const idToken = authHeader.split('Bearer ')[1]
    const decoded = await adminAuth.verifyIdToken(idToken)

    if (!ADMIN_UIDS.includes(decoded.uid)) {
      return { allowed: false, uid: decoded.uid }
    }

    return { allowed: true, uid: decoded.uid }
  } catch {
    return { allowed: false, uid: null }
  }
}

// ─────────────────────────────────────────
// GET — ADMIN DASHBOARD STATS
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { allowed } = await verifyAdmin(req)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access only.' },
      { status: 403 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') || 'stats'

    // ── GET SYLLABUS VERSIONS ──
    if (action === 'syllabus') {
      const versions = await getAllSyllabusVersions()
      return NextResponse.json({ success: true, versions })
    }

    // ── GET CACHE STATS ──
    if (action === 'stats') {
      const todayIST = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata'
      })

      // Total users
      const usersSnap = await adminDb
        .collection('users')
        .count()
        .get()
      const totalUsers = usersSnap.data().count

      // Active today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const activeTodaySnap = await adminDb
        .collection('users')
        .where('lastActive', '>=', todayStart)
        .count()
        .get()
      const activeToday = activeTodaySnap.data().count

      // Paid users
      const paidSnap = await adminDb
        .collection('users')
        .where('plan', '==', 'boost')
        .count()
        .get()
      const paidUsers = paidSnap.data().count

      // Hard questions per class
      const hardQuestions: Record<string, number> = {}
      for (const cls of [9, 10, 11, 12]) {
        const subjects = ['physics', 'chemistry', 'biology', 'maths']
        let total = 0
        for (const subject of subjects) {
          const snap = await adminDb
            .collection('hard_questions')
            .doc(`class_${cls}`)
            .collection(subject)
            .count()
            .get()
          total += snap.data().count
        }
        hardQuestions[`class_${cls}`] = total
      }

      return NextResponse.json({
        success: true,
        stats: {
          totalUsers,
          activeToday,
          paidUsers,
          freeUsers: totalUsers - paidUsers,
          hardQuestions,
          date: todayIST
        }
      })
    }

    // ── GET HARD QUESTIONS LIST ──
    if (action === 'hard_questions') {
      const studentClass = searchParams.get('class') || '12'
      const subject = searchParams.get('subject') || 'physics'

      const snap = await adminDb
        .collection('hard_questions')
        .doc(`class_${studentClass}`)
        .collection(subject.toLowerCase())
        .orderBy('timesTriggeredSonnet', 'desc')
        .limit(20)
        .get()

      const questions = snap.docs.map(doc => ({
        id: doc.id,
        question: doc.data().question,
        timesTriggeredSonnet: doc.data().timesTriggeredSonnet,
        subject: doc.data().subject,
        studentClass: doc.data().studentClass,
        lastTriggeredAt: doc.data().lastTriggeredAt?.toDate()
      }))

      return NextResponse.json({ success: true, questions })
    }

    // ── GET FLAGGED ANSWERS ──
    if (action === 'flagged') {
      const studentClass = parseInt(searchParams.get('class') || '12')
      const syllabusVersions = await getAllSyllabusVersions()
      const version = syllabusVersions[`class_${studentClass}`] || '2023'
      const subjects = ['physics', 'chemistry', 'biology', 'maths']
      const flagged: Array<{
  id: string
  question: string
  flagCount: number
  subject: string
  type: string
  removedAt: Date | undefined
}> = []

      for (const subject of subjects) {
        const types = ['definitions', 'formulas', 'numericals', 'diagrams', 'pyq']
        for (const type of types) {
          const collectionPath = `class_${studentClass}_${version}/${subject}/${type}`
          const snap = await adminDb
            .collection('cache')
            .doc(collectionPath)
            .collection('entries')
            .where('flagCount', '>=', 1)
            .where('isActive', '==', false)
            .limit(10)
            .get()

          snap.docs.forEach(doc => {
            flagged.push({
              id: doc.id,
              question: doc.data().question,
              flagCount: doc.data().flagCount,
              subject,
              type,
              removedAt: doc.data().removedAt?.toDate()
            })
          })
        }
      }

      return NextResponse.json({ success: true, flagged })
    }

    return NextResponse.json(
      { error: 'Unknown action.' },
      { status: 400 }
    )

  } catch (err) {
    console.error('admin/cache GET error:', err)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────
// POST — ADMIN ACTIONS
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { allowed } = await verifyAdmin(req)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Unauthorized. Admin access only.' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const { action } = body

    // ── UPDATE SYLLABUS VERSION ──
    if (action === 'update_syllabus') {
      const { studentClass, newVersion } = body

      if (!studentClass || !newVersion) {
        return NextResponse.json(
          { error: 'studentClass and newVersion required.' },
          { status: 400 }
        )
      }

      await updateSyllabusVersion(studentClass, newVersion)

      return NextResponse.json({
        success: true,
        message: `Syllabus version for Class ${studentClass} updated to ${newVersion}. Old cache will be ignored automatically. ✅`
      })
    }

    // ── DELETE OLD CACHE COLLECTION ──
    if (action === 'delete_old_cache') {
      const { studentClass, oldVersion } = body

      if (!studentClass || !oldVersion) {
        return NextResponse.json(
          { error: 'studentClass and oldVersion required.' },
          { status: 400 }
        )
      }

      const subjects = ['physics', 'chemistry', 'biology', 'maths']
      const types = ['definitions', 'formulas', 'numericals', 'diagrams', 'pyq']
      let deletedCount = 0

      for (const subject of subjects) {
        for (const type of types) {
          const collectionPath = `class_${studentClass}_${oldVersion}/${subject}/${type}`
          const snap = await adminDb
            .collection('cache')
            .doc(collectionPath)
            .collection('entries')
            .limit(500)
            .get()

          const batch = adminDb.batch()
          snap.docs.forEach(doc => {
            batch.delete(doc.ref)
            deletedCount++
          })
          if (snap.docs.length > 0) await batch.commit()
        }
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${deletedCount} old cache entries for Class ${studentClass} version ${oldVersion}. ✅`
      })
    }

    // ── MANUALLY REMOVE CACHE ENTRY ──
    if (action === 'remove_entry') {
      const { collectionPath, entryId } = body

      if (!collectionPath || !entryId) {
        return NextResponse.json(
          { error: 'collectionPath and entryId required.' },
          { status: 400 }
        )
      }

      await adminDb
        .collection('cache')
        .doc(collectionPath)
        .collection('entries')
        .doc(entryId)
        .update({
          isActive: false,
          removedAt: new Date(),
          removedReason: 'admin_manual'
        })

      return NextResponse.json({
        success: true,
        message: 'Cache entry removed successfully. ✅'
      })
    }

    return NextResponse.json(
      { error: 'Unknown action.' },
      { status: 400 }
    )

  } catch (err) {
    console.error('admin/cache POST error:', err)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}