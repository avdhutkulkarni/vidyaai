'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, GoogleAuthProvider, onAuthStateChanged, User
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

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

export default function VidyaAILogin() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'ready' | 'signing'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let done = false

    const handleUser = async (user: User) => {
      if (done) return
      done = true
      setStatus('signing')
      try {
        const token = await user.getIdToken()
        const approved = await checkApproval(token)
        if (approved) {
          document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
          router.push('/vidyaai')
        } else {
          await signOut(auth)
          router.push('/?reason=pending')
        }
      } catch {
        done = false
        setStatus('ready')
        setError('Something went wrong. Please try again.')
      }
    }

    // Run both in parallel — whichever fires first wins
    getRedirectResult(auth)
      .then(r => { if (r?.user) handleUser(r.user) })
      .catch(() => {})

    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        handleUser(user)
      } else {
        setStatus('ready')
      }
    })

    return () => unsub()
  }, [router])

  const handleSignIn = async () => {
    setStatus('signing')
    setError('')
    const provider = new GoogleAuthProvider()
    try {
      if (isMobile()) {
        await signInWithRedirect(auth, provider)
        // Page will redirect — no code runs after this
      } else {
        const result = await signInWithPopup(auth, provider)
        const token = await result.user.getIdToken()
        const approved = await checkApproval(token)
        if (approved) {
          document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
          router.push('/vidyaai')
        } else {
          await signOut(auth)
          router.push('/?reason=pending')
        }
      }
    } catch {
      // Popup blocked — fall back to redirect
      try {
        await signInWithRedirect(auth, new GoogleAuthProvider())
      } catch {
        setStatus('ready')
        setError('Sign in failed. Please try again.')
      }
    }
  }

  const wrap: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', position: 'fixed', top: 0, left: 0,
    width: '100%', height: '100%', background: '#0f0f0f',
    fontFamily: 'system-ui, sans-serif', gap: 20, padding: 24
  }

  if (status === 'loading' || status === 'signing') return (
    <div style={wrap}>
      <div style={{ fontSize: 14, color: '#00d4ff', fontWeight: 700 }}>
        {status === 'signing' ? 'Signing you in...' : 'Loading...'}
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ fontSize: 13, color: '#00d4ff', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>VidyaAI</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#f0f0f0' }}>Welcome!</div>
      <div style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Sign in with your Google account</div>
      {error && <div style={{ fontSize: 12, color: '#ff4d6a', textAlign: 'center' }}>{error}</div>}
      <button
        onClick={handleSignIn}
        style={{
          marginTop: 8, padding: '13px 32px', background: '#00d4ff',
          color: '#000', border: 'none', borderRadius: 12, fontSize: 14,
          fontWeight: 700, cursor: 'pointer'
        }}
      >
        Sign in with Google
      </button>
    </div>
  )
}
