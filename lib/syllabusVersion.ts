import { adminDb } from '@/lib/firebaseAdmin'

// Default versions — change only when syllabus actually updates
const DEFAULT_VERSIONS: Record<string, string> = {
  class_9:  '2023',
  class_10: '2023',
  class_11: '2023',
  class_12: '2023',
}

// Cache in memory so we dont hit Firestore every request
let cachedVersions: Record<string, string> | null = null
let cacheLoadedAt: number | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // refresh every 1 hour

export async function getSyllabusVersion(studentClass: number): Promise<string> {
  const key = `class_${studentClass}`

  // Use memory cache if fresh
  const now = Date.now()
  if (cachedVersions && cacheLoadedAt && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return cachedVersions[key] || DEFAULT_VERSIONS[key] || '2023'
  }

  // Fetch from Firestore
  try {
    const snap = await adminDb
      .collection('cache')
      .doc('metadata')
      .collection('syllabus_versions')
      .doc('versions')
      .get()

    if (snap.exists) {
      cachedVersions = snap.data() as Record<string, string>
      cacheLoadedAt = now
      return cachedVersions[key] || DEFAULT_VERSIONS[key] || '2023'
    }

    // Firestore doc not found — create it with defaults
    await adminDb
      .collection('cache')
      .doc('metadata')
      .collection('syllabus_versions')
      .doc('versions')
      .set(DEFAULT_VERSIONS)

    cachedVersions = DEFAULT_VERSIONS
    cacheLoadedAt = now
    return DEFAULT_VERSIONS[key] || '2023'

  } catch (error) {
    console.error('syllabusVersion fetch error:', error)
    return DEFAULT_VERSIONS[key] || '2023'
  }
}

export async function updateSyllabusVersion(studentClass: number, newVersion: string): Promise<void> {
  const key = `class_${studentClass}`

  await adminDb
    .collection('cache')
    .doc('metadata')
    .collection('syllabus_versions')
    .doc('versions')
    .set({ [key]: newVersion }, { merge: true })

  // Clear memory cache so next request fetches fresh
  cachedVersions = null
  cacheLoadedAt = null
}

export async function getAllSyllabusVersions(): Promise<Record<string, string>> {
  try {
    const snap = await adminDb
      .collection('cache')
      .doc('metadata')
      .collection('syllabus_versions')
      .doc('versions')
      .get()

    if (snap.exists) {
      return snap.data() as Record<string, string>
    }
    return DEFAULT_VERSIONS

  } catch (error) {
    console.error('getAllSyllabusVersions error:', error)
    return DEFAULT_VERSIONS
  }
}