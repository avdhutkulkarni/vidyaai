'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, GoogleAuthProvider, User
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

type UserRecord = {
  uid: string
  displayName: string
  email: string
  studentClass: number | null
  plan: string
  status: string
  approved: boolean
  createdAt: string | null
  lastActive: string | null
  totalDoubts: number
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const C = {
  bg: '#0f0f0f', card: '#1a1a1a', card2: '#222',
  border: '#2a2a2a', t1: '#f0f0f0', t2: '#888',
  cyan: '#00d4ff', green: '#22c55e', red: '#ff4d6a', amber: '#f59e0b', pur: '#a78bfa',
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [users, setUsers] = useState<UserRecord[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)
  const [actionUid, setActionUid] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addingEmail, setAddingEmail] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const getToken = useCallback(async () => {
    if (!user) return null
    return user.getIdToken()
  }, [user])

  const fetchUsers = useCallback(async (filter: Tab) => {
    const token = await getToken()
    if (!token) return
    setDataLoading(true)
    try {
      const res = await fetch(`/api/admin/users?filter=${filter}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 403) { setIsAdmin(false); setDataLoading(false); return }
      const data = await res.json()
      setIsAdmin(true)
      setUsers(data.users || [])
      setPendingCount(data.pendingCount || 0)
    } catch { setIsAdmin(false) }
    setDataLoading(false)
  }, [getToken])

  useEffect(() => {
    // Handle redirect result first (mobile sign-in)
    getRedirectResult(auth).catch(() => {})
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (user) fetchUsers(tab)
  }, [user, tab, fetchUsers])

  const handleAddEmail = async () => {
    const email = addEmail.trim()
    if (!email || !email.includes('@')) { showToast('Enter a valid email.'); return }
    const token = await getToken()
    if (!token) return
    setAddingEmail(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_email', email })
      })
      const data = await res.json()
      showToast(data.message || data.error || '')
      setAddEmail('')
      fetchUsers(tab)
    } catch { showToast('Something went wrong.') }
    setAddingEmail(false)
  }

  const handleAction = async (uid: string, action: string) => {
    const token = await getToken()
    if (!token) return
    setActionUid(uid + action)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, uid })
      })
      const data = await res.json()
      showToast(data.message || data.error || '')
      fetchUsers(tab)
    } catch { showToast('Something went wrong.') }
    setActionUid(null)
  }

  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  const fmtActive = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso), now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return fmt(iso)
  }

  // ── LOADING ──
  if (authLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, color: C.t2, fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      Loading...
    </div>
  )

  // ── NOT SIGNED IN ──
  if (!user) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', gap: 20 }}>
      <div style={{ fontSize: 13, color: C.t2, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>VidyaAI</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.t1 }}>Admin Panel</div>
      <div style={{ fontSize: 13, color: C.t2 }}>Sign in with your admin Google account to continue</div>
      <button
        onClick={() => {
          const p = new GoogleAuthProvider()
          const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
          if (mobile) { signInWithRedirect(auth, p).catch(() => {}) }
          else { signInWithPopup(auth, p).catch(() => signInWithRedirect(auth, p).catch(() => {})) }
        }}
        style={{ marginTop: 8, padding: '13px 32px', background: C.cyan, color: '#000', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Sign in with Google
      </button>
    </div>
  )

  // ── NOT ADMIN ──
  if (isAdmin === false) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', gap: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.red }}>Not authorized</div>
      <div style={{ fontSize: 13, color: C.t2 }}>{user.email} is not an admin account.</div>
      <button onClick={() => signOut(auth)} style={{ padding: '9px 22px', background: C.card, color: C.t1, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
        Sign out
      </button>
    </div>
  )

  const tabBtn = (t: Tab, label: string, count?: number) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '9px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
        background: tab === t ? C.cyan : C.card2,
        color: tab === t ? '#000' : C.t2,
        fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ background: tab === t ? 'rgba(0,0,0,.2)' : C.red, color: tab === t ? '#000' : '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11 }}>
          {count}
        </span>
      )}
    </button>
  )

  const statusColor = (s: string) => s === 'approved' ? C.green : s === 'rejected' ? C.red : C.amber

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', color: C.t1 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${C.border}`, gap: 12, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          <span style={{ color: C.cyan }}>VidyaAI</span>
          <span style={{ color: C.t2, fontWeight: 400, marginLeft: 8, fontSize: 13 }}>Admin</span>
        </div>
        <div style={{ flex: 1 }} />
        {pendingCount > 0 && (
          <div style={{ background: C.red, color: '#fff', borderRadius: 20, padding: '3px 11px', fontSize: 12, fontWeight: 700 }}>
            {pendingCount} pending
          </div>
        )}
        <div style={{ fontSize: 12, color: C.t2 }}>{user.email}</div>
        <button
          onClick={() => signOut(auth)}
          style={{ padding: '6px 14px', background: C.card2, color: C.t2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
        >
          Sign out
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ background: C.green, color: '#000', padding: '10px 20px', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        {tabBtn('pending', 'Pending', pendingCount)}
        {tabBtn('approved', 'Approved')}
        {tabBtn('rejected', 'Rejected')}
        {tabBtn('all', 'All Users')}
      </div>

      {/* Add Student Email */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.t2, fontWeight: 600, whiteSpace: 'nowrap' }}>Add student email:</span>
        <input
          type="email"
          value={addEmail}
          onChange={e => setAddEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
          placeholder="student@gmail.com"
          style={{
            flex: 1, minWidth: 200, padding: '7px 12px', background: C.card2, color: C.t1,
            border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none'
          }}
        />
        <button
          onClick={handleAddEmail}
          disabled={addingEmail}
          style={{ padding: '7px 18px', background: C.cyan, color: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: addingEmail ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          {addingEmail ? 'Adding...' : '+ Add & Approve'}
        </button>
        <span style={{ fontSize: 11, color: C.t2 }}>Student gets instant access when they sign in with this email</span>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px', maxWidth: 900 }}>
        {dataLoading ? (
          <div style={{ color: C.t2, fontSize: 13, padding: '20px 0' }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ color: C.t2, fontSize: 13, padding: '20px 0' }}>
            {tab === 'pending' ? 'No pending approvals 🎉' : 'No users found.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => (
              <div key={u.uid} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
              }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: `${statusColor(u.status)}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: statusColor(u.status)
                }}>
                  {u.displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>

                {/* Name + email */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{u.email}</div>
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {u.studentClass && (
                    <span style={{ background: `${C.cyan}18`, color: C.cyan, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      Class {u.studentClass}
                    </span>
                  )}
                  <span style={{ background: u.plan === 'boost' ? `${C.pur}22` : `${C.t2}18`, color: u.plan === 'boost' ? C.pur : C.t2, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                    {u.plan === 'boost' ? '⚡ Boost' : 'Free'}
                  </span>
                  <span style={{ color: C.t2, fontSize: 11 }}>{u.totalDoubts} doubts</span>
                  <span style={{ color: C.t2, fontSize: 11 }}>Joined {fmt(u.createdAt)}</span>
                  <span style={{ color: C.t2, fontSize: 11 }}>Active {fmtActive(u.lastActive)}</span>
                </div>

                {/* Status pill */}
                <span style={{
                  borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                  background: `${statusColor(u.status)}18`, color: statusColor(u.status)
                }}>
                  {u.status}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {u.status === 'pending' && <>
                    <button
                      onClick={() => handleAction(u.uid, 'approve')}
                      disabled={!!actionUid}
                      style={{ padding: '6px 14px', background: C.green, color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionUid === u.uid + 'approve' ? 0.5 : 1 }}
                    >✓ Approve</button>
                    <button
                      onClick={() => handleAction(u.uid, 'reject')}
                      disabled={!!actionUid}
                      style={{ padding: '6px 14px', background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >✗ Reject</button>
                  </>}
                  {u.status === 'approved' && (
                    <button
                      onClick={() => handleAction(u.uid, 'revoke')}
                      disabled={!!actionUid}
                      style={{ padding: '6px 14px', background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >Revoke</button>
                  )}
                  {u.status === 'rejected' && (
                    <button
                      onClick={() => handleAction(u.uid, 'approve')}
                      disabled={!!actionUid}
                      style={{ padding: '6px 14px', background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >Re-approve</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
