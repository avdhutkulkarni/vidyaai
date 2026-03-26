import { adminDb } from '@/lib/firebaseAdmin'

// ─────────────────────────────────────────
// SAVE DOUBT TO HISTORY
// ─────────────────────────────────────────

export async function saveDoubtHistory(params: {
  uid: string
  question: string
  questionType: 'text' | 'photo'
  stepwiseAnswer: string
  subject: string
  concept: string
  chapter: string
  studentClass: number
  resolved: boolean
  modelUsed: 'haiku' | 'sonnet'
}): Promise<string> {
  const {
    uid, question, questionType, stepwiseAnswer,
    subject, concept, chapter, studentClass,
    resolved, modelUsed
  } = params

  const now = new Date()
  const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const doubtRef = adminDb
    .collection('doubt_history')
    .doc(uid)
    .collection('doubts')
    .doc()

  await doubtRef.set({
    question,
    questionType,
    stepwiseAnswer,
    subject,
    concept,
    chapter,
    studentClass,
    resolved,
    modelUsed,
    askedAt: now,
    dateIST: todayIST,
    updatedAt: now
  })

  return doubtRef.id
}

// ─────────────────────────────────────────
// GET DOUBT HISTORY FOR STUDENT
// ─────────────────────────────────────────

export async function getDoubtHistory(params: {
  uid: string
  isPaid: boolean
  limitDays?: number
}): Promise<{
  doubts: Array<{
    id: string
    question: string
    questionType: string
    stepwiseAnswer: string
    subject: string
    concept: string
    chapter: string
    studentClass: number
    resolved: boolean
    modelUsed: string
    askedAt: Date
    dateIST: string
  }>
}> {
  const { uid, isPaid } = params

  // Free = last 7 days only
  // Boost = all time
  const now = new Date()
  const cutoffDate = new Date(now)
  if (!isPaid) {
    cutoffDate.setDate(cutoffDate.getDate() - 7)
  } else {
    cutoffDate.setFullYear(2000) // effectively all time
  }

  try {
    const snapshot = await adminDb
      .collection('doubt_history')
      .doc(uid)
      .collection('doubts')
      .where('askedAt', '>=', cutoffDate)
      .orderBy('askedAt', 'desc')
      .limit(200)
      .get()

    const doubts = snapshot.docs.map(doc => ({
      id: doc.id,
      question: doc.data().question || '',
      questionType: doc.data().questionType || 'text',
      stepwiseAnswer: doc.data().stepwiseAnswer || '',
      subject: doc.data().subject || '',
      concept: doc.data().concept || '',
      chapter: doc.data().chapter || '',
      studentClass: doc.data().studentClass || 12,
      resolved: doc.data().resolved || false,
      modelUsed: doc.data().modelUsed || 'haiku',
      askedAt: doc.data().askedAt?.toDate() || now,
      dateIST: doc.data().dateIST || ''
    }))

    return { doubts }

  } catch (error) {
    console.error('getDoubtHistory error:', error)
    return { doubts: [] }
  }
}

// ─────────────────────────────────────────
// GET SINGLE DOUBT BY ID
// ─────────────────────────────────────────

export async function getDoubtById(params: {
  uid: string
  doubtId: string
}): Promise<{
  found: boolean
  doubt: {
    id: string
    question: string
    questionType: string
    stepwiseAnswer: string
    subject: string
    concept: string
    chapter: string
    studentClass: number
    resolved: boolean
    modelUsed: string
    askedAt: Date
  } | null
}> {
  const { uid, doubtId } = params

  try {
    const docSnap = await adminDb
      .collection('doubt_history')
      .doc(uid)
      .collection('doubts')
      .doc(doubtId)
      .get()

    if (!docSnap.exists) return { found: false, doubt: null }

    const data = docSnap.data()!

    return {
      found: true,
      doubt: {
        id: docSnap.id,
        question: data.question || '',
        questionType: data.questionType || 'text',
        stepwiseAnswer: data.stepwiseAnswer || '',
        subject: data.subject || '',
        concept: data.concept || '',
        chapter: data.chapter || '',
        studentClass: data.studentClass || 12,
        resolved: data.resolved || false,
        modelUsed: data.modelUsed || 'haiku',
        askedAt: data.askedAt?.toDate() || new Date()
      }
    }

  } catch (error) {
    console.error('getDoubtById error:', error)
    return { found: false, doubt: null }
  }
}

// ─────────────────────────────────────────
// MARK DOUBT AS RESOLVED
// ─────────────────────────────────────────

export async function markDoubtResolved(params: {
  uid: string
  doubtId: string
  resolved: boolean
}): Promise<void> {
  const { uid, doubtId, resolved } = params

  try {
    await adminDb
      .collection('doubt_history')
      .doc(uid)
      .collection('doubts')
      .doc(doubtId)
      .update({
        resolved,
        updatedAt: new Date()
      })
  } catch (error) {
    console.error('markDoubtResolved error:', error)
  }
}

// ─────────────────────────────────────────
// GROUP DOUBTS BY DATE — FOR FRONTEND
// ─────────────────────────────────────────

export function groupDoubtsByDate(doubts: Array<{
  id: string
  question: string
  questionType: string
  stepwiseAnswer: string
  subject: string
  concept: string
  studentClass: number
  resolved: boolean
  modelUsed: string
  askedAt: Date
  dateIST: string
  chapter: string
}>): Array<{
  label: string
  doubts: typeof doubts
}> {
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayIST = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const groups: Record<string, typeof doubts> = {}

  for (const doubt of doubts) {
    const dateKey = doubt.dateIST

    let label: string
    if (dateKey === todayIST) {
      label = 'Today'
    } else if (dateKey === yesterdayIST) {
      label = 'Yesterday'
    } else {
      // Format as "24 March" or "20 March" etc
      const d = doubt.askedAt
      label = d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Kolkata'
      })
    }

    if (!groups[label]) groups[label] = []
    groups[label].push(doubt)
  }

  // Return in order — Today first
  const orderedLabels = Object.keys(groups)
  return orderedLabels.map(label => ({
    label,
    doubts: groups[label]
  }))
}