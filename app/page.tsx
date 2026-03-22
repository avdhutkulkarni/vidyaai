'use client'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) router.push('/vidyaai')
    })
    return () => unsub()
  }, [router])

  async function handleLogin() {
    try {
      setLoading(true)
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      router.push('/vidyaai')
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:'100dvh',
      background:'#F7F3EE',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      fontFamily:'sans-serif',
      padding:'24px',
      maxWidth:'420px',
      margin:'0 auto'
    }}>
      <div style={{
        width:'88px',height:'88px',
        borderRadius:'24px',
        background:'linear-gradient(145deg,#F5976A,#F9B47A)',
        display:'flex',alignItems:'center',
        justifyContent:'center',
        fontSize:'40px',
        marginBottom:'16px',
        boxShadow:'0 8px 28px rgba(212,89,26,.2)'
      }}>📚</div>

      <h1 style={{
        fontSize:'2.6rem',fontWeight:'800',
        color:'#1A1A2E',marginBottom:'8px',
        letterSpacing:'-1.5px',lineHeight:'1'
      }}>
        Vidya<span style={{color:'#D4591A'}}>AI</span>
      </h1>

      <p style={{
        color:'#4A5568',fontWeight:'600',
        marginBottom:'8px',fontSize:'0.92rem'
      }}>
        Your 24/7 AI-powered study partner
      </p>

      <div style={{
        background:'rgba(212,89,26,.08)',
        border:'1px solid rgba(212,89,26,.16)',
        borderRadius:'20px',padding:'4px 13px',
        fontSize:'0.72rem',fontWeight:'800',
        color:'#B84A12',marginBottom:'32px'
      }}>
        🎓 Class IX · X · XI · XII
      </div>

      <div style={{
        width:'100%',background:'white',
        borderRadius:'22px',padding:'24px 22px',
        boxShadow:'0 4px 24px rgba(26,26,46,.07)',
        border:'1px solid rgba(26,26,46,.09)',
        marginBottom:'16px'
      }}>
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:'100%',display:'flex',
            alignItems:'center',justifyContent:'center',
            gap:'12px',background:'white',
            border:'1.5px solid #DADCE0',
            borderRadius:'12px',padding:'13px 20px',
            fontSize:'0.9rem',fontWeight:'700',
            color:'#1A1A2E',cursor:'pointer',
            boxShadow:'0 2px 8px rgba(26,26,46,.07)',
            marginBottom:'14px'
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p style={{
          textAlign:'center',fontSize:'0.72rem',
          color:'#9AA2B8',fontWeight:'600',margin:'0'
        }}>
          Start free · No credit card needed<br/>
          <strong style={{color:'#00875A'}}>
            First topic always free ✓
          </strong>
        </p>
      </div>

      <div style={{
        display:'grid',gridTemplateColumns:'1fr 1fr',
        gap:'9px',width:'100%',marginBottom:'16px'
      }}>
        {[
          ['🎯','Daily Mission','AI plans your study path'],
          ['🤖','Ask Doubts 24/7','Socratic AI — always ready'],
          ['🎬','Animations','Concepts come alive'],
          ['🧘','Chitta Sthir','Science-backed focus']
        ].map(([ico,title,sub])=>(
          <div key={title} style={{
            background:'white',
            border:'1px solid rgba(26,26,46,.09)',
            borderRadius:'15px',padding:'14px 12px',
            boxShadow:'0 2px 8px rgba(26,26,46,.07)'
          }}>
            <div style={{fontSize:'1.4rem',marginBottom:'5px'}}>{ico}</div>
            <div style={{fontSize:'0.75rem',fontWeight:'700',color:'#1A1A2E',marginBottom:'3px'}}>{title}</div>
            <div style={{fontSize:'0.6rem',color:'#4A5568',lineHeight:'1.45',fontWeight:'600'}}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{
        background:'rgba(0,135,90,.07)',
        border:'1px solid rgba(0,135,90,.14)',
        borderRadius:'20px',padding:'5px 14px',
        fontSize:'0.68rem',fontWeight:'800',
        color:'#00875A',marginBottom:'8px'
      }}>
        ✅ Maharashtra Board Aligned
      </div>

      <p style={{
        fontSize:'0.65rem',color:'#9AA2B8',
        fontWeight:'600',textAlign:'center'
      }}>
        Built by a teacher · For students of Maharashtra
      </p>
    </div>
  )
}