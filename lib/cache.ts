import { adminDb } from '@/lib/firebaseAdmin'
import { getSyllabusVersion } from '@/lib/syllabusVersion'
import * as crypto from 'crypto'

const FLAG_THRESHOLD = 3
const HIT_THRESHOLD = 3
const SONNET_TRIGGER_THRESHOLD = 2
const SONNET_PROMOTE_HITS = 50
const SONNET_PROMOTE_THUMBSDOWN_RATE = 0.05

// ─────────────────────────────────────────
// HASH HELPERS
// ─────────────────────────────────────────

export function hashText(text: string): string {
  return crypto
    .createHash('sha256')
    .update(text.toLowerCase().trim().replace(/\s+/g, ' '))
    .digest('hex')
    .substring(0, 32)
}

export function hashImage(base64: string): string {
  return crypto
    .createHash('sha256')
    .update(base64)
    .digest('hex')
    .substring(0, 32)
}

// ─────────────────────────────────────────
// QUESTION TYPE DETECTION
// ─────────────────────────────────────────

export function detectCacheableType(question: string): {
  cacheable: boolean
  type: 'definition' | 'formula' | 'numerical' | 'diagram' | 'pyq' | 'conversational' | 'personal'
} {
  const q = question.toLowerCase().trim()

  // Never cache these
  if (
    q.includes('my experiment') ||
    q.includes('my teacher') ||
    q.includes('my school') ||
    q.includes('i got') ||
    q.includes('i measured') ||
    q.length < 10
  ) {
    return { cacheable: false, type: 'personal' }
  }

  if (
    q.includes('okay') ||
    q.includes('ok') ||
    q.includes('yes') ||
    q.includes('no') ||
    q.includes('thank') ||
    q.includes('got it') ||
    q.includes('understood') ||
    q.length < 15
  ) {
    return { cacheable: false, type: 'conversational' }
  }

  // Definition
  if (
    q.includes('what is') ||
    q.includes('define') ||
    q.includes('definition') ||
    q.includes('what are') ||
    q.includes('explain') ||
    q.includes('describe') ||
    q.includes('difference between') ||
    q.includes('distinguish')
  ) {
    return { cacheable: true, type: 'definition' }
  }

  // Formula
  if (
    q.includes('formula') ||
    q.includes('equation') ||
    q.includes('law of') ||
    q.includes('theorem') ||
    q.includes('principle of')
  ) {
    return { cacheable: true, type: 'formula' }
  }

  // Diagram
  if (
    q.includes('diagram') ||
    q.includes('draw') ||
    q.includes('label') ||
    q.includes('structure of')
  ) {
    return { cacheable: true, type: 'diagram' }
  }

  // PYQ
  if (
    q.includes('pyq') ||
    q.includes('previous year') ||
    q.includes('board exam') ||
    q.includes('2023') ||
    q.includes('2022') ||
    q.includes('2021') ||
    q.includes('2020')
  ) {
    return { cacheable: true, type: 'pyq' }
  }

  // Numerical
  if (
    q.includes('calculate') ||
    q.includes('find') ||
    q.includes('solve') ||
    q.includes('determine') ||
    q.includes('numerically') ||
    /\d+/.test(q)
  ) {
    return { cacheable: true, type: 'numerical' }
  }

  return { cacheable: false, type: 'conversational' }
}

// ─────────────────────────────────────────
// CACHE KEY BUILDER
// ─────────────────────────────────────────

function buildCacheKey(
  studentClass: number,
  subject: string,
  type: string,
  syllabusVersion: string
): string {
  return `class_${studentClass}_${syllabusVersion}/${subject.toLowerCase()}/${type}`
}

// ─────────────────────────────────────────
// CHECK CACHE
// ─────────────────────────────────────────

export async function checkCache(params: {
  questionHash: string
  studentClass: number
  subject: string
  type: string
  syllabusVersion: string
  thumbsDownCount: number
}): Promise<{
  hit: boolean
  answer: string | null
  source: 'sonnet' | 'haiku' | null
  cacheId: string | null
}> {
  const { questionHash, studentClass, subject, type, syllabusVersion, thumbsDownCount } = params
  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)

  try {
    const docSnap = await adminDb
      .collection('cache')
      .doc(collectionPath)
      .collection('entries')
      .doc(questionHash)
      .get()

    if (!docSnap.exists) return { hit: false, answer: null, source: null, cacheId: null }

    const data = docSnap.data()!

    if (!data.isActive) return { hit: false, answer: null, source: null, cacheId: null }

    // Serve sonnet if triggerCount >= threshold and thumbs down >= 2
    if (
      thumbsDownCount >= 2 &&
      data.sonnet_answer &&
      (data.triggerCount || 0) >= SONNET_TRIGGER_THRESHOLD
    ) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }

    // Serve haiku answer
    if (data.haiku_answer && (data.hitCount || 0) >= HIT_THRESHOLD) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.haiku_answer, source: 'haiku', cacheId: docSnap.id }
    }

    return { hit: false, answer: null, source: null, cacheId: null }

  } catch (error) {
    console.error('checkCache error:', error)
    return { hit: false, answer: null, source: null, cacheId: null }
  }
}

