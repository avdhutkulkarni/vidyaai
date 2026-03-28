import { adminDb } from '@/lib/firebaseAdmin'
import * as crypto from 'crypto'

const FLAG_THRESHOLD = 3
const HAIKU_THUMBSUP_THRESHOLD = 2
const TOP_EXAMPLES_LIMIT = 20

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text.toLowerCase().trim().replace(/\s+/g, ' ')).digest('hex').substring(0, 32)
}

export function hashImage(base64: string): string {
  return crypto.createHash('sha256').update(base64).digest('hex').substring(0, 32)
}

export function detectCacheableType(question: string): {
  cacheable: boolean
  type: 'definition' | 'formula' | 'numerical' | 'diagram' | 'pyq' | 'conversational' | 'personal'
} {
  const q = question.toLowerCase().trim()
  if (q.includes('my experiment') || q.includes('my teacher') || q.includes('my school') || q.includes('i got') || q.includes('i measured') || q.length < 10) return { cacheable: false, type: 'personal' }
  if (q === 'ok' || q === 'okay' || q === 'yes' || q === 'no' || q.includes('thank') || q.includes('got it') || q.includes('understood') || q.includes('i selected') || q.includes('want to') || q.includes('i am done') || q.length < 15) return { cacheable: false, type: 'conversational' }
  if (q.includes('pyq') || q.includes('previous year') || q.includes('board exam') || q.includes('2023') || q.includes('2022') || q.includes('2021') || q.includes('2020')) return { cacheable: true, type: 'pyq' }
  if (q.includes('what is') || q.includes('define') || q.includes('definition') || q.includes('what are') || q.includes('explain') || q.includes('describe') || q.includes('difference between') || q.includes('distinguish')) return { cacheable: true, type: 'definition' }
  if (q.includes('formula') || q.includes('equation') || q.includes('law of') || q.includes('theorem') || q.includes('principle of')) return { cacheable: true, type: 'formula' }
  if (q.includes('diagram') || q.includes('draw') || q.includes('label') || q.includes('structure of')) return { cacheable: true, type: 'diagram' }
  if (q.includes('calculate') || q.includes('find') || q.includes('solve') || q.includes('determine') || /\d+/.test(q)) return { cacheable: true, type: 'numerical' }
  return { cacheable: false, type: 'conversational' }
}

function buildCacheKey(studentClass: number, subject: string, type: string, syllabusVersion: string): string {
  return `class_${studentClass}_${syllabusVersion}/${subject.toLowerCase()}/${type}`
}

export async function getTopExamples(params: {
  studentClass: number
  subject: string
  syllabusVersion: string
}): Promise<Array<{ question: string; answer: string; thumbsUpCount: number }>> {
  const { studentClass, subject, syllabusVersion } = params
  try {
    const types = ['definition', 'formula', 'numerical', 'diagram', 'pyq']
    const examples: Array<{ question: string; answer: string; thumbsUpCount: number }> = []
    for (const type of types) {
      const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
      const snap = await adminDb.collection('cache').doc(collectionPath).collection('entries')
        .where('isActive', '==', true).where('thumbsUpCount', '>=', 2)
        .orderBy('thumbsUpCount', 'desc').limit(5).get()
      snap.docs.forEach(doc => {
        const d = doc.data()
        examples.push({ question: d.question || '', answer: d.sonnet_answer || d.haiku_answer || '', thumbsUpCount: d.thumbsUpCount || 0 })
      })
    }
    return examples.sort((a, b) => b.thumbsUpCount - a.thumbsUpCount).slice(0, TOP_EXAMPLES_LIMIT)
  } catch (error) {
    console.error('getTopExamples error:', error)
    return []
  }
}

