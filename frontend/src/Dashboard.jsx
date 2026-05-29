import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'

const BASE = 'http://localhost:8000'

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return new Date(isoStr).toLocaleDateString()
}

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div className="db-stat-card">
      <div className="db-stat-icon" style={{ background: color + '18', color }}>
        {icon}
      </div>
      <div>
        <div className="db-stat-value">{value ?? '—'}</div>
        <div className="db-stat-label">{label}</div>
      </div>
    </div>
  )
}

// ── Conversation detail panel ──────────────────────────────────────────────────
function ConvDetail({ sessionId, onClose, onResume }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    axios.get(`${BASE}/api/sessions/${sessionId}`)
      .then(r => setData(r.data))
      .catch(console.error)
  }, [sessionId])

  if (!data) return (
    <div className="db-detail db-detail-loading">
      <div className="db-spin" />
    </div>
  )

  return (
    <div className="db-detail">
      <div className="db-detail-header">
        <div>
          <div className="db-detail-title">Session #{data.session_id.slice(0, 8)}</div>
          <div className="db-detail-meta">
            {data.message_count} messages · Started {timeAgo(data.created_at)}
          </div>
        </div>
        <div className="db-detail-actions">
          <button
            className="db-resume-btn"
            onClick={() => onResume(data)}
            title="Continue this conversation in Chat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Resume Chat
          </button>
          <button className="db-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="db-conv-feed">
        {data.messages.map((msg, i) => (
          <div key={i} className={`db-msg ${msg.role === 'user' ? 'db-msg-user' : 'db-msg-agent'}`}>
            <div className="db-msg-avatar">
              {msg.role === 'user' ? '👤' : 'K'}
            </div>
            <div className="db-msg-body">
              <div className="db-msg-bubble">
                {msg.role === 'agent'
                  ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                  : msg.content
                }
              </div>
              <div className="db-msg-time">{fmtTime(msg.time)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ onResume }) {
  const [stats,      setStats]      = useState(null)
  const [sessions,   setSessions]   = useState([])
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        axios.get(`${BASE}/api/stats`),
        axios.get(`${BASE}/api/sessions`),
      ])
      setStats(s.data)
      setSessions(l.data.sessions)
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)   // auto-refresh every 5 s
    return () => clearInterval(t)
  }, [load])

  const filtered = sessions.filter(s =>
    s.session_id.includes(search) ||
    s.last_message.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="db-shell">

      {/* ── Dashboard header ── */}
      <div className="db-header">
        <div>
          <h2 className="db-title">Internal Dashboard</h2>
          <p className="db-subtitle">
            Live view of all conversations
            {lastUpdate && <span> · Updated {timeAgo(lastUpdate.toISOString())}</span>}
          </p>
        </div>
        <button className="db-refresh-btn" onClick={load} title="Refresh now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="db-stats-row">
        <StatCard icon="💬" label="Active Sessions"   value={stats?.active_sessions}  color="#dc2626" />
        <StatCard icon="📨" label="Total Messages"    value={stats?.total_messages}   color="#7c3aed" />
        <StatCard icon="👤" label="User Messages"     value={stats?.user_messages}    color="#0284c7" />
        <StatCard icon="🔧" label="Tools Available"   value={stats?.tools_available}  color="#059669" />
      </div>

      {/* ── Main content ── */}
      <div className="db-content">

        {/* Session list */}
        <div className={`db-list-panel ${selected ? 'db-list-narrow' : ''}`}>
          <div className="db-search-wrap">
            <svg className="db-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="db-search"
              placeholder="Search sessions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="db-empty">
              <span>No sessions yet</span>
              <p>Conversations will appear here in real-time</p>
            </div>
          ) : (
            filtered.map(s => (
              <div
                key={s.session_id}
                className={`db-session-row ${selected === s.session_id ? 'db-session-active' : ''}`}
                onClick={() => setSelected(s.session_id === selected ? null : s.session_id)}
              >
                <div className="db-session-avatar">
                  {s.last_role === 'agent' ? 'K' : '👤'}
                </div>
                <div className="db-session-info">
                  <div className="db-session-id">
                    Session #{s.session_id.slice(0, 8)}
                    <span className="db-session-badge">{s.message_count} msgs</span>
                  </div>
                  <div className="db-session-preview">{s.last_message || 'No messages yet'}</div>
                  <div className="db-session-time">{timeAgo(s.last_active)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Conversation detail */}
        {selected && (
          <ConvDetail
            sessionId={selected}
            onClose={() => setSelected(null)}
            onResume={onResume}
          />
        )}
      </div>

    </div>
  )
}
