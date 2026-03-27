'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function VidyaAI() {
  const router = useRouter()
  const [src, setSrc] = useState<string | null>(null)
  const srcSetRef = useRef(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/')
        return
      }
      // Only set src ONCE — prevents multiple iframe reloads
      if (srcSetRef.current) return
      srcSetRef.current = true
      try {
        const token = await user.getIdToken(true) // force refresh
        const name = encodeURIComponent(user.displayName || 'Student')
        setSrc(`/app.html?token=${token}&name=${name}`)
      } catch {
        router.push('/')
      }
    })
    return () => unsub()
  }, [router])

  if (!src) return (
    <div style={{
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      height:'100vh',
      background:'#070B12',
      color:'#00D4FF',
      fontFamily:'sans-serif'
    }}>
      Loading VidyaAI...
    </div>
  )

  return (
    <iframe
      src={src}
      style={{
        position:'fixed',
        top:0,
        left:0,
        width:'100%',
        height:'100%',
        border:'none'
      }}
    />
  )
}