export async function getThumbsDownAnalysis(params: {
  studentClass: number
  subject: string
  syllabusVersion: string
}): Promise<Array<{ question: string; answer: string; flagCount: number }>> {
  const { studentClass, subject, syllabusVersion } = params
  try {
    const types = ['definition', 'formula', 'numerical']
    const flagged: Array<{ question: string; answer: string; flagCount: number }> = []
    for (const type of types) {
      const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
      const snap = await adminDb.collection('cache').doc(collectionPath).collection('entries')
        .where('flagCount', '>=', 1).orderBy('flagCount', 'desc').limit(5).get()
      snap.docs.forEach(doc => {
        const d = doc.data()
        flagged.push({ question: d.question || '', answer: d.haiku_answer || d.sonnet_answer || '', flagCount: d.flagCount || 0 })
      })
    }
    return flagged.sort((a, b) => b.flagCount - a.flagCount).slice(0, 10)
  } catch (error) {
    console.error('getThumbsDownAnalysis error:', error)
    return []
  }
}

export async function checkCache(params: {
  questionHash: string; studentClass: number; subject: string; type: string; syllabusVersion: string; thumbsDownCount: number
}): Promise<{ hit: boolean; answer: string | null; source: 'sonnet' | 'haiku' | null; cacheId: string | null }> {
  const { questionHash, studentClass, subject, type, syllabusVersion, thumbsDownCount } = params
  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
  try {
    const docSnap = await adminDb.collection('cache').doc(collectionPath).collection('entries').doc(questionHash).get()
    if (!docSnap.exists) return { hit: false, answer: null, source: null, cacheId: null }
    const data = docSnap.data()!
    if (!data.isActive) return { hit: false, answer: null, source: null, cacheId: null }
    if (thumbsDownCount >= 2 && data.sonnet_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }
    if (data.haiku_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.haiku_answer, source: 'haiku', cacheId: docSnap.id }
    }
    if (data.sonnet_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }
    return { hit: false, answer: null, source: null, cacheId: null }
  } catch (error) {
    console.error('checkCache error:', error)
    return { hit: false, answer: null, source: null, cacheId: null }
  }
}

export async function checkPhotoCache(params: {
  imageHash: string; syllabusVersion: string; thumbsDownCount: number
}): Promise<{ hit: boolean; answer: string | null; source: 'sonnet' | 'haiku' | null; cacheId: string | null }> {
  const { imageHash, syllabusVersion, thumbsDownCount } = params
  try {
    const docSnap = await adminDb.collection(`photos_${syllabusVersion}`).doc(imageHash).get()
    if (!docSnap.exists) return { hit: false, answer: null, source: null, cacheId: null }
    const data = docSnap.data()!
    if (!data.isActive) return { hit: false, answer: null, source: null, cacheId: null }
    if (thumbsDownCount >= 2 && data.sonnet_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }
    if (data.haiku_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.haiku_answer, source: 'haiku', cacheId: docSnap.id }
    }
    if (data.sonnet_answer) {
      await docSnap.ref.update({ lastUsed: new Date(), hitCount: (data.hitCount || 0) + 1 })
      return { hit: true, answer: data.sonnet_answer, source: 'sonnet', cacheId: docSnap.id }
    }
    return { hit: false, answer: null, source: null, cacheId: null }
  } catch (error) {
    console.error('checkPhotoCache error:', error)
    return { hit: false, answer: null, source: null, cacheId: null }
  }
}

