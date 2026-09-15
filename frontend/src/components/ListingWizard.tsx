import React, { useState } from 'react'
import { Card, Button, Spinner } from './UI'
import { createLandListing, updateLandListing, uploadLandDocuments, submitListingForVerification, validateSurvey } from '../services/api'
import Tesseract from 'tesseract.js'
import { validateAadhaar } from '../utils/aadhaarValidator'

export default function ListingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const [listingId, setListingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [extractedAadhaar, setExtractedAadhaar] = useState('')

  // Step 2
  const [surveyNum, setSurveyNum] = useState('')
  const [state, setState] = useState('')
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [surveyValid, setSurveyValid] = useState<boolean | null>(null)

  // Step 3
  const [form, setForm] = useState({
    area_acres: '', soil_type: 'Red', water_source: 'Rainfed',
    suitable_crops: '', price_per_acre_per_season: '', contact_phone: ''
  })

  // Step 4
  const [docFile, setDocFile] = useState<File | null>(null)
  
  // Step 6
  const [verificationResult, setVerificationResult] = useState<any>(null)

  const handleNext = async () => {
    setError('')
    setLoading(true)
    try {
      if (step === 1) {
        if (!aadhaarFile) throw new Error('Please upload your Aadhaar card')
        if (!extractedAadhaar) {
          setIsScanning(true)
          try {
            const result = await Tesseract.recognize(aadhaarFile, 'eng')
            const text = result.data.text
            
            // Find all 12 digit numbers (potentially separated by spaces)
            // Aadhaar is often written as 1234 5678 9012 or 123456789012
            const possibleNumbers = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g)
            
            if (possibleNumbers && possibleNumbers.length > 0) {
              let foundValid = false;
              for (const num of possibleNumbers) {
                if (validateAadhaar(num)) {
                   setExtractedAadhaar('XXXX-XXXX-' + num.replace(/\s/g, '').slice(-4))
                   foundValid = true;
                   break;
                }
              }
              if (!foundValid) {
                  throw new Error("Found 12 digits, but it is not a mathematically valid Aadhaar number (Failed Checksum).")
              }
            } else {
              throw new Error("Could not find a 12-digit Aadhaar number in the image.")
            }
          } catch (e: any) {
              throw new Error("OCR Failed: " + (e.message || 'Unable to scan document'))
          } finally {
              setIsScanning(false)
              setLoading(false)
          }
          return
        }
        setStep(2)
      } else if (step === 2) {
        const val = await validateSurvey(surveyNum)
        if (!val.valid) throw new Error(val.message)
        
        const listing = await createLandListing({
          survey_number: surveyNum, state, district, village, status: 'draft',
          area_acres: 0, price_per_acre_per_season: 0
        })
        setListingId(listing.id)
        setStep(3)
      } else if (step === 3) {
        await updateLandListing(listingId!, {
          ...form,
          area_acres: Number(form.area_acres),
          price_per_acre_per_season: Number(form.price_per_acre_per_season),
          suitable_crops: form.suitable_crops.split(',').map(s => s.trim()).filter(Boolean)
        })
        setStep(4)
      } else if (step === 4) {
        if (docFile) {
          const fd = new FormData()
          fd.append('file', docFile)
          await uploadLandDocuments(listingId!, fd)
        }
        setStep(5)
      } else if (step === 5) {
        const res = await submitListingForVerification(listingId!)
        setVerificationResult(res)
        setStep(6)
      }
    } catch (e: any) {
      setError(e.message || e?.response?.data?.detail || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="mb-6 flex justify-between items-center text-sm">
        <div className="font-bold">Step {step} of 6</div>
        <div className="flex gap-1">
          {[1,2,3,4,5,6].map(s => <div key={s} className={`h-2 w-8 rounded ${s <= step ? 'bg-emerald-600' : 'bg-gray-200'}`} />)}
        </div>
      </div>
      
      {error && <div className="text-red-600 mb-4 text-sm bg-red-50 p-2 rounded">{error}</div>}

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Farmer Authorization (Aadhaar Scan)</h3>
          <p className="text-sm text-gray-600">Upload a photo of your Aadhaar card. Our system will extract the details automatically.</p>
          <div>
            <input type="file" accept="image/*" onChange={e => {
              if (e.target.files?.[0]) {
                setAadhaarFile(e.target.files[0])
                setExtractedAadhaar('')
              }
            }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 border p-2 rounded" />
          </div>
          {isScanning && (
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <Spinner /> <span>Scanning Aadhaar document...</span>
            </div>
          )}
          {extractedAadhaar && (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <p className="text-sm text-emerald-800 font-bold mb-1">Aadhaar Verified Successfully</p>
              <p className="text-xl tracking-widest font-mono text-gray-700">{extractedAadhaar}</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Land Identity</h3>
          <div><label className="block text-sm">Survey Number</label><input className="w-full border p-2 rounded" value={surveyNum} onChange={e=>setSurveyNum(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-sm">State</label><input className="w-full border p-2 rounded" value={state} onChange={e=>setState(e.target.value)} /></div>
            <div><label className="block text-sm">District</label><input className="w-full border p-2 rounded" value={district} onChange={e=>setDistrict(e.target.value)} /></div>
            <div><label className="block text-sm">Village</label><input className="w-full border p-2 rounded" value={village} onChange={e=>setVillage(e.target.value)} /></div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Land Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm">Area (Acres)</label><input type="number" className="w-full border p-2 rounded" value={form.area_acres} onChange={e=>setForm({...form, area_acres:e.target.value})} /></div>
            <div><label className="block text-sm">Price per season (₹)</label><input type="number" className="w-full border p-2 rounded" value={form.price_per_acre_per_season} onChange={e=>setForm({...form, price_per_acre_per_season:e.target.value})} /></div>
            <div>
              <label className="block text-sm">Soil Type</label>
              <select className="w-full border p-2 rounded" value={form.soil_type} onChange={e=>setForm({...form, soil_type:e.target.value})}>
                <option>Red</option><option>Black</option><option>Alluvial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Water Source</label>
              <select className="w-full border p-2 rounded" value={form.water_source} onChange={e=>setForm({...form, water_source:e.target.value})}>
                <option>Rainfed</option><option>Borewell</option><option>Canal</option>
              </select>
            </div>
          </div>
          <div><label className="block text-sm">Suitable Crops</label><input className="w-full border p-2 rounded" value={form.suitable_crops} onChange={e=>setForm({...form, suitable_crops:e.target.value})} /></div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Document Upload (Patta/Chitta)</h3>
          <div>
            <input type="file" accept=".pdf,image/*" className="w-full border p-2 rounded" onChange={e => setDocFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-gray-500 mt-1">Upload verified documents to lower your risk score.</p>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Review & Submit</h3>
          <div className="text-sm space-y-1 bg-gray-50 p-4 rounded border">
            <p><strong>Survey Number:</strong> {surveyNum}</p>
            <p><strong>Location:</strong> {village}, {district}, {state}</p>
            <p><strong>Area:</strong> {form.area_acres} acres</p>
            <p><strong>Price:</strong> ₹{form.price_per_acre_per_season}</p>
            <p><strong>Document Attached:</strong> {docFile ? 'Yes' : 'No'}</p>
          </div>
          <p className="text-xs text-gray-500">By submitting, you agree to our verification process.</p>
        </div>
      )}

      {step === 6 && verificationResult && (
        <div className="space-y-4 text-center py-4">
          <div className="text-4xl">{verificationResult.risk_level === 'LOW' ? '✅' : '⚠️'}</div>
          <h3 className="font-bold text-xl">Verification Complete</h3>
          <p className="text-gray-600">Risk Score: <strong>{verificationResult.risk_score}/100</strong> ({verificationResult.risk_level})</p>
          {verificationResult.risk_level === 'LOW' ? (
            <p className="text-sm text-emerald-600">Your land has been auto-verified and is now public.</p>
          ) : (
            <p className="text-sm text-amber-600">Your listing is under manual review.</p>
          )}
          <Button onClick={onComplete} className="mt-4">Go to My Land Listings</Button>
        </div>
      )}

      {step < 6 && (
        <div className="mt-6 flex justify-end gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(s=>s-1)} disabled={loading}>Back</Button>}
          <Button onClick={handleNext} disabled={loading || isScanning}>{(loading || isScanning) ? <Spinner /> : (step === 1 && !extractedAadhaar) ? 'Scan Document' : step === 5 ? 'Submit' : 'Continue'}</Button>
        </div>
      )}
    </Card>
  )
}
