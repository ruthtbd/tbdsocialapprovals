'use client'

// Deprecated. Public token-based review was retired when we moved to per-approver
// logins — see /review for the new sign-in flow.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RetiredTokenReview() {
  const router = useRouter()
  useEffect(() => { router.replace('/review') }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center p-10 text-sm text-center" style={{ color: '#666' }}>
      <div>
        <p className="mb-2">This link has been retired.</p>
        <p>Redirecting you to the new sign-in page…</p>
      </div>
    </div>
  )
}
