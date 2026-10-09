import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Play, Volume2, VolumeX, X, SkipForward } from 'lucide-react'

export function IntroVideoModal({ 
  isOpen, 
  onClose, 
  videoSrc = 'https://ruirnjqrsvckhtabfpop.supabase.co/storage/v1/object/public/intro%20video/Screen%20Recording%202026-10-08%20225925.mp4' 
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setProgress(0)
      setVideoEnded(false)
      setHasError(false)
      setIsPlaying(true)
    }
  }, [isOpen])

  if (!isOpen) return null

  function handleClose(skipped = false) {
    if (dontShowAgain || skipped) {
      localStorage.setItem('student_intro_watched', 'true')
    }
    onClose()
  }

  function togglePlay() {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  function toggleMute() {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  function handleTimeUpdate() {
    if (!videoRef.current) return
    const current = videoRef.current.currentTime
    const duration = videoRef.current.duration || 1
    setProgress((current / duration) * 100)
  }

  function handleEnded() {
    setVideoEnded(true)
    setIsPlaying(false)
    localStorage.setItem('student_intro_watched', 'true')
  }

  return (
    <div className="video-modal-overlay">
      <div className="video-modal-card">
        <header className="video-modal-header">
          <div>
            <span className="eyebrow">ACADEMIC ORIENTATION</span>
            <h2>University Competency & Credit System</h2>
          </div>
          <button 
            type="button" 
            className="video-icon-btn" 
            onClick={() => handleClose(true)}
            aria-label="Close introduction"
          >
            <X size={18} />
          </button>
        </header>

        <div className="video-player-container">
          {!hasError ? (
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              muted={isMuted}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onError={() => setHasError(true)}
              onClick={togglePlay}
            />
          ) : null}

          {/* Interactive Simulation / Fallback sequence if MP4 video file is not uploaded yet */}
          {hasError && (
            <InteractiveVideoSimulation onComplete={handleEnded} />
          )}

          {/* Video Player Controls Bar */}
          {!hasError && (
            <div className="video-controls-bar">
              <button type="button" className="video-icon-btn" onClick={togglePlay}>
                {isPlaying ? <span style={{ fontSize: '11px', fontWeight: 'bold' }}>⏸</span> : <Play size={14} />}
              </button>
              <button type="button" className="video-icon-btn" onClick={toggleMute}>
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <div className="video-progress-track">
                <div className="video-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <footer className="video-modal-footer">
          <label className="dont-show-checkbox">
            <input 
              type="checkbox" 
              checked={dontShowAgain} 
              onChange={(e) => setDontShowAgain(e.target.checked)} 
            />
            <span>Don't show introduction automatically again</span>
          </label>

          <div className="video-action-buttons">
            <button 
              type="button" 
              className="secondary-button compact" 
              onClick={() => handleClose(true)}
            >
              <SkipForward size={14} /> Skip Intro
            </button>
            <button 
              type="button" 
              className="primary-button compact" 
              onClick={() => handleClose(false)}
            >
              {videoEnded ? 'Continue to Dashboard' : 'Enter Dashboard'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/**
 * Built-in High-Fidelity Academic Video Presentation Engine
 * Renders the 8 professional scenes when student-intro.mp4 asset is omitted/pending.
 */
function InteractiveVideoSimulation({ onComplete }) {
  const [sceneIndex, setSceneIndex] = useState(0)

  const scenes = [
    {
      step: '01 / 08',
      title: 'Welcome to the Competency-Based Credit System',
      description: 'Your official university platform for evidence-grounded dynamic academic credits.',
      tag: 'UNIVERSITY PLATFORM'
    },
    {
      step: '02 / 08',
      title: 'Evidence-Grounded Performance Analysis',
      description: 'Understand your academic standing through rigorous multi-component evaluation.',
      tag: 'ACADEMIC INSIGHT'
    },
    {
      step: '03 / 08',
      title: 'Completed Courses & Reference Credits',
      description: 'Review official course histories, reference credits, and database records.',
      tag: 'CREDIT STANDING'
    },
    {
      step: '04 / 08',
      title: 'Four Component Weighted Evaluation',
      description: 'Theory (34%) + Practical (23%) + Hands-on (32%) + Project (11%).',
      tag: 'FOUR COMPONENTS'
    },
    {
      step: '05 / 08',
      title: 'Competency Classification Profile',
      description: 'Track your growth across Advanced, Proficient, and Basic competency tiers.',
      tag: 'COMPETENCY PROFILE'
    },
    {
      step: '06 / 08',
      title: 'Dynamic Credit Allocation Bands',
      description: 'Earn credits matched directly to same-course cohort percentile benchmarks.',
      tag: 'DYNAMIC CREDITS'
    },
    {
      step: '07 / 08',
      title: 'Authorized Faculty Curriculum Management',
      description: 'Faculty upload performance metrics and update course configurations securely.',
      tag: 'FACULTY WORKFLOW'
    },
    {
      step: '08 / 08',
      title: 'Understand • Analyze • Progress',
      description: 'Empowering students and faculty with transparent credit allocation math.',
      tag: 'ACADEMIC EXCELLENCE'
    }
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setSceneIndex((current) => {
        if (current >= scenes.length - 1) {
          clearInterval(timer)
          setTimeout(() => onComplete && onComplete(), 0)
          return current
        }
        return current + 1
      })
    }, 4000)
    return () => clearInterval(timer)
  }, [scenes.length, onComplete])

  const cur = scenes[sceneIndex]

  return (
    <div className="simulated-video-stage">
      <div className="sim-grid-pattern" />
      <div className="sim-scene-content">
        <span className="sim-scene-step">{cur.step} — {cur.tag}</span>
        <h3 className="sim-scene-title">{cur.title}</h3>
        <p className="sim-scene-desc">{cur.description}</p>
        
        {sceneIndex === 3 && (
          <div className="sim-component-badges">
            <span className="badge-item">Theory 34%</span>
            <span className="badge-item">Practical 23%</span>
            <span className="badge-item">Hands-on 32%</span>
            <span className="badge-item">Project 11%</span>
          </div>
        )}
      </div>

      <div className="sim-indicators">
        {scenes.map((_, idx) => (
          <div 
            key={idx} 
            className={`sim-dot ${idx === sceneIndex ? 'active' : idx < sceneIndex ? 'passed' : ''}`} 
          />
        ))}
      </div>
    </div>
  )
}
