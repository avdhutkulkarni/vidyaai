'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // If already logged in — go to app
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) router.push('/vidyaai')
    })

    // Connect Google login button from landing page HTML
    const interval = setInterval(() => {
      const btn = document.getElementById('google-signin-btn')
      if (btn) {
        clearInterval(interval)
        btn.addEventListener('click', async (e) => {
          e.preventDefault()
          try {
            const provider = new GoogleAuthProvider()
            await signInWithPopup(auth, provider)
            router.push('/vidyaai')
          } catch (err) {
            console.error(err)
          }
        })
      }
    }, 500)

    return () => { unsub(); clearInterval(interval) }
  }, [router])

  return (
    <iframe
      src="/vidyaai-landing-final.html"
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%',
        height: '100%',
        border: 'none'
      }}
    />
  )
}