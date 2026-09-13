import React, { useState, useEffect } from 'react'
import { getHarvestMessages, sendHarvestMessage } from '../services/api'
import { useLanguage } from '../contexts/LanguageContext'

interface HarvestChatProps {
  harvestId: number;
  onClose: () => void;
}

export function HarvestChat({ harvestId, onClose }: HarvestChatProps) {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<any[]>([])
  const [messageText, setMessageText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let timer: number
    const loadMessages = async () => {
      try {
        const msgs = await getHarvestMessages(harvestId)
        setMessages(msgs)
      } catch (err: any) {
        setError(err.message)
      }
    }

    loadMessages()
    timer = window.setInterval(loadMessages, 5000)
    return () => window.clearInterval(timer)
  }, [harvestId])

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!messageText.trim()) return
    
    try {
      const message = await sendHarvestMessage(harvestId, messageText.trim())
      setMessages(prev => [...prev, message])
      setMessageText('')
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <section className="bg-white p-4 rounded-lg shadow mb-6 relative">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold">{t('messages.title')}</h2>
        <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900">
          {t('common.close')}
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto mb-3 p-2 bg-gray-50 rounded">
        {messages.length === 0 && <p className="text-gray-500 text-center py-4">{t('messages.startConversation')}</p>}
        {messages.map(message => (
          <div key={message.id} className={`p-2 rounded max-w-[80%] ${message.is_mine ? 'bg-green-100 ml-auto' : 'bg-white border mr-auto'}`}>
            <p className="text-xs text-gray-500">{message.sender_name}</p>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} className="flex gap-2">
        <input 
          value={messageText} 
          onChange={event => setMessageText(event.target.value)} 
          className="flex-1 border rounded p-2" 
          placeholder={t('messages.placeholder')}
        />
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium">
          {t('messages.send')}
        </button>
      </form>
    </section>
  )
}
