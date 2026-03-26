import admin from 'firebase-admin'

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

function getAdminAuth() {
  return getAdminApp().auth()
}

function getAdminDb() {
  return getAdminApp().firestore()
}

export const adminAuth = {
  verifyIdToken: (token: string) => getAdminAuth().verifyIdToken(token),
  getUser: (uid: string) => getAdminAuth().getUser(uid),
}

export const adminDb = {
  collection: (path: string) => getAdminDb().collection(path),
  doc: (path: string) => getAdminDb().doc(path),
  batch: () => getAdminDb().batch(),
  runTransaction: (fn: any) => getAdminDb().runTransaction(fn),
}

export default { getAdminApp, getAdminAuth, getAdminDb }