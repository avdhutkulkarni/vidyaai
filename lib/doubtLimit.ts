import { adminDb } from '@/lib/firebaseAdmin'

const FREE_LIMIT_CLASS_9_10 = 20
const FREE_LIMIT_CLASS_11_12 = 25
const BOOST_TOTAL = 200
const WARNING_PERCENTAGE = 0.8

export function getDailyLimit(studentClass: number): number {
  return studentClass === 9 || studentClass === 10
    ? FREE_LIMIT_CLASS_9_10
    : FREE_LIMIT_CLASS_11_12
}

function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function getWarningMessage(remaining: number): string {
  return `Only ${remaining} doubt${remaining === 1 ? '' : 's'} left for today. Boost your plan — 200 doubts for just ₹49! 🚀`
}

function getLimitMessage(studentClass: number): string {
  const limit = getDailyLimit(studentClass)
  return `You have used all ${limit} doubts for today! 🎯 Get 200 doubts for just ₹49 — valid for 1 year! 🚀`
}

function getBoostMessage(reason: 'boost_exhausted' | 'boost_expired'): string {
  if (reason === 'boost_exhausted') {
    return 'You have used all 200 boost doubts! Get 200 more doubts for just ₹49. 🎯'
  }
  return 'Your boost plan has expired. Get 200 doubts for just ₹49 — valid for 1 year! 🔄'
}

export async function checkAndIncrement(uid: string, studentClass: number): Promise<{
  allowed: boolean
  used: number
  limit: number
  isPaid: boolean
  warning: boolean
  warningMessage: string
  limitMessage: string
}> {
  const today = getTodayIST()
  const dailyLimit = getDailyLimit(studentClass)
  const now = new Date()

  const userRef = adminDb.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = userSnap.data() || {}

  // Check boost expired
  if (userData.plan === 'boost' && userData.boostExpiresAt?.toDate() < now) {
    await userRef.set({ plan: 'free' }, { merge: true })
    return {
      allowed: false,
      used: 0,
      limit: dailyLimit,
      isPaid: false,
      warning: false,
      warningMessage: '',
      limitMessage: getBoostMessage('boost_expired')
    }
  }

  // Check boost exhausted
  if (userData.plan === 'boost' && userData.boostDoubtsUsed >= BOOST_TOTAL) {
    return {
      allowed: false,
      used: userData.boostDoubtsUsed,
      limit: BOOST_TOTAL,
      isPaid: false,
      warning: false,
      warningMessage: '',
      limitMessage: getBoostMessage('boost_exhausted')
    }
  }

  // Active boost plan
  const boostActive =
    userData.plan === 'boost' &&
    userData.boostDoubtsUsed < BOOST_TOTAL &&
    userData.boostExpiresAt?.toDate() > now

  if (boostActive) {
    const boostUsed = (userData.boostDoubtsUsed || 0) + 1
    await userRef.set({
      boostDoubtsUsed: boostUsed,
      lastActive: now,
      totalDoubts: (userData.totalDoubts || 0) + 1
    }, { merge: true })

    return {
      allowed: true,
      used: boostUsed,
      limit: BOOST_TOTAL,
      isPaid: true,
      warning: false,
      warningMessage: '',
      limitMessage: ''
    }
  }

  // Free tier — check daily count
  const usageRef = adminDb
    .collection('usage')
    .doc(uid)
    .collection('daily')
    .doc(today)

  const usageSnap = await usageRef.get()
  const usedToday = usageSnap.exists ? (usageSnap.data()?.count || 0) : 0

  // Daily limit hit
  if (usedToday >= dailyLimit) {
    return {
      allowed: false,
      used: usedToday,
      limit: dailyLimit,
      isPaid: false,
      warning: false,
      warningMessage: '',
      limitMessage: getLimitMessage(studentClass)
    }
  }

  // Increment daily count
  const newCount = usedToday + 1
  await usageRef.set({
    count: newCount,
    uid,
    date: today,
    lastUsed: now
  }, { merge: true })

  // Update user record
  await userRef.set({
    totalDoubts: (userData.totalDoubts || 0) + 1,
    lastActive: now,
    studentClass,
    plan: userData.plan || 'free'
  }, { merge: true })

  // Warning check
  const warningThreshold = Math.floor(dailyLimit * WARNING_PERCENTAGE)
  const remaining = dailyLimit - newCount
  const warning = newCount >= warningThreshold

  return {
    allowed: true,
    used: newCount,
    limit: dailyLimit,
    isPaid: false,
    warning,
    warningMessage: warning ? getWarningMessage(remaining) : '',
    limitMessage: ''
  }
}

export async function getUsageToday(uid: string, studentClass: number): Promise<{
  used: number
  limit: number
  isPaid: boolean
  boostDoubtsUsed: number
  boostDoubtsRemaining: number
}> {
  const today = getTodayIST()
  const dailyLimit = getDailyLimit(studentClass)
  const now = new Date()

  const userSnap = await adminDb.collection('users').doc(uid).get()
  const userData = userSnap.data() || {}

  const boostActive =
    userData.plan === 'boost' &&
    userData.boostDoubtsUsed < BOOST_TOTAL &&
    userData.boostExpiresAt?.toDate() > now

  if (boostActive) {
    return {
      used: userData.boostDoubtsUsed || 0,
      limit: BOOST_TOTAL,
      isPaid: true,
      boostDoubtsUsed: userData.boostDoubtsUsed || 0,
      boostDoubtsRemaining: BOOST_TOTAL - (userData.boostDoubtsUsed || 0)
    }
  }

  const usageSnap = await adminDb
    .collection('usage')
    .doc(uid)
    .collection('daily')
    .doc(today)
    .get()

  const usedToday = usageSnap.exists ? (usageSnap.data()?.count || 0) : 0

  return {
    used: usedToday,
    limit: dailyLimit,
    isPaid: false,
    boostDoubtsUsed: 0,
    boostDoubtsRemaining: 0
  }
}