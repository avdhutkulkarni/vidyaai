'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

async function checkApproval(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/check', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    return data.approved === true
  } catch {
    return false
  }
}

export default function VidyaAILogin() {
  const router = useRouter()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken()
        const approved = await checkApproval(token)

        if (approved) {
          document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
          router.push('/vidyaai')
        } else {
          await signOut(auth)
          router.push('/?reason=pending')
        }
      } else {
        // Not logged in — trigger Google sign-in
        const provider = new GoogleAuthProvider()
        signInWithPopup(auth, provider).catch(() => router.push('/'))
      }
    })
    return () => unsub()
  }, [router])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: '#0f0f0f', fontFamily: 'sans-serif',
      fontSize: '1rem', color: '#00d4ff', fontWeight: '700'
    }}>
      Signing in...
    </div>
  )
}
