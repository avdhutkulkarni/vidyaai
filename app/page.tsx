'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
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

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const [showPending, setShowPending] = useState(false)

  useEffect(() => {
    if (reason === 'pending') { setShowPending(true); return }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const approved = await checkApproval(token)
        if (approved) {
          document.cookie = `vidyaai-auth=${token}; path=/; max-age=3600; SameSite=Lax`
          router.push('/vidyaai')
        } else {
          await signOut(auth)
          setShowPending(true)
        }
      } catch { /* ignore */ }
    })

    return () => unsub()
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
        Your teacher will approve you soon.
      </div>
      <button
        onClick={() => { setShowPending(false); window.history.replaceState({}, '', '/') }}
        style={{ marginTop: 8, padding: '10px 24px', background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}
      >
        Back to home
      </button>
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
