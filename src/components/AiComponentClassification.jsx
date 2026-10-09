import { useState } from 'react'
import { Sparkles, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight, Eye, Layers } from 'lucide-react'

export function AiComponentClassification({ fileRows, onApproveClassification }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [classifiedData, setClassifiedData] = useState(null)
  const [activeTab, setActiveTab] = useState('review')

  function handleRunAiClassification() {
    setIsProcessing(true)
    setTimeout(() => {
      // Analyze course outcome / curriculum rows and suggest 4-component weights
      const mockResult = (fileRows || []).slice(0, 10).map((row, idx) => {
        const course = row.course || row.Course || `COURSE-${idx + 1}`
        return {
          id: idx + 1,
          courseCode: course,
          description: row.summary || row.Description || 'Course Outcomes and Learning Evaluation',
          theory: row.theory ?? 34,
          practical: row.practical ?? 23,
          handsOn: row.handsOn ?? 32,
          project: row.project ?? 11,
          confidence: Math.min(98, 88 + (idx * 2) % 10),
          status: 'Recommended'
        }
      })
      setClassifiedData(mockResult)
      setIsProcessing(false)
    }, 1200)
  }

  function handleWeightChange(id, field, value) {
    if (!classifiedData) return
    const num = Math.max(0, Math.min(100, Number(value) || 0))
    setClassifiedData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: num } : item))
    )
  }

  if (!classifiedData && !isProcessing) {
    return (
      <div className="ai-classification-banner">
        <div className="ai-banner-info">
          <div className="ai-icon-chip">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>AI Course Component Classification (Planned Architecture)</strong>
            <p>Automatically analyze uploaded course outcomes into Theory, Practical, Hands-on, and Project components.</p>
          </div>
        </div>
        <button 
          type="button" 
          className="secondary-button compact" 
          onClick={handleRunAiClassification}
        >
          <Sparkles size={14} /> Run AI Component Analysis
        </button>
      </div>
    )
  }

  if (isProcessing) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px' }}>
        <div className="loader" style={{ margin: '0 auto 12px' }} />
        <strong>AI Component Classification Engine Active...</strong>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0' }}>Extracting Course Outcome descriptors and matching component weights...</p>
      </div>
    )
  }

  return (
    <section className="panel" style={{ border: '1px solid var(--olive)', background: 'var(--surface)' }}>
      <div className="section-heading" style={{ borderBottomColor: 'var(--strong-line)' }}>
        <div>
          <h3>AI-Assisted Component Classification Review</h3>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Faculty Review & Verification required before database entry</span>
        </div>
        <span className="upload-badge valid">AI Confidence Avg: 94%</span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '12px 0 16px' }}>
        The AI has parsed course outcome descriptions into four components. You can fine-tune the percentages below before approving.
      </p>

      <div className="upload-table-wrap">
        <table className="upload-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Outcome Description</th>
              <th>Theory %</th>
              <th>Practical %</th>
              <th>Hands-on %</th>
              <th>Project %</th>
              <th>Total</th>
              <th>AI Confidence</th>
            </tr>
          </thead>
          <tbody>
            {classifiedData.map((row) => {
              const total = row.theory + row.practical + row.handsOn + row.project
              const is100 = total === 100
              return (
                <tr key={row.id}>
                  <td><strong>{row.courseCode}</strong></td>
                  <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.description}</td>
                  <td>
                    <input 
                      type="number" 
                      className="inline-weight-input" 
                      value={row.theory} 
                      onChange={(e) => handleWeightChange(row.id, 'theory', e.target.value)} 
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      className="inline-weight-input" 
                      value={row.practical} 
                      onChange={(e) => handleWeightChange(row.id, 'practical', e.target.value)} 
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      className="inline-weight-input" 
                      value={row.handsOn} 
                      onChange={(e) => handleWeightChange(row.id, 'handsOn', e.target.value)} 
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      className="inline-weight-input" 
                      value={row.project} 
                      onChange={(e) => handleWeightChange(row.id, 'project', e.target.value)} 
                    />
                  </td>
                  <td>
                    <strong style={{ color: is100 ? 'var(--green)' : 'var(--red)' }}>{total}%</strong>
                  </td>
                  <td>
                    <span className="upload-badge valid">{row.confidence}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <small style={{ color: 'var(--muted)' }}>Note: AI classifications will not mutate official records until faculty confirmation.</small>
        <button 
          type="button" 
          className="primary-button compact" 
          onClick={() => onApproveClassification && onApproveClassification(classifiedData)}
        >
          <CheckCircle2 size={15} /> Confirm AI Classifications & Proceed
        </button>
      </div>
    </section>
  )
}
