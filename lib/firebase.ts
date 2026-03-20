import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "vidyaai-prod-c16c9.firebaseapp.com",
  projectId: "vidyaai-prod-c16c9",
  storageBucket: "vidyaai-prod-c16c9.appspot.com",
  messagingSenderId: "719783367509",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);