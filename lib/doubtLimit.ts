import { adminDb } from '@/lib/firebaseAdmin'

// ─────────────────────────────────────────
// LIMITS — LOCKED
// ─────────────────────────────────────────

const FREE_PHOTO_LIMIT_9_10 = 8
const FREE_TEXT_LIMIT_9_10 = 12

const FREE_PHOTO_LIMIT_11_12 = 10
const FREE_TEXT_LIMIT_11_12 = 15

const BOOST_PHOTO_TOTAL = 50
const BOOST_TEXT_TOTAL = 100

const WARNING_PERCENTAGE = 0.8

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

export function getDailyLimits(studentClass: number): { photo: number; text: number; total: number } {
  if (studentClass === 9 || studentClass === 10) {
    return { photo: FREE_PHOTO_LIMIT_9_10, text: FREE_TEXT_LIMIT_9_10, total: FREE_PHOTO_LIMIT_9_10 + FREE_TEXT_LIMIT_9_10 }
  }
  return { photo: FREE_PHOTO_LIMIT_11_12, text: FREE_TEXT_LIMIT_11_12, total: FREE_PHOTO_LIMIT_11_12 + FREE_TEXT_LIMIT_11_12 }
}

function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function getWarningMessage(remaining: number, type: 'photo' | 'text'): string {
  return `Only ${remaining} ${type} doubt${remaining === 1 ? '' : 's'} left for today. Boost for just ₹79 — 50 photo + 100 text doubts! 🚀`
}

function getLimitMessage(studentClass: number, type: 'photo' | 'text'): string {
  if (type === 'photo') {
    const limit = studentClass === 9 || studentClass === 10 ? FREE_PHOTO_LIMIT_9_10 : FREE_PHOTO_LIMIT_11_12
    return `You have used all ${limit} photo doubts for today! 📷 You can still ask ${studentClass === 9 || studentClass === 10 ? FREE_TEXT_LIMIT_9_10 : FREE_TEXT_LIMIT_11_12} text doubts. Or boost for ₹79 — 50 photo + 100 text! 🚀`
  }
  const limit = studentClass === 9 || studentClass === 10 ? FREE_TEXT_LIMIT_9_10 : FREE_TEXT_LIMIT_11_12
  return `You have used all ${limit} text doubts for today! 🎯 Get 50 photo + 100 text doubts for just ₹79 — valid for 1 year! 🚀`
}

function getBoostMessage(reason: 'boost_exhausted' | 'boost_expired'): string {
  if (reason === 'boost_exhausted') return 'You have used all boost doubts! Get 50 photo + 100 text doubts for just ₹79. 🎯'
  return 'Your boost plan has expired. Get 50 photo + 100 text doubts for just ₹79 — valid for 1 year! 🔄'
}

// ─────────────────────────────────────────
// MAIN CHECK AND INCREMENT
// ─────────────────────────────────────────

