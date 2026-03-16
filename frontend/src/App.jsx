import { useState } from 'react'
import './App.css'

// ---------------------------------------------------------------------------
// Tooltip definitions
// ---------------------------------------------------------------------------
const TOOLTIP_TERMS = {
  qa:      'Quality Assurance environment — often has relaxed security controls compared to production',
  admin:   'Administrative interface — high value target for attackers seeking elevated access',
  git:     'Source code repository — exposure can leak proprietary code and secrets',
  staging: 'Pre-production environment — may contain real data with weaker protections',
  preprod: 'Pre-production environment — often mirrors production with less security oversight',
  corp:    'Internal corporate network subdomain — not intended for public access',
  jira:    'Project management tool — can expose internal roadmaps, vulnerabilities, and team structure',
  vpn:     'VPN endpoint — direct target for credential stuffing attacks',
  jenkins: 'CI/CD automation server — compromise gives attackers access to build pipelines',
  api:     'Application Programming Interface endpoint — may expose data or functionality without proper auth',
}

const RISK_COLORS = {
  high:   { bg: '#2d1515', border: '#dc2626', text: '#f87171' },
  medium: { bg: '#2d1a0a', border: '#d97706', text: '#fbbf24' },
  low:    { bg: '#0a2d15', border: '#16a34a', text: '#4ade80' },
}

function riskColors(level) {
  return RISK_COLORS[level?.toLowerCase()] ?? RISK_COLORS.low
}

// ---------------------------------------------------------------------------
// Tooltip — wraps a known term with a hover tooltip
// ---------------------------------------------------------------------------
function Tooltip({ term, children }) {
  return (
    <span className="tooltip-wrapper">
      <span className="tooltip-term">{children}</span>
      <span className="tooltip-box">{TOOLTIP_TERMS[term]}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// HighlightedText — scans prose for known terms and wraps them in Tooltip
// ---------------------------------------------------------------------------
function HighlightedText({ text }) {
  const terms = Object.keys(TOOLTIP_TERMS)
  const pattern = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase()
        return TOOLTIP_TERMS[lower]
          ? <Tooltip key={i} term={lower}>{part}</Tooltip>
          : <span key={i}>{part}</span>
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// SubdomainDisplay — renders a subdomain with tooltips on matching segments
// ---------------------------------------------------------------------------
function SubdomainDisplay({ subdomain }) {
  const parts = subdomain.split('.')
  return (
    <span className="subdomain-text">
      {parts.map((part, i) => {
        const lower = part.toLowerCase()
        return (
          <span key={i}>
            {TOOLTIP_TERMS[lower]
              ? <Tooltip term={lower}>{part}</Tooltip>
              : part}
            {i < parts.length - 1 && <span className="subdomain-dot">.</span>}
          </span>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// RiskBadge
// ---------------------------------------------------------------------------
function RiskBadge({ level, large = false }) {
  const c = riskColors(level)
  return (
    <span
      className={`risk-badge${large ? ' risk-badge-large' : ''}`}
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      {level}
    </span>
  )
}

// ---------------------------------------------------------------------------
// FindingCard
// ---------------------------------------------------------------------------
function FindingCard({ finding }) {
  return (
    <div className="finding-card">
      <div className="finding-header">
        <SubdomainDisplay subdomain={finding.subdomain} />
        <RiskBadge level={finding.risk} />
      </div>
      <p className="finding-explanation">
        <HighlightedText text={finding.explanation} />
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleScan(e) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('http://localhost:8000/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Something went wrong.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not reach the API. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const analysis = result?.analysis

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="logo-row">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <polygon points="16,2 30,9 30,23 16,30 2,23 2,9" fill="#0f1623" stroke="#4f86f7" strokeWidth="1.5" />
            <circle cx="16" cy="16" r="5" fill="#4f86f7" fillOpacity="0.15" />
            <circle cx="16" cy="16" r="2" fill="#4f86f7" />
            <line x1="16" y1="11" x2="16" y2="7"  stroke="#4f86f7" strokeWidth="1.5" />
            <line x1="16" y1="21" x2="16" y2="25" stroke="#4f86f7" strokeWidth="1.5" />
            <line x1="11" y1="16" x2="7"  y2="16" stroke="#4f86f7" strokeWidth="1.5" />
            <line x1="21" y1="16" x2="25" y2="16" stroke="#4f86f7" strokeWidth="1.5" />
          </svg>
          <h1>SurfaceMap</h1>
        </div>
        <p className="subtitle">AI-powered attack surface reconnaissance</p>
      </header>

      {/* Scan form */}
      <form onSubmit={handleScan} className="scan-form">
        <input
          type="text"
          placeholder="Enter a domain (e.g. example.com)"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          disabled={loading}
          required
        />
        <button type="submit" disabled={loading || !domain.trim()}>
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="loading">
          <div className="spinner" />
          <span>Enumerating subdomains and analyzing with AI — this may take a moment...</span>
        </div>
      )}

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* Results */}
      {result && analysis && (
        <div className="results">

          {/* Overall risk */}
          <div className="risk-header">
            <RiskBadge level={analysis.risk_level} large />
            <span className="risk-label">Overall Risk — {result.domain}</span>
          </div>

          {/* Overview */}
          <section className="card">
            <h2 className="section-title">Overview</h2>
            <p className="overview-text">
              <HighlightedText text={analysis.overview} />
            </p>
          </section>

          {/* Findings */}
          {analysis.findings.length > 0 && (
            <section className="card">
              <h2 className="section-title">Notable Findings ({analysis.findings.length})</h2>
              <div className="findings-list">
                {analysis.findings.map((f, i) => (
                  <FindingCard key={i} finding={f} />
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <section className="card">
              <h2 className="section-title">Recommendations</h2>
              <ol className="recommendations-list">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i}><HighlightedText text={rec} /></li>
                ))}
              </ol>
            </section>
          )}

          {/* Full subdomain list */}
          <section className="card">
            <h2 className="section-title">All Subdomains ({result.subdomains.length})</h2>
            <ul className="subdomain-list">
              {result.subdomains.map(s => (
                <li key={s}><SubdomainDisplay subdomain={s} /></li>
              ))}
            </ul>
          </section>

        </div>
      )}
    </div>
  )
}
