import React, { useState } from 'react'
import { signContract } from '../services/api'
import { Spinner } from './UI'

export default function OtpSignModal({ contractId, role, onClose, onSuccess }: { contractId: number, role: 'Farmer' | 'Buyer', onClose: () => void, onSuccess: () => void }) {
  const [otp, setOtp] = useState('')
  const [authConfirmed, setAuthConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSign = async () => {
    if (!authConfirmed) { setError('You must confirm authorization'); return; }
    if (!otp) { setError('OTP is required'); return; }
    
    setLoading(true)
    setError('')
    try {
      await signContract(contractId, { otp, authorization_confirmed: authConfirmed })
      onSuccess()
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to sign contract')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-5 text-white shrink-0 bg-gradient-to-r from-emerald-600 to-teal-700">
          <div className="font-bold text-lg">✍️ Secure Contract Signing</div>
          <div className="text-sm opacity-90 mt-0.5">Role: {role}</div>
        </div>
        
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            You are about to cryptographically sign Contract #{contractId}. 
            A SHA-256 hash of the final terms will be recorded in the audit log.
          </p>
          
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
              <input type="checkbox" checked={authConfirmed} onChange={e => setAuthConfirmed(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <span>I confirm that I have reviewed the final terms and authorize this signature.</span>
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Enter Aadhaar OTP (Mock: 123456)</label>
            <input type="text" value={otp} onChange={e => setOtp(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-3 focus:border-emerald-500 focus:outline-none" placeholder="XXXXXX" maxLength={6} />
          </div>
        </div>
        
        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition">Cancel</button>
          <button onClick={handleSign} disabled={loading} className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50 min-w-[100px]">
            {loading ? <Spinner /> : 'Sign Contract'}
          </button>
        </div>
      </div>
    </div>
  )
}
