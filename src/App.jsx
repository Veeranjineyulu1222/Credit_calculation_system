import { useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ChartNoAxesCombined, ChevronRight, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, MessageCircle, RotateCcw, Search, Send, ShieldAlert, SlidersHorizontal, UserRound, Users, X, Eye, EyeOff, Sparkles, Play } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { getStudent, getStudentRecord, getStudents } from './services/studentService'
import { getCourses } from './services/courseService'
import { getCreditPolicies, getCreditPoliciesWithBands } from './services/creditPolicyService'
import { getCreditBands } from './services/creditBandService'
import { getCompetencyAnalyses } from './services/analysisService'
import { getCourseOutcomes, getAllCourseOutcomes } from './services/courseOutcomeService'
import { askCompetencyInsight, getCompetencyConversations } from './services/aiService'
import { normalizeRegisterNumber, universityEmail, validateStudentRegistration } from './services/authService'
import { supabase } from './lib/supabase'
import { parseUploadFile, validateCourseConfigurationUpload, validatePerformanceUpload, calculateAcademicPerformanceBatch } from './lib/importer'
import { fetchPerformanceImportContext, savePerformanceImportBatch } from './services/analysisService'
import { IntroVideoModal } from './components/IntroVideoModal'
import { AiComponentClassification } from './components/AiComponentClassification'
import MathTooltip from './components/MathTooltip'

const studentNav = [
  ['Overview', '/student', LayoutDashboard], ['My Profile', '/student/profile', UserRound], ['My Courses', '/student/courses', BookOpen], ['My Competency', '/student/competency', ChartNoAxesCombined], ['AI Insights', '/student/ai-insights', MessageCircle], ['Course Information', '/courses', BookOpen], ['Credit Allocation Bands', '/credit-bands', SlidersHorizontal], ['Methodology', '/methodology', FileText],
]
const facultyNav = [
  ['Overview', '/faculty', LayoutDashboard], ['Students', '/faculty/students', Users], ['Courses', '/faculty/courses', BookOpen], ['Course Configurations', '/faculty/course-configuration', ClipboardList], ['Performance Upload', '/faculty/performance-upload', ChartNoAxesCombined], ['Credit Policy', '/faculty/policies', FileText], ['Credit Allocation Bands', '/credit-bands', SlidersHorizontal], ['Course Outcomes', '/faculty/outcomes', ClipboardList], ['Cohort Analytics', '/faculty/analytics', ChartNoAxesCombined], ['RAG Assistant', '/faculty/rag', MessageCircle], ['Methodology', '/methodology', FileText],
]

function ProtectedRoute({ children, role }) {
  const auth = useAuth()
  if (auth.loading) return <Loading message="Restoring your session..." />
  if (!auth.user) return <Navigate to="/login" replace />
  if (!auth.role) return <ProfilePending />
  if (role && auth.role !== role) return <Unauthorized />
  return children
}

function AppLayout() {
  const auth = useAuth(); const location = useLocation(); const navigate = useNavigate(); const [open, setOpen] = useState(false)
  const isFaculty = auth.role === 'faculty'; const nav = isFaculty ? facultyNav : studentNav
  const title = location.pathname === '/student' || location.pathname === '/faculty' ? 'Overview' : nav.find((item) => location.pathname.startsWith(item[1]))?.[0] ?? 'Academic System'
  return <div className="app-shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="brand-mark"><GraduationCap size={20} /></div>
        <div><strong>Competency-Based</strong><span>Credit System</span></div>
        <button className="icon-button mobile-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <div className="role-label">{isFaculty ? 'Faculty workspace' : 'Student workspace'}</div>
      <nav aria-label="Primary navigation">{nav.map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === '/student' || path === '/faculty'} onClick={() => setOpen(false)}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="identity"><div className="avatar">{(auth.user?.email?.[0] ?? 'U').toUpperCase()}</div><div><strong>{auth.user?.email?.split('@')[0]}</strong><span>{auth.role}</span></div></div><button className="signout" onClick={async () => { await auth.signOut(); navigate('/login') }}><LogOut size={16} /> Sign out</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div><p className="eyebrow">UNIVERSITY PLATFORM / {isFaculty ? 'FACULTY' : 'STUDENT'}</p><h1>{title}</h1></div><div className="topbar-meta"><span className="status-dot" /> Authenticated session</div></header><div className="page-content"><Outlet /></div></main>
    {isFaculty ? (
      <button 
        type="button" 
        className="secondary-button" 
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 20,
          background: 'var(--surface)',
          borderColor: 'var(--strong-line)',
          boxShadow: '0 4px 12px rgba(36,36,33,.12)',
          padding: '10px 16px',
          borderRadius: '0px'
        }}
        onClick={() => navigate('/faculty/rag')}
      >
        <MessageCircle size={16} />
        <span>RAG Assistant</span>
      </button>
    ) : (
      <ChatbotWidget />
    )}
  </div>
}

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [sources, setSources] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  async function ask(questionToAsk = question) {
    const trimmedQuestion = questionToAsk.trim()
    if (!trimmedQuestion || status === 'loading') return
    setQuestion(trimmedQuestion)
    setStatus('loading')
    setError('')
    const history = messages.slice(-6)
    const result = await askCompetencyInsight(trimmedQuestion, history, conversationId)
    if (result.error) {
      setError(result.error.message)
      setStatus('error')
      return
    }
    setConversationId(result.data.conversation_id ?? conversationId)
    setSources(result.data.evidence ?? [])
    setMessages([...history, { role: 'user', content: trimmedQuestion }, { role: 'assistant', content: result.data.answer }].slice(-8))
    setQuestion('')
    setStatus('ready')
  }

  function reset() {
    setQuestion('')
    setMessages([])
    setConversationId(null)
    setSources([])
    setError('')
    setStatus('idle')
  }

  return <div className={isOpen ? 'chatbot-widget open' : 'chatbot-widget'}>
    {isOpen && <section className="chatbot-panel" aria-label="Academic assistant">
      <header className="chatbot-header"><div><p className="eyebrow">ACADEMIC RAG</p><strong>Ask Academic Assistant</strong></div><div className="chatbot-header-actions"><button type="button" className="chatbot-text-button" onClick={reset}>New</button><button type="button" className="chatbot-close" onClick={() => setIsOpen(false)} aria-label="Close chatbot"><X size={17} /></button></div></header>
      <div className="chatbot-messages">{messages.length === 0 ? <div className="chatbot-empty"><MessageCircle size={22} /><strong>Ask about your academic evidence</strong><span>Questions are answered from your authorized competency and academic data.</span></div> : messages.map((message, index) => <div className={`chatbot-message ${message.role}`} key={`${message.role}-${index}`}><small>{message.role === 'user' ? 'You' : 'Academic Assistant'}</small><p>{message.content}</p></div>)}{status === 'loading' && <div className="chatbot-loading">Retrieving verified academic context...</div>}</div>
      {sources.length > 0 && <div className="chatbot-sources"><strong>Sources used</strong>{sources.slice(0, 4).map((source, index) => <span key={`${source.course_code ?? source.type}-${index}`}>{source.course_code ?? 'Academic source'}{source.course_name ? ` — ${source.course_name}` : ''}{source.grade ? ` — ${source.grade}` : ''}</span>)}</div>}
      {error && <p className="chatbot-error">{error}</p>}
      <div className="chatbot-suggestions">{['What are my strongest competency areas?', 'Which courses support my programming competency?', 'What should I improve?'].map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
      <div className="chatbot-input"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask() }} placeholder="Ask a question..." aria-label="Ask assistant" /><button type="button" onClick={() => ask()} disabled={status === 'loading' || !question.trim()} aria-label="Send question"><Send size={16} /></button></div>
    </section>}
    <button type="button" className="chatbot-launcher" onClick={() => setIsOpen((current) => !current)} aria-label={isOpen ? 'Close academic assistant' : 'Open academic assistant'}><MessageCircle size={22} /><span>{isOpen ? 'Close' : 'Academic Assistant'}</span></button>
  </div>
}