// ─────────────────────────────────────────
// CHECK PHOTO CACHE
// ─────────────────────────────────────────

export async function checkPhotoCache(params: {
  imageHash: string
  syllabusVersion: string
  thumbsDownCount: number
}): Promise<{
  hit: boolean
  answer: string | null
  source: 'sonnet' | 'haiku' | null
  cacheId: string | null
}> {
  const { imageHash, syllabusVersion, thumbsDownCount } = params

  try {
    const docSnap = await adminDb
      .collection(`photos_${syllabusVersion}`)
      .doc(imageHash)
      .get()

    if (!docSnap.exists) return { hit: false, answer: null, source: null, cacheId: null }

    const data = docSnap.data()!

    if (!data.isActive) return { hit: false, answer: null, source: null, cacheId: null }

    if (
      thumbsDownCount >= 2 &&
      data.sonnet_answer &&
      (data.triggerCount || 0) >= SONNET_TRIGGER_THRESHOLD
    ) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }

    if (data.haiku_answer && (data.hitCount || 0) >= HIT_THRESHOLD) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.haiku_answer, source: 'haiku', cacheId: docSnap.id }
    }

    return { hit: false, answer: null, source: null, cacheId: null }

  } catch (error) {
    console.error('checkPhotoCache error:', error)
    return { hit: false, answer: null, source: null, cacheId: null }
  }
}

// ─────────────────────────────────────────
// SAVE TO CACHE
// ─────────────────────────────────────────

export async function saveToCache(params: {
  questionHash: string
  question: string
  answer: string
  modelUsed: 'haiku' | 'sonnet'
  studentClass: number
  subject: string
  type: string
  syllabusVersion: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  thumbsDownCount: number
}): Promise<void> {
  const {
    questionHash, question, answer, modelUsed,
    studentClass, subject, type, syllabusVersion,
    confidence, thumbsDownCount
  } = params

  // Never cache low or medium confidence
  if (confidence !== 'HIGH') return

  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
  const docRef = adminDb
    .collection('cache')
    .doc(collectionPath)
    .collection('entries')
    .doc(questionHash)

  const docSnap = await docRef.get()
  const existing = docSnap.exists ? docSnap.data()! : null
  const now = new Date()

  if (modelUsed === 'sonnet' && thumbsDownCount >= 2) {
    // Save sonnet answer immediately
    await docRef.set({
      question,
      haiku_answer: existing?.haiku_answer || null,
      sonnet_answer: answer,
      triggerCount: (existing?.triggerCount || 0) + 1,
      hitCount: existing?.hitCount || 0,
      flagCount: existing?.flagCount || 0,
      isActive: true,
      subject,
      type,
      studentClass,
      syllabusVersion,
      createdAt: existing?.createdAt || now,
      lastUsed: now,
      isHardQuestion: true
    }, { merge: true })

    // Save to hard questions
    await adminDb
      .collection('hard_questions')
      .doc(`class_${studentClass}`)
      .collection(subject.toLowerCase())
      .doc(questionHash)
      .set({
        question,
        sonnetAnswer: answer,
        studentClass,
        subject,
        timesTriggeredSonnet: (existing?.triggerCount || 0) + 1,
        firstTriggeredAt: existing?.createdAt || now,
        lastTriggeredAt: now
      }, { merge: true })

    return
  }

  if (modelUsed === 'haiku') {
    const newHitCount = (existing?.hitCount || 0) + 1

    if (newHitCount >= HIT_THRESHOLD) {
      // Auto cache after 3 hits
      await docRef.set({
        question,
        haiku_answer: answer,
        sonnet_answer: existing?.sonnet_answer || null,
        hitCount: newHitCount,
        triggerCount: existing?.triggerCount || 0,
        flagCount: existing?.flagCount || 0,
        isActive: true,
        subject,
        type,
        studentClass,
        syllabusVersion,
        createdAt: existing?.createdAt || now,
        lastUsed: now,
        isHardQuestion: false
      }, { merge: true })
    } else {
      // Not enough hits yet — just increment
      await docRef.set({
        question,
        hitCount: newHitCount,
        haiku_answer: newHitCount >= HIT_THRESHOLD ? answer : (existing?.haiku_answer || null),
        sonnet_answer: existing?.sonnet_answer || null,
        triggerCount: existing?.triggerCount || 0,
        flagCount: existing?.flagCount || 0,
        isActive: false,
        subject,
        type,
        studentClass,
        syllabusVersion,
        createdAt: existing?.createdAt || now,
        lastUsed: now
      }, { merge: true })
    }
  }
}

