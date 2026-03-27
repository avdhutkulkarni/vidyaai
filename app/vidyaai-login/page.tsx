'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, GoogleAuthProvider, onAuthStateChanged
} from 'firebase/auth'
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

async function handleApproved(token: string, router: ReturnType<typeof useRouter>) {
  document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
  router.push('/vidyaai')
}

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

export default function VidyaAILogin() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Step 1: Check if returning from redirect sign-in
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const token = await result.user.getIdToken()
        const approved = await checkApproval(token)
        if (approved) {
          await handleApproved(token, router)
        } else {
          await signOut(auth)
          router.push('/?reason=pending')
        }
        return
      }

      // Step 2: Check if already signed in
      const unsub = onAuthStateChanged(auth, async (user) => {
        unsub()
        if (user) {
          const token = await user.getIdToken()
          const approved = await checkApproval(token)
          if (approved) {
            await handleApproved(token, router)
          } else {
            await signOut(auth)
            router.push('/?reason=pending')
          }
        } else {
          setLoading(false)
        }
      })
    }).catch(() => setLoading(false))
  }, [router])

  const handleSignIn = async () => {
    setLoading(true)
    setError('')
    const provider = new GoogleAuthProvider()
    try {
      if (isMobile()) {
        // Mobile: redirect flow (no popup)
        await signInWithRedirect(auth, provider)
      } else {
        // Desktop: popup flow
        const result = await signInWithPopup(auth, provider)
        const token = await result.user.getIdToken()
        const approved = await checkApproval(token)
        if (approved) {
          await handleApproved(token, router)
        } else {
          await signOut(auth)
          router.push('/?reason=pending')
        }
      }
    } catch {
      // Popup blocked on desktop — fall back to redirect
      try {
        await signInWithRedirect(auth, provider)
      } catch {
        setError('Sign in failed. Please try again.')
        setLoading(false)
      }
    }
  }

  const wrap: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: '#0f0f0f', fontFamily: 'system-ui, sans-serif', gap: 20, padding: 24
  }

  if (loading) return (
    <div style={wrap}>
      <div style={{ fontSize: 14, color: '#00d4ff', fontWeight: 700 }}>Signing in...</div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ fontSize: 13, color: '#00d4ff', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>VidyaAI</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#f0f0f0' }}>Welcome back!</div>
      <div style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Sign in with your Google account to continue</div>
      {error && <div style={{ fontSize: 12, color: '#ff4d6a' }}>{error}</div>}
      <button
        onClick={handleSignIn}
        style={{ marginTop: 8, padding: '13px 32px', background: '#00d4ff', color: '#000', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Sign in with Google
      </button>
    </div>
  )
}
