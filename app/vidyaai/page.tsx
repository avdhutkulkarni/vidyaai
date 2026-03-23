'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function VidyaAI() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/')
      } else {
        setReady(true)
      }
    })
    return () => unsub()
  }, [router])

  if (!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#070B12',color:'#00D4FF',fontFamily:'sans-serif'}}>
      Loading VidyaAI...
    </div>
  )

  return (
    <iframe src="/app.html" style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
  )
}