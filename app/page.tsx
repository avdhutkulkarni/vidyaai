'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  signOut, onAuthStateChanged, signInWithPopup,
  signInWithRedirect, getRedirectResult, GoogleAuthProvider, User
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

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const [showPending, setShowPending] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const handleApprovedUser = async (user: User) => {
    try {
      const token = await user.getIdToken()
      const approved = await checkApproval(token)
      if (approved) {
        document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
        router.push('/vidyaai')
      } else {
        await signOut(auth)
        setShowPending(true)
        setSigningIn(false)
      }
    } catch {
      setSigningIn(false)
    }
  }

  const triggerSignIn = async () => {
    setSigningIn(true)
    const provider = new GoogleAuthProvider()
    // Set a timeout so we never get stuck on "Signing you in..." forever
    const timeout = setTimeout(() => setSigningIn(false), 30000)
    try {
      const result = await signInWithPopup(auth, provider)
      clearTimeout(timeout)
      await handleApprovedUser(result.user)
    } catch (err: unknown) {
      clearTimeout(timeout)
      const code = (err as { code?: string })?.code || ''
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // Popup was blocked — fall back to redirect
        try { await signInWithRedirect(auth, provider) }
        catch { setSigningIn(false) }
      } else {
        setSigningIn(false)
      }
    }
  }

  useEffect(() => {
    if (reason === 'pending') { setShowPending(true); return }

    let handled = false

    const process = async (user: User) => {
      if (handled) return
      handled = true
      await handleApprovedUser(user)
    }

    // Handle redirect result (mobile sign-in returning from Google)
    getRedirectResult(auth)
      .then(r => { if (r?.user) { setSigningIn(true); process(r.user) } })
      .catch(() => {})

    // Handle already-signed-in session
    const unsub = onAuthStateChanged(auth, user => {
      if (user) process(user)
    })

    // Wire up the sign-in button inside the landing page iframe
    const interval = setInterval(() => {
      const btn = document.getElementById('google-signin-btn')
      if (btn) {
        clearInterval(interval)
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          triggerSignIn()
        })
      }
    }, 200)

    return () => { unsub(); clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, reason])

  if (showPending) return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: '#0f0f0f', fontFamily: 'system-ui, sans-serif', gap: 16, padding: 24, textAlign: 'center'
    }}>
      <div style={{ fontSize: 48 }}>🕐</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f0f0' }}>Waiting for Approval</div>
      <div style={{ fontSize: 14, color: '#888', maxWidth: 320, lineHeight: 1.7 }}>
        Your account is pending approval.<br />
        Your teacher will approve you soon.<br />
        Please check back in a little while.
      </div>
      <button
        onClick={() => { setShowPending(false); window.history.replaceState({}, '', '/') }}
        style={{ marginTop: 8, padding: '10px 24px', background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}
      >
        Back to home
      </button>
    </div>
  )

  if (signingIn) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: '#0f0f0f', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ fontSize: 14, color: '#00d4ff', fontWeight: 700 }}>Signing you in...</div>
    </div>
  )

  return (
    <iframe
      src="/vidyaai-landing-final.html"
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
    />
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}