export async function saveToCache(params: {
  questionHash: string; question: string; answer: string; modelUsed: 'haiku' | 'sonnet'
  studentClass: number; subject: string; type: string; syllabusVersion: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'; thumbsDownCount: number
}): Promise<void> {
  const { questionHash, question, answer, modelUsed, studentClass, subject, type, syllabusVersion, confidence, thumbsDownCount } = params
  if (confidence !== 'HIGH') return
  const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
  const docRef = adminDb.collection('cache').doc(collectionPath).collection('entries').doc(questionHash)
  const docSnap = await docRef.get()
  const existing = docSnap.exists ? docSnap.data()! : null
  const now = new Date()
  if (modelUsed === 'sonnet') {
    await docRef.set({
      question, haiku_answer: existing?.haiku_answer || null, sonnet_answer: answer,
      thumbsUpCount: existing?.thumbsUpCount || 0, thumbsUpUsers: existing?.thumbsUpUsers || [],
      hitCount: existing?.hitCount || 0, flagCount: existing?.flagCount || 0,
      isActive: true, subject, type, studentClass, syllabusVersion,
      createdAt: existing?.createdAt || now, lastUsed: now, isHardQuestion: thumbsDownCount >= 2
    }, { merge: true })
    if (thumbsDownCount >= 2) {
      await adminDb.collection('hard_questions').doc(`class_${studentClass}`).collection(subject.toLowerCase()).doc(questionHash)
        .set({ question, sonnetAnswer: answer, studentClass, subject, triggeredAt: now }, { merge: true })
    }
    return
  }
  if (modelUsed === 'haiku') {
    await docRef.set({
      question, haiku_answer_pending: answer, haiku_answer: existing?.haiku_answer || null,
      sonnet_answer: existing?.sonnet_answer || null,
      thumbsUpCount: existing?.thumbsUpCount || 0, thumbsUpUsers: existing?.thumbsUpUsers || [],
      hitCount: (existing?.hitCount || 0) + 1, flagCount: existing?.flagCount || 0,
      isActive: !!(existing?.haiku_answer || existing?.sonnet_answer),
      subject, type, studentClass, syllabusVersion,
      createdAt: existing?.createdAt || now, lastUsed: now
    }, { merge: true })
  }
}

export async function savePhotoToCache(params: {
  imageHash: string; extractedQuestion: string; answer: string; modelUsed: 'haiku' | 'sonnet'
  studentClass: number; subject: string; syllabusVersion: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'; thumbsDownCount: number
}): Promise<void> {
  const { imageHash, extractedQuestion, answer, modelUsed, studentClass, subject, syllabusVersion, confidence, thumbsDownCount } = params
  if (confidence !== 'HIGH') return
  const docRef = adminDb.collection(`photos_${syllabusVersion}`).doc(imageHash)
  const docSnap = await docRef.get()
  const existing = docSnap.exists ? docSnap.data()! : null
  const now = new Date()
  if (modelUsed === 'sonnet') {
    await docRef.set({
      extractedQuestion, haiku_answer: existing?.haiku_answer || null, sonnet_answer: answer,
      thumbsUpCount: existing?.thumbsUpCount || 0, thumbsUpUsers: existing?.thumbsUpUsers || [],
      hitCount: existing?.hitCount || 0, flagCount: existing?.flagCount || 0,
      isActive: true, studentClass, subject, syllabusVersion,
      createdAt: existing?.createdAt || now, lastUsed: now
    }, { merge: true })
    return
  }
  if (modelUsed === 'haiku') {
    await docRef.set({
      extractedQuestion, haiku_answer_pending: answer, haiku_answer: existing?.haiku_answer || null,
      sonnet_answer: existing?.sonnet_answer || null,
      thumbsUpCount: existing?.thumbsUpCount || 0, thumbsUpUsers: existing?.thumbsUpUsers || [],
      hitCount: (existing?.hitCount || 0) + 1, flagCount: existing?.flagCount || 0,
      isActive: !!(existing?.haiku_answer || existing?.sonnet_answer),
      studentClass, subject, syllabusVersion,
      createdAt: existing?.createdAt || now, lastUsed: now
    }, { merge: true })
  }
}