export async function checkAndIncrement(
  uid: string,
  studentClass: number,
  isPhoto: boolean = false
): Promise<{
  allowed: boolean
  used: number
  limit: number
  usedPhoto: number
  usedText: number
  limitPhoto: number
  limitText: number
  isPaid: boolean
  warning: boolean
  warningMessage: string
  limitMessage: string
}> {
  const today = getTodayIST()
  const limits = getDailyLimits(studentClass)
  const now = new Date()
  const type = isPhoto ? 'photo' : 'text'

  const userRef = adminDb.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = userSnap.data() || {}

  // ── BOOST EXPIRED ──
  if (userData.plan === 'boost' && userData.boostExpiresAt?.toDate() < now) {
    await userRef.set({ plan: 'free' }, { merge: true })
    return {
      allowed: false, used: 0, limit: limits.total,
      usedPhoto: 0, usedText: 0, limitPhoto: limits.photo, limitText: limits.text,
      isPaid: false, warning: false, warningMessage: '',
      limitMessage: getBoostMessage('boost_expired')
    }
  }

  // ── BOOST EXHAUSTED ──
  const boostPhotoUsed = userData.boostPhotoUsed || 0
  const boostTextUsed = userData.boostTextUsed || 0
  if (userData.plan === 'boost') {
    if (isPhoto && boostPhotoUsed >= BOOST_PHOTO_TOTAL) {
      return {
        allowed: false, used: boostPhotoUsed + boostTextUsed, limit: BOOST_PHOTO_TOTAL + BOOST_TEXT_TOTAL,
        usedPhoto: boostPhotoUsed, usedText: boostTextUsed,
        limitPhoto: BOOST_PHOTO_TOTAL, limitText: BOOST_TEXT_TOTAL,
        isPaid: true, warning: false, warningMessage: '',
        limitMessage: `You have used all ${BOOST_PHOTO_TOTAL} boost photo doubts! You still have ${BOOST_TEXT_TOTAL - boostTextUsed} text doubts. 📝`
      }
    }
    if (!isPhoto && boostTextUsed >= BOOST_TEXT_TOTAL) {
      return {
        allowed: false, used: boostPhotoUsed + boostTextUsed, limit: BOOST_PHOTO_TOTAL + BOOST_TEXT_TOTAL,
        usedPhoto: boostPhotoUsed, usedText: boostTextUsed,
        limitPhoto: BOOST_PHOTO_TOTAL, limitText: BOOST_TEXT_TOTAL,
        isPaid: true, warning: false, warningMessage: '',
        limitMessage: getBoostMessage('boost_exhausted')
      }
    }
  }

  // ── ACTIVE BOOST ──
  const boostActive =
    userData.plan === 'boost' &&
    (boostPhotoUsed < BOOST_PHOTO_TOTAL || boostTextUsed < BOOST_TEXT_TOTAL) &&
    userData.boostExpiresAt?.toDate() > now

  if (boostActive) {
    const newPhotoUsed = isPhoto ? boostPhotoUsed + 1 : boostPhotoUsed
    const newTextUsed = !isPhoto ? boostTextUsed + 1 : boostTextUsed

    await userRef.set({
      boostPhotoUsed: newPhotoUsed,
      boostTextUsed: newTextUsed,
      lastActive: now,
      totalDoubts: (userData.totalDoubts || 0) + 1
    }, { merge: true })

    return {
      allowed: true,
      used: newPhotoUsed + newTextUsed,
      limit: BOOST_PHOTO_TOTAL + BOOST_TEXT_TOTAL,
      usedPhoto: newPhotoUsed,
      usedText: newTextUsed,
      limitPhoto: BOOST_PHOTO_TOTAL,
      limitText: BOOST_TEXT_TOTAL,
      isPaid: true,
      warning: false,
      warningMessage: '',
      limitMessage: ''
    }
  }

  // ── FREE TIER ──
  const usageRef = adminDb.collection('usage').doc(uid).collection('daily').doc(today)
  const usageSnap = await usageRef.get()
  const usageData = usageSnap.exists ? usageSnap.data()! : { photoCount: 0, textCount: 0 }

  const usedPhoto = usageData.photoCount || 0
  const usedText = usageData.textCount || 0

  // ── CHECK IF PHOTO LIMIT HIT BUT TEXT AVAILABLE ──
  // Unused photo doubts can convert to text doubts
  const effectivePhotoLimit = limits.photo
  const unusedPhotoDoubts = Math.max(0, effectivePhotoLimit - usedPhoto)
  const effectiveTextLimit = limits.text + unusedPhotoDoubts  // convert unused photos to text

  // Photo limit check
  if (isPhoto && usedPhoto >= limits.photo) {
    return {
      allowed: false,
      used: usedPhoto + usedText,
      limit: limits.total,
      usedPhoto, usedText,
      limitPhoto: limits.photo,
      limitText: limits.text,
      isPaid: false, warning: false, warningMessage: '',
      limitMessage: getLimitMessage(studentClass, 'photo')
    }
  }

  // Text limit check — includes converted unused photo doubts
  if (!isPhoto && usedText >= effectiveTextLimit) {
    return {
      allowed: false,
      used: usedPhoto + usedText,
      limit: limits.total,
      usedPhoto, usedText,
      limitPhoto: limits.photo,
      limitText: effectiveTextLimit,
      isPaid: false, warning: false, warningMessage: '',
      limitMessage: getLimitMessage(studentClass, 'text')
    }
  }

  // ── INCREMENT ──
  const newPhotoCount = isPhoto ? usedPhoto + 1 : usedPhoto
  const newTextCount = !isPhoto ? usedText + 1 : usedText

  await usageRef.set({
    photoCount: newPhotoCount,
    textCount: newTextCount,
    uid, date: today, lastUsed: now
  }, { merge: true })

  await userRef.set({
    totalDoubts: (userData.totalDoubts || 0) + 1,
    lastActive: now,
    studentClass,
    plan: userData.plan || 'free'
  }, { merge: true })

  // ── WARNING CHECK ──
  const currentTypeUsed = isPhoto ? newPhotoCount : newTextCount
  const currentTypeLimit = isPhoto ? limits.photo : effectiveTextLimit
  const warningThreshold = Math.floor(currentTypeLimit * WARNING_PERCENTAGE)
  const remaining = currentTypeLimit - currentTypeUsed
  const warning = currentTypeUsed >= warningThreshold

  return {
    allowed: true,
    used: newPhotoCount + newTextCount,
    limit: limits.total,
    usedPhoto: newPhotoCount,
    usedText: newTextCount,
    limitPhoto: limits.photo,
    limitText: effectiveTextLimit,
    isPaid: false,
    warning,
    warningMessage: warning ? getWarningMessage(remaining, type) : '',
    limitMessage: ''
  }
}