function Login() {
  const auth = useAuth(); const navigate = useNavigate(); const [mode, setMode] = useState('signIn'); const [registerNumber, setRegisterNumber] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  if (auth.loading) return <Loading message="Connecting to University Auth Service..." />
  if (auth.user) return <Navigate to={auth.role === 'faculty' ? '/faculty' : '/student'} replace />

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      if (mode === 'signIn') {
        await auth.signIn(email.trim(), password)
        navigate('/')
        return
      }

      const normalizedRegisterNumber = normalizeRegisterNumber(registerNumber)
      const normalizedEmail = (email || universityEmail(normalizedRegisterNumber)).trim().toLowerCase()

      if (!normalizedRegisterNumber || !/^\d+$/.test(normalizedRegisterNumber)) {
        throw new Error('Register number must contain only digits.')
      }

      if (!normalizedEmail || !normalizedEmail.endsWith('@klu.ac.in')) {
        throw new Error('Use a valid university email in the format registernumber@klu.ac.in.')
      }

      if (normalizedEmail !== universityEmail(normalizedRegisterNumber).toLowerCase()) {
        throw new Error('The university email must match the register number.')
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long.')
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }

      const { data: validStudent, error: studentValidationError } = await validateStudentRegistration(normalizedRegisterNumber)
      if (studentValidationError) throw studentValidationError
      if (!validStudent) {
        throw new Error('Register number not found. Please contact the university administrator.')
      }

      const result = await auth.signUp(normalizedRegisterNumber, password)
      if (result.session) {
        navigate('/')
      } else {
        setMessage(`Registration successful for ${universityEmail(normalizedRegisterNumber)}. Please verify your email before signing in.`)
      }
    } catch (problem) {
      setError(problem.message || `Unable to ${mode === 'signIn' ? 'sign in' : 'create your account'}.`)
    } finally {
      setBusy(false)
    }
  }

  function switchMode(nextMode) { setMode(nextMode); setError(''); setMessage('') }
  const isSignIn = mode === 'signIn'
  const autoEmail = registerNumber ? universityEmail(registerNumber) : ''

  return (
    <main className="login-layout-wrapper">
      {/* LEFT SIDE: Professional Academic Showcase */}
      <div className="login-brand-side">
        <div className="login-brand-header">
          <div className="brand-mark-lg">
            <GraduationCap size={26} />
          </div>
          <div>
            <strong>University Competency</strong>
            <span>Credit System</span>
          </div>
        </div>

        <div className="login-showcase-copy">
          <span className="eyebrow-accent">AUTHORIZED ACADEMIC PLATFORM</span>
          <h1>Evidence-Grounded Credit Allocation</h1>
          <p>Automated competency scoring, percentile benchmarking, and multi-component dynamic academic credit determination.</p>
        </div>

        {/* Abstract Floating Academic Cards */}
        <div className="academic-feature-cards">
          <div className="feature-card float-1">
            <div className="feature-icon"><Sparkles size={16} /></div>
            <div>
              <strong>Competency Engine</strong>
              <span>Weighted component evaluation</span>
            </div>
          </div>

          <div className="feature-card float-2">
            <div className="feature-icon"><SlidersHorizontal size={16} /></div>
            <div>
              <strong>Dynamic Credits</strong>
              <span>Cohort percentile band matching</span>
            </div>
          </div>

          <div className="feature-card float-3">
            <div className="feature-icon"><FileText size={16} /></div>
            <div>
              <strong>Course Outcomes</strong>
              <span>4-Component (T / P / H / P) analysis</span>
            </div>
          </div>
        </div>

        <footer className="login-showcase-footer">
          <span>Official University Academic Software</span>
          <span>•</span>
          <span>Supabase PostgreSQL + RLS Secure</span>
        </footer>
      </div>

      {/* RIGHT SIDE: Clean Premium Authentication Form */}
      <div className="login-form-side">
        <section className="login-card-container">
          <div className="login-copy">
            <p className="eyebrow">UNIVERSITY AUTHENTICATION</p>
            <h2>{isSignIn ? 'Sign in to Academic Portal' : 'Register Student Access'}</h2>
            <p>{isSignIn ? 'Enter your official university credentials to access your dashboard.' : 'Enter your register number and email to set up your account.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication options">
            <button className={isSignIn ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('signIn')} type="button" role="tab" aria-selected={isSignIn}>Sign in</button>
            <button className={!isSignIn ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('signUp')} type="button" role="tab" aria-selected={!isSignIn}>Create account</button>
          </div>

          <form onSubmit={submit}>
            {!isSignIn && (
              <>
                <label htmlFor="registerNumber">Register Number</label>
                <input id="registerNumber" type="text" value={registerNumber} onChange={(event) => setRegisterNumber(event.target.value)} autoComplete="username" placeholder="e.g. 99240040514" required />
                
                <label htmlFor="email">University Email</label>
                <input id="email" type="email" value={email || autoEmail} onChange={(event) => setEmail(event.target.value)} placeholder="99240040514@klu.ac.in" autoComplete="email" required />
              </>
            )}

            {isSignIn && (
              <>
                <label htmlFor="email">University Email</label>
                <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="registernumber@klu.ac.in" autoComplete="email" required />
              </>
            )}

            {!isSignIn && <p className="field-note">Account email must match {autoEmail || 'registernumber@klu.ac.in'}.</p>}

            <label htmlFor="password">Password</label>
            <div className="password-input-group">
              <input 
                id="password" 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                autoComplete={isSignIn ? 'current-password' : 'new-password'} 
                minLength={6} 
                placeholder="••••••••"
                required 
              />
              <button 
                type="button" 
                className="password-toggle-btn" 
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {!isSignIn && (
              <>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} placeholder="••••••••" required />
              </>
            )}

            {error && <div className="form-error" role="alert">{error}</div>}
            {message && <div className="form-message" role="status">{message}</div>}

            <button className="primary-button" disabled={busy || !supabase} style={{ marginTop: '24px' }}>
              {busy ? (isSignIn ? 'Authenticating...' : 'Creating Account...') : (isSignIn ? 'Sign in to Portal' : 'Create Student Account')}
              <ChevronRight size={17} />
            </button>

            {!supabase && <p className="config-note">Supabase configuration is missing. Add environment variables to enable authentication.</p>}
          </form>

          <p className="login-foot">Access governed by official university role authorization & database policies.</p>
        </section>
      </div>
    </main>
  )
}

function StudentDashboard({ faculty = false }) {
  const auth = useAuth(); const [student, setStudent] = useState(null); const [record, setRecord] = useState(null); const [status, setStatus] = useState('loading')
  const [showIntro, setShowIntro] = useState(false)

  useEffect(() => { 
    if (faculty) return; 
    Promise.all([getStudent(auth.studentId), getStudentRecord(auth.studentId)]).then(([studentResult, recordResult]) => { 
      setStudent(studentResult.data); 
      setRecord(recordResult.data); 
      setStatus(studentResult.error ? 'error' : 'ready') 
    }) 
  }, [auth.studentId, faculty])

  useEffect(() => {
    if (!faculty && status === 'ready') {
      const watched = localStorage.getItem('student_intro_watched')
      if (!watched) {
        setShowIntro(true)
      }
    }
  }, [faculty, status])

  if (faculty) return <FacultyDashboard />
  if (status === 'loading') return <Loading message="Loading student profile & academic history..." />
  if (status === 'error') return <ErrorState message="Unable to load student information." />
  const courses = Array.isArray(record?.completed_courses) ? record.completed_courses : []

  return (
    <>
      <IntroVideoModal 
        isOpen={showIntro} 
        onClose={() => setShowIntro(false)} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <PageIntro eyebrow="PERSONAL ACADEMIC RECORD" title={`Welcome, ${student?.student_name ?? 'student'}`} description="Your academic standing, course history, and competency-based credit record." />
        <button 
          type="button" 
          className="secondary-button compact" 
          style={{ marginTop: '10px' }}
          onClick={() => setShowIntro(true)}
        >
          <Play size={14} /> Watch System Orientation
        </button>
      </div>

      <div className="metric-grid">
        {[['Student ID', student?.student_id], ['Program', student?.program], ['Batch', student?.batch_year], ['Current Semester', student?.current_semester], ['CGPA', student?.cgpa], ['Credits Earned', student?.credits_earned], ['Credits Studied', student?.credits_studied], ['Credits Remaining', student?.credits_to_be_earned], ['Arrears', student?.arrears_count]].map(([label, value]) => <Metric key={label} label={label} value={value ?? '—'} />)}
      </div>

      <div className="content-grid">
        <section className="panel">
          <SectionHeading title="Academic Overview" meta={`${courses.length} completed courses`} />
          <div className="mini-list">
            {courses.slice(0, 5).map((course) => (
              <div className="mini-row" key={`${course.semester}-${course.course_code}`}>
                <div><strong>{course.course_code}</strong><span>{course.course_name}</span></div>
                <span className="grade">{course.credits ?? '—'} Credits</span>
              </div>
            ))}
            {courses.length === 0 && <EmptyState title="No course history available" detail="Completed course records will appear here when provided by the academic system." />}
          </div>
        </section>

        <section className="panel">
          <SectionHeading title="Competency Overview" meta="Current status" />
          <EmptyState title="Analysis ready" detail="Your completed courses are ready for dynamic competency calculation." />
          <NavLink className="text-link" to="/student/competency">View competency record <ChevronRight size={15} /></NavLink>
        </section>
      </div>
    </>
  )
}