// ─────────────────────────────────────────
// SAVE PHOTO TO CACHE
// ─────────────────────────────────────────

export async function savePhotoToCache(params: {
  imageHash: string
  extractedQuestion: string
  answer: string
  modelUsed: 'haiku' | 'sonnet'
  studentClass: number
  subject: string
  syllabusVersion: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  thumbsDownCount: number
}): Promise<void> {
  const {
    imageHash, extractedQuestion, answer, modelUsed,
    studentClass, subject, syllabusVersion,
    confidence, thumbsDownCount
  } = params

  if (confidence !== 'HIGH') return

  const docRef = adminDb
    .collection(`photos_${syllabusVersion}`)
    .doc(imageHash)

  const docSnap = await docRef.get()
  const existing = docSnap.exists ? docSnap.data()! : null
  const now = new Date()

  if (modelUsed === 'sonnet' && thumbsDownCount >= 2) {
    await docRef.set({
      extractedQuestion,
      haiku_answer: existing?.haiku_answer || null,
      sonnet_answer: answer,
      triggerCount: (existing?.triggerCount || 0) + 1,
      hitCount: existing?.hitCount || 0,
      flagCount: existing?.flagCount || 0,
      isActive: true,
      studentClass,
      subject,
      syllabusVersion,
      createdAt: existing?.createdAt || now,
      lastUsed: now
    }, { merge: true })
    return
  }

  if (modelUsed === 'haiku') {
    const newHitCount = (existing?.hitCount || 0) + 1
    await docRef.set({
      extractedQuestion,
      haiku_answer: newHitCount >= HIT_THRESHOLD ? answer : (existing?.haiku_answer || null),
      sonnet_answer: existing?.sonnet_answer || null,
      hitCount: newHitCount,
      triggerCount: existing?.triggerCount || 0,
      flagCount: existing?.flagCount || 0,
      isActive: newHitCount >= HIT_THRESHOLD,
      studentClass,
      subject,
      syllabusVersion,
      createdAt: existing?.createdAt || now,
      lastUsed: now
    }, { merge: true })
  }
}

// ─────────────────────────────────────────
// FLAG WRONG ANSWER
// ─────────────────────────────────────────

export async function flagCacheEntry(params: {
  questionHash: string
  studentClass: number
  subject: string
  type: string
  syllabusVersion: string
  uid: string
}): Promise<{ removed: boolean; flagCount: number }> {
  const { questionHash, studentClass, subject, type, syllabusVersion, uid } = params
  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)

  const docRef = adminDb
    .collection('cache')
    .doc(collectionPath)
    .collection('entries')
    .doc(questionHash)

  const docSnap = await docRef.get()
  if (!docSnap.exists) return { removed: false, flagCount: 0 }

  const data = docSnap.data()!
  const newFlagCount = (data.flagCount || 0) + 1

  if (newFlagCount >= FLAG_THRESHOLD) {
    await docRef.update({
      isActive: false,
      flagCount: newFlagCount,
      removedAt: new Date(),
      removedReason: 'student_flags'
    })
    return { removed: true, flagCount: newFlagCount }
  }

  await docRef.update({
    flagCount: newFlagCount,
    [`flaggedBy.${uid}`]: new Date()
  })

  return { removed: false, flagCount: newFlagCount }
}

// ─────────────────────────────────────────
// PROMOTE SONNET TO PRIMARY
// ─────────────────────────────────────────

export async function checkAndPromoteSonnet(params: {
  questionHash: string
  studentClass: number
  subject: string
  type: string
  syllabusVersion: string
}): Promise<void> {
  const { questionHash, studentClass, subject, type, syllabusVersion } = params
  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)

  const docRef = adminDb
    .collection('cache')
    .doc(collectionPath)
    .collection('entries')
    .doc(questionHash)

  const docSnap = await docRef.get()
  if (!docSnap.exists) return

  const data = docSnap.data()!
  if (!data.sonnet_answer) return

  const hitCount = data.hitCount || 0
  const flagCount = data.flagCount || 0
  const thumbsDownRate = hitCount > 0 ? flagCount / hitCount : 0

  if (hitCount >= SONNET_PROMOTE_HITS && thumbsDownRate < SONNET_PROMOTE_THUMBSDOWN_RATE) {
    await docRef.update({
      haiku_answer: data.sonnet_answer,
      promotedAt: new Date(),
      promotedReason: 'sonnet_proven_better'
    })
  }
}