// ─────────────────────────────────────────
// GET TODAY'S USAGE
// ─────────────────────────────────────────

export async function getUsageToday(uid: string, studentClass: number): Promise<{
  used: number
  limit: number
  usedPhoto: number
  usedText: number
  limitPhoto: number
  limitText: number
  isPaid: boolean
  boostPhotoRemaining: number
  boostTextRemaining: number
}> {
  const today = getTodayIST()
  const limits = getDailyLimits(studentClass)
  const now = new Date()

  const userSnap = await adminDb.collection('users').doc(uid).get()
  const userData = userSnap.data() || {}

  const boostActive =
    userData.plan === 'boost' &&
    userData.boostExpiresAt?.toDate() > now

  if (boostActive) {
    const boostPhotoUsed = userData.boostPhotoUsed || 0
    const boostTextUsed = userData.boostTextUsed || 0
    return {
      used: boostPhotoUsed + boostTextUsed,
      limit: BOOST_PHOTO_TOTAL + BOOST_TEXT_TOTAL,
      usedPhoto: boostPhotoUsed,
      usedText: boostTextUsed,
      limitPhoto: BOOST_PHOTO_TOTAL,
      limitText: BOOST_TEXT_TOTAL,
      isPaid: true,
      boostPhotoRemaining: BOOST_PHOTO_TOTAL - boostPhotoUsed,
      boostTextRemaining: BOOST_TEXT_TOTAL - boostTextUsed
    }
  }

  const usageSnap = await adminDb.collection('usage').doc(uid).collection('daily').doc(today).get()
  const usageData = usageSnap.exists ? usageSnap.data()! : { photoCount: 0, textCount: 0 }
  const usedPhoto = usageData.photoCount || 0
  const usedText = usageData.textCount || 0
  const unusedPhotoDoubts = Math.max(0, limits.photo - usedPhoto)
  const effectiveTextLimit = limits.text + unusedPhotoDoubts

  return {
    used: usedPhoto + usedText,
    limit: limits.total,
    usedPhoto,
    usedText,
    limitPhoto: limits.photo,
    limitText: effectiveTextLimit,
    isPaid: false,
    boostPhotoRemaining: 0,
    boostTextRemaining: 0
  }
}