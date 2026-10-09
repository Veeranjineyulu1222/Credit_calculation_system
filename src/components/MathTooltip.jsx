import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * Reusable MathTooltip Component
 * Uses React Portal to render directly onto document.body with fixed positioning,
 * ensuring immunity to parent overflow clipping and z-index stacking issues.
 */
export default function MathTooltip({
  title,
  studentInfo,
  formula,
  inputs = [],
  calculation,
  result,
  targetRect,
  visible,
  onClose
}) {
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (!targetRect || !visible) return;

    const width = 340;
    const padding = 12;
    const estimatedHeight = 220;

    // Calculate vertical position relative to viewport (position: fixed)
    let top = targetRect.bottom + 8;

    // If popover overflows bottom of viewport, position above target
    if (targetRect.bottom + estimatedHeight > window.innerHeight) {
      top = Math.max(12, targetRect.top - estimatedHeight - 8);
    }

    // Calculate horizontal position (centered under target)
    let left = targetRect.left + (targetRect.width / 2) - (width / 2);

    if (left + width > window.innerWidth - padding) {
      left = window.innerWidth - width - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 99999,
    });
  }, [targetRect, visible]);

  if (!visible || !targetRect) return null;

  const tooltipElement = (
    <div
      className="math-tooltip-container"
      style={{
        ...style,
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '14px 16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        fontSize: '12px',
        lineHeight: 1.4,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'none',
        transition: 'opacity 0.15s ease-in-out',
      }}
      role="tooltip"
      aria-live="polite"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '6px' }}>
        <div>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa', fontWeight: 700 }}>
            MATH INSPECTION
          </span>
          <h4 style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
            {title || 'Calculation Details'}
          </h4>
          {studentInfo && (
            <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px', color: '#cbd5e1' }}>
              {studentInfo}
            </div>
          )}
        </div>
      </div>

      {/* Formula Box */}
      {formula ? (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>
            Formula:
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '6px 10px',
            borderRadius: '4px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '11px',
            color: '#7dd3fc',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            {formula}
          </div>
        </div>
      ) : (
        <div style={{ fontStyle: 'italic', color: '#94a3b8', marginBottom: '8px' }}>
          Calculation details are unavailable.
        </div>
      )}

      {/* Actual Input Values */}
      {inputs && inputs.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>
            Actual Input Values:
          </div>
          <ul style={{ margin: 0, paddingLeft: '16px', listStyleType: 'disc' }}>
            {inputs.map((inp, idx) => (
              <li key={idx} style={{ marginBottom: '2px', fontSize: '11px', color: '#e2e8f0' }}>
                {typeof inp === 'string' ? (
                  inp
                ) : (
                  <span>
                    <strong>{inp.label}:</strong> {inp.value}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Substituted Calculation */}
      {calculation && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>
            Arithmetic Substitution:
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '5px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'Consolas, Monaco, monospace',
            color: '#f1f5f9'
          }}>
            {calculation}
          </div>
        </div>
      )}

      {/* Final Result */}
      {result !== undefined && result !== null && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '10px',
          paddingTop: '8px',
          borderTop: '1px dashed rgba(255,255,255,0.15)',
          fontWeight: 700
        }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Final Result:</span>
          <span style={{
            background: 'rgba(59, 130, 246, 0.25)',
            color: '#60a5fa',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            border: '1px solid rgba(59, 130, 246, 0.5)'
          }}>
            {result}
          </span>
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(tooltipElement, document.body);
}
