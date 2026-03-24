'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function VidyaAILogin() {
  const router = useRouter()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken()
        document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
        router.push('/vidyaai')
      } else {
        const provider = new GoogleAuthProvider()
        signInWithPopup(auth, provider)
          .then(async (result) => {
            const token = await result.user.getIdToken()
            document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
            router.push('/vidyaai')
          })
          .catch(() => router.push('/'))
      }
    })
    return () => unsub()
  }, [router])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: '#F7F3EE',
      fontFamily: 'sans-serif',
      fontSize: '1rem',
      color: '#D4591A',
      fontWeight: '700'
    }}>
      Opening Google Sign In...
    </div>
  )
}