function FacultyDashboard() { const [stats, setStats] = useState({ students: '—', courses: '—', policies: '—', analyses: '—' }); useEffect(() => { Promise.all([getStudents({ to: 0 }), getCourses(), getCreditPolicies(), getCompetencyAnalyses()]).then(([students, courses, policies, analyses]) => setStats({ students: students.count ?? students.data?.length ?? '—', courses: courses.data?.length ?? '—', policies: policies.data?.filter((item) => item.status === 'active').length ?? '—', analyses: analyses.data?.length ?? '—' })) }, []); return <><PageIntro eyebrow="FACULTY RESEARCH WORKSPACE" title="Academic overview" description="A measured view of academic performance, competency evidence, and credit allocation." /><div className="metric-grid four">{[['Total students', stats.students], ['Total courses', stats.courses], ['Active policies', stats.policies], ['Competency analyses', stats.analyses]].map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div><div className="content-grid"><section className="panel"><SectionHeading title="Analysis readiness" meta="System status" /><div className="readiness"><div><span className="status-dot" /><strong>Academic source connected</strong></div><p>Course configuration and student records are queried directly from the authorized academic tables.</p><div><span className="status-dot muted" /><strong>Competency dataset pending</strong></div><p>Charts and credit allocation results will populate when competency performance data is available.</p></div></section><section className="panel"><SectionHeading title="Research workflow" meta="Method" /><ol className="workflow"><li>Course configuration</li><li>Student performance</li><li>Weighted competency score</li><li>Course-level percentile</li><li>Credit allocation band</li></ol><NavLink className="text-link" to="/methodology">Read methodology <ChevronRight size={15} /></NavLink></section></div></> }

function StudentsPage() { const [students, setStudents] = useState([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState('loading'); useEffect(() => { setStatus('loading'); getStudents({ search }).then(({ data, error }) => { setStudents(data ?? []); setStatus(error ? 'error' : 'ready') }) }, [search]); return <><PageIntro eyebrow="FACULTY / STUDENTS" title="Student directory" description="Search the authorized student population and open a complete academic profile." /><div className="toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search students" placeholder="Search by name or student ID" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="secondary-button"><SlidersHorizontal size={16} /> Filters</button></div>{status === 'loading' ? <Loading message="Loading student records..." /> : status === 'error' ? <ErrorState message="Unable to load student records." /> : <DataTable columns={['Student ID', 'Student name', 'Program', 'Batch', 'Semester', 'CGPA', 'Status']} rows={students.map((student) => [student.student_id, <NavLink className="table-link" to={`/faculty/students/${student.id}`}>{student.student_name}</NavLink>, student.program, student.batch_year, student.current_semester, student.cgpa, <span className="tag">{student.status}</span>])} empty="No students match this search." />}</> }

function StudentProfile() { const { studentId } = useParams(); const [student, setStudent] = useState(null); const [record, setRecord] = useState(null); useEffect(() => { Promise.all([getStudent(studentId), getStudentRecord(studentId)]).then(([one, two]) => { setStudent(one.data); setRecord(two.data) }) }, [studentId]); if (!student) return <Loading message="Loading student profile..." />; const courses = Array.isArray(record?.completed_courses) ? record.completed_courses : []; return <><PageIntro eyebrow="FACULTY VIEW / STUDENT PROFILE" title={student.student_name} description={`Academic record for ${student.student_id}. This view is available to authorized faculty.`} /><div className="metric-grid four">{[['Program', student.program], ['Batch', student.batch_year], ['CGPA', student.cgpa], ['Credits earned', student.credits_earned]].map(([label, value]) => <Metric label={label} value={value ?? '—'} key={label} />)}</div><section className="panel"><SectionHeading title="Completed courses" meta={`${courses.length} records`} /><DataTable columns={['Semester', 'Course code', 'Course name', 'Credits', 'Grade', 'Year']} rows={courses.map((course) => [course.semester, course.course_code, course.course_name, course.credits, course.grade, course.year_of_passing])} empty="No completed courses available." /></section></> }

function CoursesPage() { const [courses, setCourses] = useState([]); const [search, setSearch] = useState(''); useEffect(() => { getCourses().then(({ data }) => setCourses(data ?? [])) }, []); const filteredCourses = useMemo(() => { const term = search.trim().toLowerCase(); if (!term) return courses; return courses.filter((course) => [course.course_code, course.course_name, course.department, course.course_type].some((value) => String(value ?? '').toLowerCase().includes(term))) }, [courses, search]); return <><PageIntro eyebrow="COURSE CATALOG" title="Course information" description="All courses available in the academic course table, with database-driven configuration and competency weightings." /><div className="toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search courses" placeholder="Search by code, name, department, or type" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span className="toolbar-count">{filteredCourses.length} of {courses.length} courses</span></div><DataTable columns={['Code', 'Course name', 'Department', 'Semester', 'Type', 'Reference', 'Range', 'Required']} rows={filteredCourses.map((course) => [course.course_code, course.course_name, course.department, course.semester, course.course_type, course.reference_credits, `${course.min_credits}-${course.max_credits}`, `${course.competency_required}%`])} empty="No courses match your search." /></> }
function MyCoursesPage() { const auth = useAuth(); const [courses, setCourses] = useState([]); const [status, setStatus] = useState('loading'); useEffect(() => { if (!auth.studentId) return; getStudentRecord(auth.studentId).then(({ data, error }) => { setCourses(Array.isArray(data?.completed_courses) ? data.completed_courses : []); setStatus(error ? 'error' : 'ready') }) }, [auth.studentId]); return <><PageIntro eyebrow="MY ACADEMIC RECORD" title="Completed courses" description="Courses recorded as completed in your academic history." />{status === 'loading' ? <Loading message="Loading completed courses..." /> : status === 'error' ? <ErrorState message="Unable to load your completed courses." /> : <DataTable columns={['Semester', 'Course code', 'Course name', 'Credits', 'Grade', 'Year of passing']} rows={courses.map((course) => [course.semester, course.course_code, course.course_name, course.credits, course.grade, course.year_of_passing])} empty="No completed courses recorded." />}</> }
function CompetencyPage() {
  const auth = useAuth()
  const [groups, setGroups] = useState({ Advanced: [], Proficient: [], 'Basic competency': [], 'Not proficient': [] })
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!auth.studentId) return
    getStudentRecord(auth.studentId).then((recordResult) => {
      if (recordResult.error) {
        setStatus('error')
        return
      }
      const completed = Array.isArray(recordResult.data?.completed_courses) ? recordResult.data.completed_courses : []
      const nextGroups = { Advanced: [], Proficient: [], 'Basic competency': [], 'Not proficient': [] }
      completed.forEach((course) => {
        const grade = String(course.grade ?? '').trim().toUpperCase()
        const category = grade === 'S' || grade === 'A' ? 'Advanced' : (grade === 'B' || grade === 'C') ? 'Proficient' : (grade === 'D' || grade === 'E') ? 'Basic competency' : 'Not proficient'
        nextGroups[category].push({ course, grade })
      })
      setGroups(nextGroups)
      setStatus('ready')
    })
  }, [auth.studentId])

  if (status === 'loading') return <Loading message="Loading competency classification..." />
  if (status === 'error') return <ErrorState message="Unable to load competency information." />

  return <>
    <PageIntro eyebrow="MY COMPETENCY" title="Competency classification" description="Courses are classified only from your completed_courses academic record using the recorded base grade." />
    <div className="competency-groups"><CompetencyGroup title="Advanced competency" detail="Base grade S or A" items={groups.Advanced} completed /><CompetencyGroup title="Proficient competency" detail="Base grade B or C" items={groups.Proficient} completed /><CompetencyGroup title="Basic competency" detail="Base grade D or E" items={groups['Basic competency']} completed /><CompetencyGroup title="Not proficient" detail="Any other completed-course grade" items={groups['Not proficient']} completed /></div>
  </>
}
function CompetencyGroup({ title, detail, items }) {
  const [expanded, setExpanded] = useState(false)
  const visibleItems = expanded ? items : items.slice(0, 10)
  const hasMore = items.length > 10

  return <section className="panel competency-group"><SectionHeading title={title} meta={`${items.length} courses`} /><p className="group-detail">{detail}</p>{items.length === 0 ? <EmptyState title="No courses in this group" detail="The group will populate from your completed_courses academic record." /> : <><div className="competency-list">{visibleItems.map((item, index) => <div className="competency-row" key={`${item.course.course_code}-${index}`}><div><strong>{item.course.course_code}</strong><span>{item.course.course_name}</span><small>Base grade: {item.grade}</small></div><span className="credit-note">{item.course.credits ?? '—'} credits</span></div>)}</div>{hasMore && <button type="button" className="see-more-button" onClick={() => setExpanded((current) => !current)}>{expanded ? 'Show less' : `See more (${items.length - 10})`}</button>}</>}</section>
}

function AiInsightsPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [answer, setAnswer] = useState(null)
  const [aiStatus, setAiStatus] = useState('idle')
  const [aiError, setAiError] = useState('')

  async function ask(questionToAsk = question) {
    const trimmedQuestion = questionToAsk.trim()
    if (!trimmedQuestion || aiStatus === 'loading') return
    setQuestion(trimmedQuestion)
    setAiStatus('loading')
    setAiError('')
    const nextHistory = [...messages, { role: 'user', content: trimmedQuestion }]
    const result = await askCompetencyInsight(trimmedQuestion, messages)
    if (result.error) {
      setAiError(result.error.message)
      setAiStatus('error')
      return
    }
    setAnswer(result.data.answer)
    setMessages([...nextHistory, { role: 'assistant', content: result.data.answer }].slice(-8))
    setAiStatus('ready')
  }

  function clearConversation() {
    setQuestion('')
    setMessages([])
    setAnswer(null)
    setAiError('')
    setAiStatus('idle')
  }

  const suggestions = ['What are my strongest competency areas?', 'Which areas should I improve?', 'Which completed courses support my strongest competency?', 'Summarize my competency profile.']

  return <>
    <PageIntro eyebrow="AI INSIGHTS" title="Ask about your competency" description="Ask questions about your academic evidence. AI explains your existing competency data using your official student record." />
    <section className="panel ai-insight-panel">
      <div className="ai-panel-heading">
        <div>
          <p className="eyebrow">OPENROUTER POWERED AI ASSISTANT</p>
          <SectionHeading title="Ask about your competency" meta="Direct AI Academic Analysis" />
        </div>
        <button type="button" className="secondary-button compact" onClick={clearConversation}><RotateCcw size={15} /> Clear Chat</button>
      </div>
      <div className="ai-question-row">
        <MessageCircle size={17} />
        <input 
          value={question} 
          onChange={(event) => setQuestion(event.target.value)} 
          onKeyDown={(event) => { if (event.key === 'Enter') ask() }} 
          placeholder="e.g. What are my strongest competency areas?" 
          aria-label="Ask about your competency" 
        />
        <button type="button" className="primary-button compact" onClick={() => ask()} disabled={aiStatus === 'loading' || !question.trim()}>
          <Send size={15} /> {aiStatus === 'loading' ? 'Analyzing...' : 'Ask AI'}
        </button>
      </div>
      <div className="ai-suggestions">
        <span>Suggested questions</span>
        {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}
      </div>
      {messages.length > 0 && (
        <div className="ai-message-list">
          {messages.map((message, index) => (
            <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
              <strong>{message.role === 'user' ? 'You' : 'Academic AI Assistant'}</strong>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
      )}
      {aiError && <div className="form-error" style={{ marginTop: '14px' }}>{aiError}</div>}
      {answer && (
        <div className="ai-answer">
          <SectionHeading title="Academic AI Analysis" meta="Generated via OpenRouter API" />
          <p>{answer}</p>
        </div>
      )}
    </section>
  </>
}

function CreditBandsPage() { const [bands, setBands] = useState([]); const [status, setStatus] = useState('loading'); useEffect(() => { getCreditBands().then(({ data, error }) => { setBands(data ?? []); setStatus(error ? 'error' : 'ready') }) }, []); return <><PageIntro eyebrow="CREDIT ALLOCATION" title="Credit allocation bands" description="Percentile ranges and awarded credits defined by the academic policy tables." />{status === 'loading' ? <Loading message="Loading credit allocation bands..." /> : status === 'error' ? <ErrorState message="Unable to load credit allocation bands." /> : <DataTable columns={['Reference credits', 'Percentile range', 'Credits awarded', 'Band name']} rows={bands.map((band) => [band.reference_credits, `${band.percentile_min}% – ${band.percentile_max}%`, band.credits_awarded, band.band_name])} empty="No credit allocation bands available." />}</> }

function UploadPreviewTable({ rows, emptyMessage, title }) {
  if (!rows || !rows.length) return <p className="config-note">{emptyMessage}</p>
  return <div className="upload-table-wrap"><table className="upload-table"><thead><tr><th>Row</th><th>Course</th><th>Status</th><th>Summary</th></tr></thead><tbody>{rows.map((row) => <tr key={`${title}-${row.row}-${row.course}`}><td>{row.row}</td><td>{row.course}</td><td><span className={`upload-badge ${row.status === 'Valid' ? 'valid' : 'invalid'}`}>{row.status}</span></td><td>{row.summary}</td></tr>)}</tbody></table></div>
}

function CourseConfigurationUploadPage() {
  const [courses, setCourses] = useState([])
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { getCourses().then(({ data }) => setCourses(data ?? [])) }, [])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const parsed = await parseUploadFile(file)
      if (!parsed || !parsed.length) {
        setPreview(null)
        setError('The uploaded file is empty or could not be parsed as CSV/XLSX.')
        return
      }
      const result = validateCourseConfigurationUpload(parsed, courses)
      setPreview(result)
      setError(result.errors.length ? 'Preview completed with validation issues. Review the invalid rows before saving.' : '')
    } catch (err) {
      setPreview(null)
      setError(`Failed to read file: ${err.message}`)
    }
  }

  return <><PageIntro eyebrow="FACULTY / COURSE CONFIGURATION" title="Course configuration upload" description="Upload a CSV or XLSX file with the course component weights for validation and preview before activation." /><section className="panel upload-panel"><div className="upload-box"><label className="upload-label" htmlFor="course-config-upload">Choose CSV/XLSX file</label><input id="course-config-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} /></div>{fileName && <p className="config-note">Selected file: {fileName}</p>}{preview && <div className="validation-summary"><div><strong>{preview.totalRows}</strong><span>Total rows</span></div><div><strong>{preview.validRows}</strong><span>Valid rows</span></div><div><strong>{preview.invalidRows}</strong><span>Invalid rows</span></div></div>}{error && <div className="form-error">{error}</div>}{preview?.errors?.length ? <div className="issue-list"><h3>Validation issues</h3>{preview.errors.map((issue, index) => <div key={`${issue.row}-${issue.field}-${index}`} className="issue-row"><strong>Row {issue.row}</strong><span>{issue.course}</span><em>{issue.field}</em><p>{issue.problem}</p><small>Expected: {issue.expected}</small>{issue.detectedHeaders && <div className="header-diagnostics" style={{ marginTop: '0.5rem', fontSize: '0.85em' }}><div><strong>Detected headers:</strong> {issue.detectedHeaders.join(', ')}</div><div><strong>Normalized headers:</strong> {issue.normalizedHeaders.join(', ')}</div><div><strong>Missing headers:</strong> {issue.missingHeaders.join(', ')}</div>{issue.unexpectedHeaders?.length ? <div><strong>Unexpected headers:</strong> {issue.unexpectedHeaders.join(', ')}</div> : null}</div>}</div>)}</div> : null}{preview && <UploadPreviewTable rows={preview.preview} emptyMessage="No preview rows available." title="course-config" />}{preview && <button className="primary-button compact" type="button" disabled={preview.invalidRows > 0}>Save as draft</button>}</section></>
}

