import { useState, useRef, createContext, useContext } from 'react'
import { jsPDF } from 'jspdf'
import './App.css'

// ---------------------------------------------------------------------------
// Static baseline terms — always available regardless of scan results
// ---------------------------------------------------------------------------
const STATIC_TERMS = {
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

const TermsContext = createContext(STATIC_TERMS)

function buildTermsMap(glossary = []) {
  const fromApi = Object.fromEntries(
    glossary.map(({ term, definition }) => [term.toLowerCase(), definition])
  )
  return { ...STATIC_TERMS, ...fromApi }
}

function buildPattern(terms) {
  const escaped = Object.keys(terms)
    .sort((a, b) => b.length - a.length)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(${escaped.join('|')})`, 'gi')
}

// ---------------------------------------------------------------------------
// Scan steps
// ---------------------------------------------------------------------------
const SCAN_STEPS = [
  'Querying certificate transparency logs...',
  'Enumerating subdomains...',
  'Analyzing attack surface with AI...',
  'Generating report...',
]

// Timestamps (ms) after scan start when each step activates
const STEP_DELAYS = [0, 3000, 8000, 15000]

// ---------------------------------------------------------------------------
// Risk colours — HIGH is solid/urgent, MEDIUM/LOW are bordered
// ---------------------------------------------------------------------------
const RISK_STYLES = {
  high:   { bg: '#dc2626',         border: '#dc2626', text: '#fff'     },
  medium: { bg: '#92400e',         border: '#d97706', text: '#fde68a'  },
  low:    { bg: 'transparent',     border: '#16a34a', text: '#4ade80'  },
}

function riskStyle(level) {
  return RISK_STYLES[level?.toLowerCase()] ?? RISK_STYLES.low
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
function Tooltip({ termKey, children }) {
  const terms = useContext(TermsContext)
  return (
    <span className="tooltip-wrapper">
      <span className="tooltip-term">{children}</span>
      <span className="tooltip-box">{terms[termKey]}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// HighlightedText
// ---------------------------------------------------------------------------
function HighlightedText({ text }) {
  const terms = useContext(TermsContext)
  const pattern = buildPattern(terms)
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const key = part.toLowerCase()
        return terms[key]
          ? <Tooltip key={i} termKey={key}>{part}</Tooltip>
          : <span key={i}>{part}</span>
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// SubdomainDisplay
// ---------------------------------------------------------------------------
function SubdomainDisplay({ subdomain }) {
  const terms = useContext(TermsContext)
  const parts = subdomain.split('.')
  return (
    <span className="subdomain-text">
      {parts.map((part, i) => {
        const key = part.toLowerCase()
        return (
          <span key={i}>
            {terms[key]
              ? <Tooltip termKey={key}>{part}</Tooltip>
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
  const s = riskStyle(level)
  return (
    <span
      className={`risk-badge${large ? ' risk-badge-large' : ''}`}
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {level?.toUpperCase()}
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
  const [scanStep, setScanStep] = useState(-1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const stepTimers = useRef([])

  function clearStepTimers() {
    stepTimers.current.forEach(id => clearTimeout(id))
    stepTimers.current = []
  }

  async function handleScan(e) {
    e.preventDefault()
    setLoading(true)
    setScanStep(0)
    setResult(null)
    setError(null)

    // Schedule step advances (step 0 is set immediately above)
    stepTimers.current = STEP_DELAYS.slice(1).map((delay, i) =>
      setTimeout(() => setScanStep(i + 1), delay)
    )

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
      clearStepTimers()
      setLoading(false)
      setScanStep(-1)
    }
  }

  const analysis = result?.analysis
  const mergedTerms = buildTermsMap(analysis?.glossary)

  function downloadPdf() {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 50
    const contentW = pageW - margin * 2
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    let y = 0

    function write(text, { fontSize = 11, bold = false, gap = 14 } = {}) {
      doc.setFontSize(fontSize)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(text, contentW)
      lines.forEach(line => {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += fontSize * 1.35
      })
      y += gap
    }

    function divider() {
      doc.setDrawColor(180)
      doc.line(margin, y, pageW - margin, y)
      y += 14
    }

    y = margin
    write('SurfaceMap Security Report', { fontSize: 20, bold: true, gap: 6 })
    write(`Domain: ${result.domain}`, { fontSize: 11, gap: 4 })
    write(`Date: ${dateStr}`, { fontSize: 11, gap: 4 })
    write(`Overall Risk: ${analysis.risk_level}`, { fontSize: 11, bold: true, gap: 16 })
    divider()

    write('Overview', { fontSize: 14, bold: true, gap: 8 })
    write(analysis.overview, { fontSize: 11, gap: 16 })
    divider()

    write('Notable Findings', { fontSize: 14, bold: true, gap: 10 })
    analysis.findings.forEach((f, i) => {
      write(`${i + 1}. ${f.subdomain}  [${f.risk}]`, { fontSize: 11, bold: true, gap: 4 })
      write(f.explanation, { fontSize: 10, gap: 12 })
    })
    divider()

    write('Recommendations', { fontSize: 14, bold: true, gap: 10 })
    analysis.recommendations.forEach((rec, i) => {
      write(`${i + 1}. ${rec}`, { fontSize: 11, gap: 8 })
    })
    divider()

    const totalPages = doc.internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(150)
      doc.text('Generated by SurfaceMap', margin, doc.internal.pageSize.getHeight() - 25)
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, doc.internal.pageSize.getHeight() - 25, { align: 'right' })
      doc.setTextColor(0)
    }

    doc.save(`surfacemap-${result.domain}-${Date.now()}.pdf`)
  }

  return (
    <>
      {/* ── Sticky top bar ── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <polygon points="16,2 30,9 30,23 16,30 2,23 2,9" fill="none" stroke="#00f5d4" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="5" fill="#00f5d4" fillOpacity="0.1" />
              <circle cx="16" cy="16" r="2" fill="#00f5d4" />
              <line x1="16" y1="11" x2="16" y2="7"  stroke="#00f5d4" strokeWidth="1.5" />
              <line x1="16" y1="21" x2="16" y2="25" stroke="#00f5d4" strokeWidth="1.5" />
              <line x1="11" y1="16" x2="7"  y2="16" stroke="#00f5d4" strokeWidth="1.5" />
              <line x1="21" y1="16" x2="25" y2="16" stroke="#00f5d4" strokeWidth="1.5" />
            </svg>
            <span className="topbar-name">SurfaceMap</span>
            {loading && <span className="pulse-dot" aria-label="Scanning" />}
          </div>
          <span className="topbar-tagline">Attack Surface Reconnaissance</span>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="main">
        <div className="container">

          {/* Scan hero */}
          <section className={`hero${result || error || loading ? ' hero-compact' : ''}`}>
            <form onSubmit={handleScan} className="scan-form">
              <div className="scan-input-wrap">
                <input
                  type="text"
                  placeholder="Enter a domain to scan — e.g. example.com"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" disabled={loading || !domain.trim()}>
                {loading ? 'Scanning…' : 'Scan'}
              </button>
            </form>

            {/* Multi-step loading indicator — lives inside hero so it's always visible */}
            {loading && (
              <div className="scan-steps">
                {SCAN_STEPS.map((label, i) => {
                  const state = i < scanStep ? 'done' : i === scanStep ? 'active' : 'pending'
                  console.log(`step ${i}: ${state} (scanStep=${scanStep})`)
                  return (
                    <div key={i} className={`scan-step scan-step--${state}`}>
                      <span className="scan-step__icon" aria-hidden="true">
                        {state === 'done'    && '✓'}
                        {state === 'active'  && <span className="step-pulse" />}
                        {state === 'pending' && '·'}
                      </span>
                      <span className="scan-step__label">{label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Error */}
          {error && <div className="error-box">{error}</div>}

          {/* Results */}
          {result && analysis && (
            <TermsContext.Provider value={mergedTerms}>
              <div className="results">

                {/* Results header row */}
                <div className="results-header">
                  <div className="results-header-left">
                    <RiskBadge level={analysis.risk_level} large />
                    <span className="results-domain">{result.domain}</span>
                  </div>
                  <button className="download-btn" onClick={downloadPdf}>
                    ↓ Download Report
                  </button>
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
                    <h2 className="section-title">Notable Findings <span className="section-count">({analysis.findings.length})</span></h2>
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

                {/* Subdomain list */}
                <section className="card">
                  <h2 className="section-title">All Subdomains <span className="section-count">({result.subdomains.length})</span></h2>
                  <ul className="subdomain-list">
                    {result.subdomains.map(s => (
                      <li key={s}><SubdomainDisplay subdomain={s} /></li>
                    ))}
                  </ul>
                </section>

              </div>
            </TermsContext.Provider>
          )}
        </div>
      </main>
    </>
  )
}