export async function recordThumbsUp(params: {
  questionHash?: string; imageHash?: string; studentClass: number; subject: string
  type?: string; syllabusVersion: string; uid: string; isPhoto: boolean
}): Promise<{ cached: boolean; thumbsUpCount: number }> {
  const { questionHash, imageHash, studentClass, subject, type, syllabusVersion, uid, isPhoto } = params
  try {
    let docRef: any
    if (isPhoto && imageHash) {
      docRef = adminDb.collection(`photos_${syllabusVersion}`).doc(imageHash)
    } else if (questionHash && type) {
      const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
      docRef = adminDb.collection('cache').doc(collectionPath).collection('entries').doc(questionHash)
    } else return { cached: false, thumbsUpCount: 0 }
    const docSnap = await docRef.get()
    if (!docSnap.exists) return { cached: false, thumbsUpCount: 0 }
    const data = docSnap.data()!
    const thumbsUpUsers: string[] = data.thumbsUpUsers || []
    if (thumbsUpUsers.includes(uid)) return { cached: false, thumbsUpCount: data.thumbsUpCount || 0 }
    const newThumbsUpCount = (data.thumbsUpCount || 0) + 1
    const newThumbsUpUsers = [...thumbsUpUsers, uid]
    if (newThumbsUpCount >= HAIKU_THUMBSUP_THRESHOLD && data.haiku_answer_pending && !data.haiku_answer) {
      await docRef.update({ haiku_answer: data.haiku_answer_pending, haiku_answer_pending: null, isActive: true, thumbsUpCount: newThumbsUpCount, thumbsUpUsers: newThumbsUpUsers, cachedAt: new Date() })
      return { cached: true, thumbsUpCount: newThumbsUpCount }
    }
    await docRef.update({ thumbsUpCount: newThumbsUpCount, thumbsUpUsers: newThumbsUpUsers })
    return { cached: false, thumbsUpCount: newThumbsUpCount }
  } catch (error) {
    console.error('recordThumbsUp error:', error)
    return { cached: false, thumbsUpCount: 0 }
  }
}

export async function recordThumbsDown(params: {
  questionHash?: string; imageHash?: string; studentClass: number; subject: string
  type?: string; syllabusVersion: string; uid: string; isPhoto: boolean; answeredByModel: string
}): Promise<{ removed: boolean; flagCount: number }> {
  const { questionHash, imageHash, studentClass, subject, type, syllabusVersion, uid, isPhoto } = params
  try {
    let docRef: any
    if (isPhoto && imageHash) {
      docRef = adminDb.collection(`photos_${syllabusVersion}`).doc(imageHash)
    } else if (questionHash && type) {
      const collectionPath = buildCacheKey(studentClass, subject, type, syllabusVersion)
      docRef = adminDb.collection('cache').doc(collectionPath).collection('entries').doc(questionHash)
    } else return { removed: false, flagCount: 0 }
    const docSnap = await docRef.get()
    if (!docSnap.exists) return { removed: false, flagCount: 0 }
    const data = docSnap.data()!
    const newFlagCount = (data.flagCount || 0) + 1
    if (newFlagCount >= FLAG_THRESHOLD) {
      await docRef.update({ isActive: false, flagCount: newFlagCount, haiku_answer: null, haiku_answer_pending: null, sonnet_answer: null, removedAt: new Date(), removedReason: 'thumbs_down_threshold' })
      return { removed: true, flagCount: newFlagCount }
    }
    await docRef.update({ flagCount: newFlagCount, [`flaggedBy.${uid}`]: new Date() })
    return { removed: false, flagCount: newFlagCount }
  } catch (error) {
    console.error('recordThumbsDown error:', error)
    return { removed: false, flagCount: 0 }
  }
}

export async function flagCacheEntry(params: {
  questionHash: string; studentClass: number; subject: string; type: string; syllabusVersion: string; uid: string
}): Promise<{ removed: boolean; flagCount: number }> {
  return recordThumbsDown({ questionHash: params.questionHash, studentClass: params.studentClass, subject: params.subject, type: params.type, syllabusVersion: params.syllabusVersion, uid: params.uid, isPhoto: false, answeredByModel: 'cache' })
}