function PerformanceUploadPage() {
  const auth = useAuth()
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [persisting, setPersisting] = useState(false)
  const [error, setError] = useState('')
  const [batchResult, setBatchResult] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [isInspectMode, setIsInspectMode] = useState(false)
  const [hoverTooltip, setHoverTooltip] = useState(null)

  const handleCellMouseEnter = (type, rec, e) => {
    const target = e.currentTarget || e.target
    if (!target) return
    const rect = target.getBoundingClientRect()
    setHoverTooltip({ type, rec, targetRect: rect })
  }

  const handleCellMouseLeave = () => {
    setHoverTooltip(null)
  }

  const getTooltipData = (tooltip) => {
    if (!tooltip || !tooltip.rec) return null
    const { type, rec } = tooltip
    const sInfo = `Student ${rec.studentId} (${rec.studentName}) — Course ${rec.courseCode}`

    if (type === 'scores') {
      return {
        title: 'Raw Component Scores & Weights',
        studentInfo: sInfo,
        formula: 'Scores: Theory (T), Practical (P), Hands-on (H), Project (Proj)',
        inputs: [
          { label: 'Theory Score', value: `${rec.theory} (Weight: ${rec.weights?.theory ?? 25}%)` },
          { label: 'Practical Score', value: `${rec.practical} (Weight: ${rec.weights?.practical ?? 25}%)` },
          { label: 'Hands-on Score', value: `${rec.handsOn} (Weight: ${rec.weights?.handsOn ?? 25}%)` },
          { label: 'Project Score', value: `${rec.project} (Weight: ${rec.weights?.project ?? 25}%)` },
        ],
        calculation: `Weights sum = ${rec.weights?.theory ?? 25}% + ${rec.weights?.practical ?? 25}% + ${rec.weights?.handsOn ?? 25}% + ${rec.weights?.project ?? 25}% = 100%`,
        result: `T:${rec.theory}, P:${rec.practical}, H:${rec.handsOn}, Proj:${rec.project}`
      }
    }

    if (type === 'competency') {
      const t = Number(rec.theory ?? 0)
      const p = Number(rec.practical ?? 0)
      const h = Number(rec.handsOn ?? 0)
      const proj = Number(rec.project ?? 0)
      const wt = Number(rec.weights?.theory ?? 25)
      const wp = Number(rec.weights?.practical ?? 25)
      const wh = Number(rec.weights?.handsOn ?? 25)
      const wproj = Number(rec.weights?.project ?? 25)
      const stepVal = (t * wt + p * wp + h * wh + proj * wproj)

      return {
        title: 'Competency Score Calculation',
        studentInfo: sInfo,
        formula: 'CS = (Theory × W_T + Practical × W_P + HandsOn × W_H + Project × W_Proj) / 100',
        inputs: [
          { label: 'Theory', value: `${t} × ${wt}% = ${t * wt}` },
          { label: 'Practical', value: `${p} × ${wp}% = ${p * wp}` },
          { label: 'Hands-on', value: `${h} × ${wh}% = ${h * wh}` },
          { label: 'Project', value: `${proj} × ${wproj}% = ${proj * wproj}` },
        ],
        calculation: `(${t * wt} + ${p * wp} + ${h * wh} + ${proj * wproj}) / 100 = ${(stepVal / 100).toFixed(2)}`,
        result: `${rec.competencyScore}%`
      }
    }

    if (type === 'percentile') {
      return {
        title: 'Course Cohort Percentile Calculation',
        studentInfo: sInfo,
        formula: 'Percentile = (Rank - 1) / (N - 1) × 100',
        inputs: [
          { label: 'Competency Score', value: `${rec.competencyScore}%` },
          { label: 'Cohort Rank', value: `Rank ${rec.rank || 1} of ${rec.cohortCount || 1} students in ${rec.courseCode}` },
        ],
        calculation: (rec.cohortCount || 1) > 1
          ? `(${rec.rank || 1} - 1) / (${rec.cohortCount} - 1) × 100 = ${rec.percentile}%`
          : `Cohort size = 1 student → Default Percentile = 100.00%`,
        result: `${rec.percentile}%`
      }
    }

    if (type === 'prevCredits') {
      return {
        title: 'Previous Earned Credits',
        studentInfo: sInfo,
        formula: 'Previous Credits = Stored Student Academic History',
        inputs: [
          { label: 'Recorded Course Credits', value: `${rec.previousCredits} credits` },
          { label: 'Academic Record Source', value: 'Retrieved from public.student_records table' },
        ],
        calculation: `Prior credits recorded for student ${rec.studentId} = ${rec.previousCredits}`,
        result: `${rec.previousCredits} Credits`
      }
    }

    if (type === 'dynamicCredits') {
      return {
        title: 'Dynamic Credit Allocation Band Match',
        studentInfo: sInfo,
        formula: 'MatchBand(ActivePolicy, RefCredits, Percentile)',
        inputs: [
          { label: 'Course Reference Credits', value: `${rec.referenceCredits || 4}` },
          { label: 'Student Cohort Percentile', value: `${rec.percentile}%` },
          { label: 'Matched Band Name', value: rec.bandName || 'Default Band' },
        ],
        calculation: `Percentile ${rec.percentile}% matches band '${rec.bandName || 'Default'}' → Awarded ${rec.dynamicCredits} Credits`,
        result: `${rec.dynamicCredits} Credits`
      }
    }

    if (type === 'creditDiff') {
      const diff = Number(rec.creditDifference ?? 0)
      return {
        title: 'Credit Difference Calculation',
        studentInfo: sInfo,
        formula: 'Credit Difference = Dynamic Credits Awarded - Previous Credits',
        inputs: [
          { label: 'Awarded Dynamic Credits', value: `${rec.dynamicCredits}` },
          { label: 'Previous Earned Credits', value: `${rec.previousCredits}` },
        ],
        calculation: `${rec.dynamicCredits} - ${rec.previousCredits} = ${diff >= 0 ? `+${diff}` : diff}`,
        result: `${diff >= 0 ? `+${diff}` : diff} Credits`
      }
    }

    return null
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParsing(true)
    setError('')
    setBatchResult(null)
    setImportStatus(null)

    try {
      const [parsed, dbContext] = await Promise.all([
        parseUploadFile(file),
        fetchPerformanceImportContext()
      ])

      if (!parsed || !parsed.length) {
        setError('The uploaded file is empty or could not be parsed as CSV/XLSX.')
        setParsing(false)
        return
      }

      const result = calculateAcademicPerformanceBatch(parsed, dbContext)
      setBatchResult(result)

      if (result.validation.errors.length) {
        setError('Upload preview contains validation issues. Please review and correct the invalid records before proceeding.')
      }
    } catch (err) {
      setError(`Failed to read file: ${err.message}`)
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirmImport() {
    if (!batchResult || !batchResult.calculatedRecords.length) return
    setPersisting(true)
    setImportStatus(null)

    const saveRes = await savePerformanceImportBatch(
      batchResult.calculatedRecords,
      fileName,
      auth.user?.id
    )

    setPersisting(false)
    if (saveRes.success) {
      setImportStatus({
        type: 'success',
        message: `Successfully confirmed and imported ${saveRes.count} academic performance record(s) into database tables public.student_course_performance and public.competency_analysis_results.`
      })
    } else {
      setImportStatus({
        type: 'error',
        message: `Import persistence failed: ${saveRes.error}`
      })
    }
  }

  const metrics = batchResult?.summaryMetrics
  const validation = batchResult?.validation
  const records = batchResult?.calculatedRecords ?? []
  const courseConfigs = batchResult?.courseConfigurations ?? []

  return (
    <>
      <PageIntro
        eyebrow="FACULTY / PERFORMANCE IMPORT WORKFLOW"
        title="Student performance import & dynamic credit pipeline"
        description="Multi-step curriculum import: Validate raw performance, review AI outcome classification, and preview database-driven dynamic credit calculations."
      />

      <section className="panel upload-panel">
        <div className="upload-box">
          <label className="upload-label" htmlFor="performance-upload">STEP 1 — Upload Course Performance File (.xlsx / .csv)</label>
          <input id="performance-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={parsing || persisting} />
        </div>

        {fileName && <p className="config-note">Selected file: <strong>{fileName}</strong></p>}
        {parsing && <Loading message="Parsing file and benchmarking against database dynamic credits..." />}

        {/* STEP 3: AI Outcome Component Classification Architecture */}
        {batchResult && !parsing && (
          <AiComponentClassification 
            fileRows={batchResult.calculatedRecords} 
            onApproveClassification={(data) => console.log('Faculty verified AI classifications', data)} 
          />
        )}

        {metrics && (
          <div className="validation-summary">
            <div><strong>{metrics.totalRows}</strong><span>Total rows</span></div>
            <div><strong>{metrics.validRows}</strong><span>Valid rows</span></div>
            <div><strong>{metrics.invalidRows}</strong><span>Invalid rows</span></div>
            <div><strong>{metrics.avgCompetency}%</strong><span>Avg Competency</span></div>
            <div><strong>{metrics.netCreditChange >= 0 ? `+${metrics.netCreditChange}` : metrics.netCreditChange}</strong><span>Net Credit Change</span></div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        {importStatus && (
          <div className={`form-message ${importStatus.type === 'error' ? 'form-error' : ''}`} style={{ padding: '12px', border: '1px solid var(--line)', background: importStatus.type === 'error' ? 'rgba(147,79,73,0.08)' : 'rgba(85,116,90,0.08)' }}>
            <strong>{importStatus.type === 'success' ? 'Import Confirmed & Persisted' : 'Import Failure'}</strong>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>{importStatus.message}</p>
          </div>
        )}

        {validation?.errors?.length ? (
          <div className="issue-list">
            <h3>Validation issues</h3>
            {validation.errors.map((issue, index) => (
              <div key={`${issue.row}-${issue.field}-${index}`} className="issue-row">
                <strong>Row {issue.row}</strong>
                <span>{issue.course}</span>
                <em>{issue.field}</em>
                <p>{issue.problem}</p>
                <small>Expected: {issue.expected}</small>
                {issue.detectedHeaders && (
                  <div className="header-diagnostics" style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
                    <div><strong>Detected headers:</strong> {issue.detectedHeaders.join(', ')}</div>
                    <div><strong>Normalized headers:</strong> {issue.normalizedHeaders.join(', ')}</div>
                    <div><strong>Missing headers:</strong> {issue.missingHeaders.join(', ')}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* COURSE INFORMATION PANEL */}
        {courseConfigs.map((cfg) => (
          <div key={cfg.courseCode} className="panel" style={{ border: '1px solid var(--strong-line)', background: 'var(--subtle)', marginTop: '14px' }}>
            <SectionHeading title={`Course Configuration: ${cfg.courseCode} — ${cfg.courseName}`} meta={`Ref Credits: ${cfg.referenceCredits}`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '12px', fontSize: '12px' }}>
              <div><strong>Theory Weight:</strong> {cfg.weights.theory}%</div>
              <div><strong>Practical Weight:</strong> {cfg.weights.practical}%</div>
              <div><strong>Hands-on Weight:</strong> {cfg.weights.handsOn}%</div>
              <div><strong>Project Weight:</strong> {cfg.weights.project}%</div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
              <strong>Active Policy:</strong> {cfg.activePolicyName} | <strong>Allocation Bands:</strong> {cfg.allocationBands.map(b => `${b.band_name} (${b.percentile_min}%–${b.percentile_max}% → ${b.credits_awarded} credits)`).join(', ') || 'Default Policy'}
            </div>
          </div>
        ))}

        {/* FULL COMPUTATION RESULTS TABLE */}
        {records.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '12px' }}>
              <SectionHeading title="Dynamic Credit Computation Preview" meta={`${records.length} evaluated student records`} />
              <button
                type="button"
                className={`secondary-button ${isInspectMode ? 'active' : ''}`}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: isInspectMode ? 'var(--olive, #3b82f6)' : undefined,
                  color: isInspectMode ? '#fff' : undefined,
                  borderColor: isInspectMode ? 'var(--olive, #3b82f6)' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => {
                  setIsInspectMode(!isInspectMode)
                  if (hoverTooltip) setHoverTooltip(null)
                }}
              >
                <span>Inspect Math</span>
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: isInspectMode ? 'rgba(255,255,255,0.25)' : 'var(--subtle)',
                  color: isInspectMode ? '#fff' : 'var(--muted)'
                }}>
                  {isInspectMode ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {isInspectMode && (
              <div style={{
                padding: '8px 14px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '12px',
                color: 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Sparkles size={16} style={{ color: 'var(--olive, #3b82f6)' }} />
                <span><strong>Math Inspection Mode Active:</strong> Hover or focus on any score, competency %, percentile, or credit value to view exact formulas and calculation steps.</span>
              </div>
            )}

            <div className="upload-table-wrap">
              <table className={`upload-table ${isInspectMode ? 'inspect-mode-active' : ''}`}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Student ID</th>
                    <th>Student Name</th>
                    <th>Course</th>
                    <th>Scores (T/P/H/P)</th>
                    <th>Competency Score</th>
                    <th>Percentile</th>
                    <th>Previous Credits</th>
                    <th>Dynamic Credits</th>
                    <th>Credit Difference</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => (
                    <tr key={`${rec.row}-${rec.studentId}`}>
                      <td>{rec.row}</td>
                      <td><strong>{rec.studentId}</strong></td>
                      <td>{rec.studentName}</td>
                      <td>{rec.courseCode}</td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.03)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('scores', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('scores', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        {rec.theory} / {rec.practical} / {rec.handsOn} / {rec.project}
                      </td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.05)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('competency', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('competency', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        <strong style={{ color: 'var(--ink)' }}>{rec.competencyScore}%</strong>
                      </td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.03)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('percentile', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('percentile', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        {rec.percentile}%
                      </td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.03)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('prevCredits', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('prevCredits', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        {rec.previousCredits}
                      </td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.05)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('dynamicCredits', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('dynamicCredits', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        <strong style={{ color: 'var(--olive)' }}>{rec.dynamicCredits}</strong>
                      </td>
                      <td
                        style={{ cursor: isInspectMode ? 'help' : 'default', background: isInspectMode ? 'rgba(59, 130, 246, 0.03)' : undefined }}
                        tabIndex={isInspectMode ? 0 : -1}
                        onMouseEnter={(e) => handleCellMouseEnter('creditDiff', rec, e)}
                        onMouseLeave={handleCellMouseLeave}
                        onFocus={(e) => handleCellMouseEnter('creditDiff', rec, e)}
                        onBlur={handleCellMouseLeave}
                      >
                        <span className={`upload-badge ${rec.creditDifference > 0 ? 'valid' : rec.creditDifference < 0 ? 'invalid' : ''}`}>
                          {rec.creditDifference >= 0 ? `+${rec.creditDifference}` : rec.creditDifference}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`secondary-button ${isInspectMode ? 'active' : ''}`}
                          style={{ padding: '2px 8px', minHeight: '26px', fontSize: '11px' }}
                          onClick={(e) => {
                            if (!isInspectMode) {
                              setIsInspectMode(true)
                            }
                            handleCellMouseEnter('competency', rec, e)
                          }}
                        >
                          Inspect Math
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* STAGE 2 CONFIRM & IMPORT BUTTON */}
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                className="primary-button compact"
                type="button"
                disabled={persisting || metrics?.invalidRows > 0 || !records.length}
                onClick={handleConfirmImport}
              >
                {persisting ? 'Persisting to database...' : 'Confirm & Import Results'}
              </button>
              {importStatus?.type === 'success' && (
                <span style={{ color: 'var(--green)', fontSize: '12px', fontWeight: 600 }}>
                  ✓ Records committed to Supabase
                </span>
              )}
            </div>
          </>
        )}

        {/* REUSABLE MATH TOOLTIP */}
        {isInspectMode && hoverTooltip && (() => {
          const tooltipData = getTooltipData(hoverTooltip)
          if (!tooltipData) return null
          return (
            <MathTooltip
              title={tooltipData.title}
              studentInfo={tooltipData.studentInfo}
              formula={tooltipData.formula}
              inputs={tooltipData.inputs}
              calculation={tooltipData.calculation}
              result={tooltipData.result}
              targetRect={hoverTooltip.targetRect}
              visible={true}
              onClose={() => setHoverTooltip(null)}
            />
          )
        })()}
      </section>
    </>
  )
}


function CreditPoliciesPage() {
  const [policies, setPolicies] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const loadPolicies = async () => {
    setStatus('loading')
    setError('')
    const { data, error: err } = await getCreditPoliciesWithBands()
    if (err) {
      setError(err.message || 'Unable to load credit policies from database.')
      setStatus('error')
    } else {
      setPolicies(data ?? [])
      setStatus('ready')
    }
  }

  useEffect(() => {
    loadPolicies()
  }, [])

  const filteredPolicies = useMemo(() => {
    if (filterStatus === 'all') return policies
    return policies.filter(p => String(p.status).toLowerCase() === filterStatus.toLowerCase())
  }, [policies, filterStatus])

  return (
    <>
      <PageIntro
        eyebrow="FACULTY / ACADEMIC GOVERNANCE"
        title="Credit Policy"
        description="Official university credit allocation policies, version control, effective date ranges, and database-stored allocation rules."
      />

      <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Filter Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--surface)' }}
          >
            <option value="all">All Policies</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button
          type="button"
          className="secondary-button compact"
          onClick={loadPolicies}
          disabled={status === 'loading'}
        >
          <RotateCcw size={14} /> Refresh Database
        </button>
      </div>

      {status === 'loading' && <Loading message="Loading database credit policies and allocation bands..." />}
      {status === 'error' && <ErrorState message={error || "Unable to retrieve policy records."} />}

      {status === 'ready' && (
        <section className="panel">
          <SectionHeading title="Authoritative Credit Policies" meta={`${filteredPolicies.length} database policies`} />
          <DataTable
            columns={['Policy Name', 'Version', 'Status', 'Effective Dates', 'Description', 'Allocation Bands']}
            rows={filteredPolicies.map((pol) => [
              <strong>{pol.policy_name}</strong>,
              `v${pol.version}`,
              <span className={`upload-badge ${String(pol.status).toLowerCase() === 'active' ? 'valid' : ''}`}>
                {pol.status}
              </span>,
              pol.effective_from ? `${new Date(pol.effective_from).toLocaleDateString()} ${pol.effective_to ? `to ${new Date(pol.effective_to).toLocaleDateString()}` : '(Current)'}` : 'Always Effective',
              pol.description || 'Standard allocation policy',
              Array.isArray(pol.bands) && pol.bands.length > 0
                ? pol.bands.map(b => `${b.band_name} (${b.percentile_min}%–${b.percentile_max}% → ${b.credits_awarded} credits)`).join('; ')
                : 'No bands linked'
            ])}
            empty="No credit policy records found in database."
          />
        </section>
      )}
    </>
  )
}

function CourseOutcomesPage() {
  const [outcomes, setOutcomes] = useState([])
  const [courses, setCourses] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('all')

  const loadData = async () => {
    setStatus('loading')
    setError('')
    const [coRes, courseRes] = await Promise.all([
      getAllCourseOutcomes(),
      getCourses()
    ])

    if (coRes.error) {
      setError(coRes.error.message || 'Failed to load course outcomes from database.')
      setStatus('error')
    } else {
      setOutcomes(coRes.data ?? [])
      setCourses(courseRes.data ?? [])
      setStatus('ready')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredOutcomes = useMemo(() => {
    const term = search.trim().toLowerCase()
    return outcomes.filter((co) => {
      const courseCode = String(co.courses?.course_code ?? co.course_code ?? '').toLowerCase()
      const courseName = String(co.courses?.course_name ?? co.course_name ?? '').toLowerCase()
      const coCode = String(co.co_code ?? '').toLowerCase()
      const description = String(co.co_description ?? '').toLowerCase()
      const evidence = String(co.evidence ?? '').toLowerCase()

      const matchesSearch = !term || 
        courseCode.includes(term) ||
        courseName.includes(term) ||
        coCode.includes(term) ||
        description.includes(term) ||
        evidence.includes(term)

      const matchesCourse = selectedCourse === 'all' || 
        co.course_id === selectedCourse || 
        courseCode === selectedCourse.toLowerCase()

      return matchesSearch && matchesCourse
    })
  }, [outcomes, search, selectedCourse])

  return (
    <>
      <PageIntro
        eyebrow="FACULTY / CURRICULUM MANAGEMENT"
        title="Course Outcomes"
        description="Search, filter, and inspect database-grounded course outcomes, component percentage weightings, hours, and evidence specifications."
      />

      <div className="toolbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center' }}>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search course outcomes"
            placeholder="Search by course name, course code, CO code, or outcome description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--surface)' }}
          aria-label="Filter by course"
        >
          <option value="all">All Courses</option>
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
          ))}
        </select>

        {search && (
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => { setSearch(''); setSelectedCourse('all'); }}
          >
            Clear Search
          </button>
        )}
      </div>

      <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Authoritative source: <code>public.course_outcomes</code></span>
        <span>Showing {filteredOutcomes.length} of {outcomes.length} course outcomes</span>
      </div>

      {status === 'loading' && <Loading message="Loading database course outcomes..." />}
      {status === 'error' && <ErrorState message={error || "Unable to load course outcomes."} />}

      {status === 'ready' && (
        <section className="panel">
          {filteredOutcomes.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <EmptyState
                title="No course outcomes found for your search."
                detail="Try adjusting your search keywords or clearing course filters to view all recorded outcomes."
              />
              {search && (
                <button
                  type="button"
                  className="primary-button compact"
                  style={{ marginTop: '14px' }}
                  onClick={() => { setSearch(''); setSelectedCourse('all'); }}
                >
                  Reset Search Filters
                </button>
              )}
            </div>
          ) : (
            <div className="course-outcomes-table-wrap">
              <table className="course-outcomes-table">
                <colgroup>
                  <col className="col-course" />
                  <col className="col-co-code" />
                  <col className="col-description" />
                  <col className="col-weight" />
                  <col className="col-hours" />
                  <col className="col-evidence" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>CO Code</th>
                    <th>Description</th>
                    <th>Component Weight (T/P/H/P)</th>
                    <th>Hours</th>
                    <th>Evidence Specification</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutcomes.map((co) => (
                    <tr key={co.id || `${co.course_id}-${co.co_code}`}>
                      <td>
                        <strong>{co.courses?.course_code ?? co.course_code ?? 'Course'}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', wordBreak: 'break-word' }}>
                          {co.courses?.course_name ?? ''}
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--olive)' }}>{co.co_code}</strong>
                      </td>
                      <td className="description-cell">
                        {co.co_description}
                      </td>
                      <td className="component-weight-cell">
                        <div style={{ fontSize: '11px', fontWeight: 500, display: 'inline-flex', flexWrap: 'wrap', gap: '4px 6px' }}>
                          <span>T: <strong>{co.theory_percentage ?? 0}%</strong></span>
                          <span style={{ color: 'var(--line)' }}>|</span>
                          <span>P: <strong>{co.practical_percentage ?? 0}%</strong></span>
                          <span style={{ color: 'var(--line)' }}>|</span>
                          <span>H: <strong>{co.hands_on_percentage ?? 0}%</strong></span>
                          <span style={{ color: 'var(--line)' }}>|</span>
                          <span>Proj: <strong>{co.project_percentage ?? 0}%</strong></span>
                        </div>
                      </td>
                      <td>
                        {co.hours ?? '—'} hrs
                      </td>
                      <td className="evidence-cell">
                        <span className="upload-badge valid" style={{ fontSize: '11px', textTransform: 'none', letterSpacing: 'normal', fontWeight: 500, display: 'inline-block', lineHeight: 1.4 }}>
                          {co.evidence || 'Standard Exam/Lab'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function SimplePage({ title, eyebrow, description, children }) { return <><PageIntro eyebrow={eyebrow} title={title} description={description} />{children ?? <section className="panel"><EmptyState title="No records available yet" detail="This area is ready for the next authorized academic dataset." /></section>}</> }
function Methodology() { return <SimplePage eyebrow="SYSTEM METHOD" title="Research methodology" description="The calculation path from course configuration to competency-based credits."><section className="method-grid">{['Course configuration', 'Student performance', 'Weighted competency score', 'Course-level percentile', 'Credit allocation band', 'Dynamic credits', 'Reference vs dynamic comparison'].map((step, index) => <div className="method-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong><p>{index === 2 ? 'Course percentages weight theory, practical, hands-on, and project scores.' : index === 4 ? 'A matching policy band determines the credits awarded for the course.' : 'Authorized academic data moves to the next stage of the analysis.'}</p></div>)}</section></SimplePage> }
function Unauthorized() { return <main className="center-state"><ShieldAlert size={34} /><h1>Access restricted</h1><p>Your account does not have permission to view this academic area.</p><NavLink className="primary-button compact" to="/">Return to overview</NavLink></main> }
function ProfilePending() { const auth = useAuth(); return <main className="center-state"><UserRound size={34} /><h1>Account awaiting academic access</h1><p>{auth.user?.email} is authenticated, but no student or faculty profile is linked yet. Ask your university administrator to verify your register number.</p><button className="primary-button compact" onClick={auth.signOut}>Sign out</button></main> }
function Loading({ message }) { return <div className="state"><div className="loader" /><span>{message}</span></div> }
function ErrorState({ message }) { return <div className="state error-state"><ShieldAlert size={19} /><span>{message}</span></div> }
function EmptyState({ title, detail }) { return <div className="empty"><div className="empty-mark">—</div><strong>{title}</strong><p>{detail}</p></div> }
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function PageIntro({ eyebrow, title, description }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div> }
function SectionHeading({ title, meta }) { return <div className="section-heading"><h3>{title}</h3><span>{meta}</span></div> }
function DataTable({ columns, rows, empty }) { return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length}><EmptyState title={empty} detail="Try another search or check back after the next data import." /></td></tr>}</tbody></table></div> }

function FacultyRagPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [sources, setSources] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    getCompetencyConversations().then((result) => {
      if (!result.error) setConversations(result.data?.conversations ?? [])
    })
  }, [])

  async function ask(questionToAsk = question) {
    const trimmed = questionToAsk.trim()
    if (!trimmed || status === 'loading') return
    setQuestion(trimmed)
    setStatus('loading')
    setError('')
    const history = messages.slice(-6)
    const result = await askCompetencyInsight(trimmed, history, conversationId)
    if (result.error) {
      setError(result.error.message)
      setStatus('error')
      return
    }
    setConversationId(result.data.conversation_id ?? conversationId)
    setSources(result.data.sources ?? result.data.evidence ?? [])
    setMessages([...history, { role: 'user', content: trimmed }, { role: 'assistant', content: result.data.answer }].slice(-10))
    setQuestion('')
    setStatus('ready')
    const updatedConvs = await getCompetencyConversations()
    if (!updatedConvs.error) setConversations(updatedConvs.data?.conversations ?? [])
  }

  async function openSession(id) {
    const result = await getCompetencyConversations(id)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setConversationId(id)
    setMessages(result.data?.messages ?? [])
    setError('')
    setStatus('ready')
  }

  function resetSession() {
    setQuestion('')
    setMessages([])
    setConversationId(null)
    setSources([])
    setError('')
    setStatus('idle')
  }

  return <>
    <PageIntro 
      eyebrow="FACULTY / RESEARCH ASSISTANT" 
      title="Academic RAG Assistant" 
      description="Ask questions about courses, curriculum, course outcomes, competency evidence, and authorized academic data." 
    />
    
    <div className="content-grid" style={{ gridTemplateColumns: '300px 1fr' }}>
      <section className="panel">
        <div className="section-heading">
          <h3>Saved Sessions</h3>
          <button type="button" className="secondary-button compact" onClick={resetSession} style={{ margin: 0 }}>
            + New
          </button>
        </div>
        <div className="conversation-list" style={{ gridTemplateColumns: '1fr', marginTop: '12px' }}>
          {conversations.length ? conversations.map((c) => (
            <button 
              type="button" 
              key={c.id} 
              className={c.id === conversationId ? 'conversation-item active' : 'conversation-item'}
              onClick={() => openSession(c.id)}
            >
              <strong>{c.title}</strong>
              <span>{new Date(c.updated_at).toLocaleString()}</span>
            </button>
          )) : (
            <span className="conversation-empty">No saved faculty sessions yet.</span>
          )}
        </div>
      </section>

      <section className="panel ai-insight-panel" style={{ marginTop: 0 }}>
        <div className="ai-panel-heading">
          <div>
            <p className="eyebrow">GROUNDED RESEARCH ASSISTANT</p>
            <SectionHeading title="Grounded Academic Q&A" meta="Supabase PostgreSQL + pgvector" />
          </div>
        </div>

        <div className="ai-message-list" style={{ minHeight: '220px', maxHeight: '420px', overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <EmptyState 
              title="Academic RAG Ready" 
              detail="Ask questions about course outcomes, department benchmarks, or student competency evidence." 
            />
          ) : (
            messages.map((m, idx) => (
              <div key={idx} className={`ai-message ${m.role}`}>
                <strong>{m.role === 'user' ? 'Faculty Query' : 'RAG Assistant'}</strong>
                <p>{m.content}</p>
              </div>
            ))
          )}
          {status === 'loading' && (
            <div className="chatbot-loading" style={{ padding: '12px 0' }}>
              Querying PostgreSQL tables & pgvector semantic documents...
            </div>
          )}
        </div>

        {error && <div className="form-error" style={{ marginTop: '12px' }}>{error}</div>}

        {sources.length > 0 && (
          <div className="ai-evidence">
            <strong>Sources & Citations</strong>
            {sources.slice(0, 6).map((src, idx) => (
              <span key={idx}>
                <em>{src.type || 'Source'}</em> {src.course_code ? `${src.course_code} — ` : ''}{src.label || src.course_name || src.description || 'Academic dataset'}
                {src.page ? ` (Page ${src.page})` : ''}
              </span>
            ))}
          </div>
        )}

        <div className="ai-question-row" style={{ marginTop: '16px' }}>
          <MessageCircle size={17} />
          <input 
            value={question} 
            onChange={(e) => setQuestion(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') ask() }} 
            placeholder="Ask a question about courses, outcomes, or competency evidence..." 
            aria-label="Ask RAG assistant" 
          />
          <button 
            type="button" 
            className="primary-button compact" 
            onClick={() => ask()} 
            disabled={status === 'loading' || !question.trim()}
          >
            <Send size={15} /> {status === 'loading' ? 'Searching...' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  </>
}

function App() { return <Routes><Route path="/login" element={<Login />} /><Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}><Route index element={<RoleHome />} /><Route path="student" element={<RoleGate role="student"><RoleHome /></RoleGate>} /><Route path="student/profile" element={<RoleGate role="student"><StudentDashboard /></RoleGate>} /><Route path="student/competency" element={<RoleGate role="student"><CompetencyPage /></RoleGate>} /><Route path="student/ai-insights" element={<RoleGate role="student"><AiInsightsPage /></RoleGate>} /><Route path="student/courses" element={<RoleGate role="student"><MyCoursesPage /></RoleGate>} /><Route path="courses" element={<CoursesPage />} /><Route path="credit-bands" element={<CreditBandsPage />} /><Route path="methodology" element={<Methodology />} /><Route path="faculty" element={<RoleGate role="faculty"><RoleHome /></RoleGate>} /><Route path="faculty/students" element={<RoleGate role="faculty"><StudentsPage /></RoleGate>} /><Route path="faculty/students/:studentId" element={<RoleGate role="faculty"><StudentProfile /></RoleGate>} /><Route path="faculty/courses" element={<RoleGate role="faculty"><CoursesPage /></RoleGate>} /><Route path="faculty/course-configuration" element={<RoleGate role="faculty"><CourseConfigurationUploadPage /></RoleGate>} /><Route path="faculty/performance-upload" element={<RoleGate role="faculty"><PerformanceUploadPage /></RoleGate>} /><Route path="faculty/policies" element={<RoleGate role="faculty"><CreditPoliciesPage /></RoleGate>} /><Route path="faculty/outcomes" element={<RoleGate role="faculty"><CourseOutcomesPage /></RoleGate>} /><Route path="faculty/analytics" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / COHORT ANALYTICS" title="Cohort analytics" description="Aggregate distributions without unnecessary student-identifying data." /></RoleGate>} /><Route path="faculty/rag" element={<RoleGate role="faculty"><FacultyRagPage /></RoleGate>} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
function RoleHome() { const auth = useAuth(); return <StudentDashboard faculty={auth.role === 'faculty'} /> }
function RoleGate({ role, children }) { const auth = useAuth(); return auth.role === role ? children : <Unauthorized /> }

export default App



