'use client'
import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setChecking(true)
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
        setChecking(false)
      }
    })
    return () => unsub()
  }, [router])

  const handleSignIn = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      // onAuthStateChanged will handle redirect
    } catch {
      setLoading(false)
    }
  }

  const s: Record<string, React.CSSProperties> = {
    wrap: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: '#0f0f0f', fontFamily: 'system-ui, sans-serif', gap: 20
    },
    logo: { fontSize: 13, color: '#00d4ff', letterSpacing: 2, textTransform: 'uppercase' as const, fontWeight: 700 },
    title: { fontSize: 26, fontWeight: 800, color: '#f0f0f0' },
    sub: { fontSize: 13, color: '#888' },
    btn: {
      marginTop: 8, padding: '13px 32px', background: '#00d4ff', color: '#000',
      border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
      opacity: loading ? 0.6 : 1
    }
  }

  if (checking && !loading) return (
    <div style={{ ...s.wrap }}>
      <div style={{ fontSize: 14, color: '#00d4ff', fontWeight: 700 }}>Signing in...</div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.logo}>VidyaAI</div>
      <div style={s.title}>Welcome back!</div>
      <div style={s.sub}>Sign in with your Google account to continue</div>
      <button onClick={handleSignIn} disabled={loading} style={s.btn}>
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>
    </div>
  )
}
