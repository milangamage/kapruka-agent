import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import Dashboard from './Dashboard'
import './App.css'

const API_URL = 'http://localhost:8000/api/chat'

const WELCOME_MESSAGE = `Hello! I'm your Kapruka shopping assistant. I'm here to help you find the perfect product, check delivery to your city, and place your order — all in one conversation.

**Here's what I can do for you:**
- 🔍 Search thousands of products with live prices
- 🚚 Check delivery availability and costs to your city
- 🛒 Create your order and send you a secure pay link
- 📦 Track any existing order instantly

What would you like to shop for today?`

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TypingIndicator() {
  return (
    <div className="msg-row agent-row">
      <div className="msg-avatar agent-av">K</div>
      <div className="typing-pill">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'user-row' : 'agent-row'}`}>
      {!isUser && <div className="msg-avatar agent-av">K</div>}
      <div className="msg-col">
        <div className={`bubble ${isUser ? 'user-bubble' : 'agent-bubble'}`}>
          {isUser
            ? msg.content
            : <ReactMarkdown>{msg.content}</ReactMarkdown>
          }
        </div>
        <div className={`msg-meta ${isUser ? 'meta-right' : 'meta-left'}`}>
          {formatTime(msg.time)}
        </div>
      </div>
      {isUser && <div className="msg-avatar user-av">You</div>}
    </div>
  )
}

export default function App() {
  const [view,       setView]       = useState('chat')   // 'chat' | 'dashboard'
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [sessionId,  setSessionId]  = useState(null)
  const [isTyping,   setIsTyping]   = useState(false)
  const [error,      setError]      = useState(null)
  const bottomRef = useRef(null)
  const taRef     = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('kapruka_messages')
    const sid   = localStorage.getItem('kapruka_session_id')
    if (sid)   setSessionId(sid)
    if (saved) setMessages(JSON.parse(saved))
    else       setMessages([{ role: 'agent', content: WELCOME_MESSAGE, time: Date.now() }])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (messages.length) localStorage.setItem('kapruka_messages', JSON.stringify(messages))
    if (sessionId)       localStorage.setItem('kapruka_session_id', sessionId)
  }, [messages, sessionId])

  const resize = useCallback(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px'
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || isTyping) return
    setInput(''); setError(null)
    if (taRef.current) taRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { role: 'user', content: text, time: Date.now() }])
    setIsTyping(true)
    try {
      const { data } = await axios.post(API_URL, { message: text, session_id: sessionId })
      setSessionId(data.session_id)
      setMessages(prev => [...prev, { role: 'agent', content: data.reply, time: Date.now() }])
    } catch {
      setError('Unable to reach the server. Make sure the backend is running on port 8000.')
    } finally {
      setIsTyping(false)
      taRef.current?.focus()
    }
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const newChat = () => {
    localStorage.removeItem('kapruka_messages')
    localStorage.removeItem('kapruka_session_id')
    setSessionId(null); setError(null)
    setMessages([{ role: 'agent', content: WELCOME_MESSAGE, time: Date.now() }])
  }

  // Resume an old session from the dashboard
  const resumeSession = (sessionData) => {
    // Convert backend message format → frontend format
    const restored = sessionData.messages.map(m => ({
      role:    m.role,
      content: m.content,
      time:    new Date(m.time).getTime(),
    }))
    setMessages(restored)
    setSessionId(sessionData.session_id)
    localStorage.setItem('kapruka_messages', JSON.stringify(restored))
    localStorage.setItem('kapruka_session_id', sessionData.session_id)
    setError(null)
    setView('chat')   // Switch back to chat view
  }

  return (
    <div className="shell">

      {/* ── Header ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </div>
          <div>
            <div className="brand-name">Kapruka Assistant</div>
            <div className="brand-status">
              <span className="online-dot" />
              <span>Online · Ready to help</span>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          {/* View toggle */}
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'chat' ? 'toggle-active' : ''}`}
              onClick={() => setView('chat')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Chat
            </button>
            <button
              className={`toggle-btn ${view === 'dashboard' ? 'toggle-active' : ''}`}
              onClick={() => setView('dashboard')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              Dashboard
            </button>
          </div>

          {view === 'chat' && (
            <button className="new-btn" onClick={newChat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New chat
            </button>
          )}
        </div>
      </header>

      {/* ── Chat view ── */}
      {view === 'chat' && (
        <>
          <main className="feed">
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {isTyping && <TypingIndicator />}
            {error && (
              <div className="err-card">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </main>

          <footer className="composer">
            <div className="composer-inner">
              <textarea
                ref={taRef}
                className="composer-ta"
                value={input}
                onChange={e => { setInput(e.target.value); resize() }}
                onKeyDown={onKey}
                placeholder="Type your message… e.g. 'I want to send flowers to Colombo'"
                rows={1}
                disabled={isTyping}
              />
              <button className="send-btn" onClick={send} disabled={isTyping || !input.trim()}>
                {isTyping
                  ? <span className="spin" />
                  : <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                }
              </button>
            </div>
            <p className="hint">Enter to send &nbsp;·&nbsp; Shift + Enter for new line</p>
          </footer>
        </>
      )}

      {/* ── Dashboard view ── */}
      {view === 'dashboard' && <Dashboard onResume={resumeSession} />}

    </div>
  )
}
