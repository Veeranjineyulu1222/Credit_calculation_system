import { useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ChartNoAxesCombined, ChevronRight, ClipboardList, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, MessageCircle, RotateCcw, Search, Send, ShieldAlert, SlidersHorizontal, UserRound, Users, X } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { getStudent, getStudentRecord, getStudents } from './services/studentService'
import { getCourses } from './services/courseService'
import { getCreditPolicies } from './services/creditPolicyService'
import { getCreditBands } from './services/creditBandService'
import { getCompetencyAnalyses } from './services/analysisService'
import { askCompetencyInsight } from './services/aiService'
import { normalizeRegisterNumber, universityEmail, validateStudentRegistration } from './services/authService'
import { supabase } from './lib/supabase'

const studentNav = [
  ['Overview', '/student', LayoutDashboard], ['My Profile', '/student/profile', UserRound], ['My Courses', '/student/courses', BookOpen], ['My Competency', '/student/competency', ChartNoAxesCombined], ['AI Insights', '/student/ai-insights', MessageCircle], ['Course Information', '/courses', BookOpen], ['Credit Allocation Bands', '/credit-bands', SlidersHorizontal], ['Methodology', '/methodology', FileText],
]
const facultyNav = [
  ['Overview', '/faculty', LayoutDashboard], ['Students', '/faculty/students', Users], ['Courses', '/faculty/courses', BookOpen], ['Course Configurations', '/faculty/course-configuration', ClipboardList], ['Performance Upload', '/faculty/performance-upload', ChartNoAxesCombined], ['Competency Analysis', '/faculty/analysis', ChartNoAxesCombined], ['Credit Comparison', '/faculty/credits', SlidersHorizontal], ['Credit Policies', '/faculty/policies', FileText], ['Credit Allocation Bands', '/credit-bands', SlidersHorizontal], ['Course Outcomes', '/faculty/outcomes', ClipboardList], ['Cohort Analytics', '/faculty/analytics', ChartNoAxesCombined], ['Methodology', '/methodology', FileText],
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
  const title = location.pathname === '/student' || location.pathname === '/faculty' ? 'Overview' : nav.find((item) => location.pathname.startsWith(item[1]))?.[0] ?? 'Academic system'
  return <div className="app-shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">CSP</div><div><strong>Competency-Based</strong><span>Credit System</span></div><button className="icon-button mobile-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="role-label">{isFaculty ? 'Faculty workspace' : 'Student workspace'}</div>
      <nav aria-label="Primary navigation">{nav.map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === '/student' || path === '/faculty'} onClick={() => setOpen(false)}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="identity"><div className="avatar">{(auth.user?.email?.[0] ?? 'U').toUpperCase()}</div><div><strong>{auth.user?.email?.split('@')[0]}</strong><span>{auth.role}</span></div></div><button className="signout" onClick={async () => { await auth.signOut(); navigate('/login') }}><LogOut size={16} /> Sign out</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div><p className="eyebrow">CSP / {isFaculty ? 'FACULTY' : 'STUDENT'}</p><h1>{title}</h1></div><div className="topbar-meta"><span className="status-dot" /> Authenticated session</div></header><div className="page-content"><Outlet /></div></main>
  </div>
}

function Login() {
  const auth = useAuth(); const navigate = useNavigate(); const [mode, setMode] = useState('signIn'); const [registerNumber, setRegisterNumber] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  if (auth.loading) return <Loading message="Loading CSP..." />
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
  return <main className="login-page"><section className="login-panel"><div className="brand login-brand"><div className="brand-mark">CSP</div><div><strong>Competency-Based</strong><span>Credit System</span></div></div><div className="login-copy"><p className="eyebrow">UNIVERSITY ACADEMIC SYSTEM</p><h1>{isSignIn ? 'Academic insight, grounded in evidence.' : 'Create your academic access.'}</h1><p>{isSignIn ? 'Sign in with your university email to access your authorized academic records.' : 'Enter your register number, university email, and password to secure your academic access.'}</p></div><div className="auth-tabs" role="tablist" aria-label="Authentication options"><button className={isSignIn ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('signIn')} type="button" role="tab" aria-selected={isSignIn}>Sign in</button><button className={!isSignIn ? 'auth-tab active' : 'auth-tab'} onClick={() => switchMode('signUp')} type="button" role="tab" aria-selected={!isSignIn}>Create account</button></div><form onSubmit={submit}>{!isSignIn && <><label htmlFor="registerNumber">Register number</label><input id="registerNumber" type="text" value={registerNumber} onChange={(event) => setRegisterNumber(event.target.value)} autoComplete="username" placeholder="99240040514" required /><label htmlFor="email">University email</label><input id="email" type="email" value={email || autoEmail} onChange={(event) => setEmail(event.target.value)} placeholder="99240040514@klu.ac.in" autoComplete="email" required /></>}{isSignIn && <><label htmlFor="email">University email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="registernumber@klu.ac.in" autoComplete="email" required /></>}{!isSignIn && <p className="field-note">Your account email should match {autoEmail || 'registernumber@klu.ac.in'}.</p>}<label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignIn ? 'current-password' : 'new-password'} minLength={6} required />{!isSignIn && <><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></>}{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-message" role="status">{message}</div>}<button className="primary-button" disabled={busy || !supabase}>{busy ? (isSignIn ? 'Signing in...' : 'Creating account...') : (isSignIn ? 'Sign in' : 'Create account')}<ChevronRight size={17} /></button>{!supabase && <p className="config-note">Supabase configuration is missing. Add the VITE environment variables to enable authentication.</p>}</form><p className="login-foot">Access is governed by your university role and database permissions.</p></section></main>
}

function StudentDashboard({ faculty = false }) {
  const auth = useAuth(); const [student, setStudent] = useState(null); const [record, setRecord] = useState(null); const [status, setStatus] = useState('loading')
  useEffect(() => { if (faculty) return; Promise.all([getStudent(auth.studentId), getStudentRecord(auth.studentId)]).then(([studentResult, recordResult]) => { setStudent(studentResult.data); setRecord(recordResult.data); setStatus(studentResult.error ? 'error' : 'ready') }) }, [auth.studentId, faculty])
  if (faculty) return <FacultyDashboard />
  if (status === 'loading') return <Loading message="Loading student information..." />
  if (status === 'error') return <ErrorState message="Unable to load student information." />
  const courses = Array.isArray(record?.completed_courses) ? record.completed_courses : []
  return <><PageIntro eyebrow="PERSONAL ACADEMIC RECORD" title={`Welcome, ${student?.student_name ?? 'student'}`} description="Your academic standing, course history, and competency-based credit record." /><div className="metric-grid">{[['Student ID', student?.student_id], ['Program', student?.program], ['Batch', student?.batch_year], ['Current semester', student?.current_semester], ['CGPA', student?.cgpa], ['Credits earned', student?.credits_earned], ['Credits studied', student?.credits_studied], ['Credits remaining', student?.credits_to_be_earned], ['Arrears', student?.arrears_count]].map(([label, value]) => <Metric key={label} label={label} value={value ?? 'â€”'} />)}</div><div className="content-grid"><section className="panel"><SectionHeading title="Academic overview" meta={`${courses.length} completed courses`} /><div className="mini-list">{courses.slice(0, 4).map((course) => <div className="mini-row" key={`${course.semester}-${course.course_code}`}><div><strong>{course.course_code}</strong><span>{course.course_name}</span></div><span className="grade">{course.grade}</span></div>)}{courses.length === 0 && <EmptyState title="No course history available" detail="Completed course records will appear here when provided by the academic system." />}</div></section><section className="panel"><SectionHeading title="Competency overview" meta="Current status" /><EmptyState title="Analysis not available yet" detail="Competency performance data is not available yet." /><NavLink className="text-link" to="/student/competency">View competency record <ChevronRight size={15} /></NavLink></section></div></>
}

function FacultyDashboard() { const [stats, setStats] = useState({ students: 'â€”', courses: 'â€”', policies: 'â€”', analyses: 'â€”' }); useEffect(() => { Promise.all([getStudents({ to: 0 }), getCourses(), getCreditPolicies(), getCompetencyAnalyses()]).then(([students, courses, policies, analyses]) => setStats({ students: students.count ?? students.data?.length ?? 'â€”', courses: courses.data?.length ?? 'â€”', policies: policies.data?.filter((item) => item.status === 'active').length ?? 'â€”', analyses: analyses.data?.length ?? 'â€”' })) }, []); return <><PageIntro eyebrow="FACULTY RESEARCH WORKSPACE" title="Academic overview" description="A measured view of academic performance, competency evidence, and credit allocation." /><div className="metric-grid four">{[['Total students', stats.students], ['Total courses', stats.courses], ['Active policies', stats.policies], ['Competency analyses', stats.analyses]].map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div><div className="content-grid"><section className="panel"><SectionHeading title="Analysis readiness" meta="System status" /><div className="readiness"><div><span className="status-dot" /><strong>Academic source connected</strong></div><p>Course configuration and student records are queried directly from the authorized academic tables.</p><div><span className="status-dot muted" /><strong>Competency dataset pending</strong></div><p>Charts and credit allocation results will populate when competency performance data is available.</p></div></section><section className="panel"><SectionHeading title="Research workflow" meta="Method" /><ol className="workflow"><li>Course configuration</li><li>Student performance</li><li>Weighted competency score</li><li>Course-level percentile</li><li>Credit allocation band</li></ol><NavLink className="text-link" to="/methodology">Read methodology <ChevronRight size={15} /></NavLink></section></div></> }

function StudentsPage() { const [students, setStudents] = useState([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState('loading'); useEffect(() => { setStatus('loading'); getStudents({ search }).then(({ data, error }) => { setStudents(data ?? []); setStatus(error ? 'error' : 'ready') }) }, [search]); return <><PageIntro eyebrow="FACULTY / STUDENTS" title="Student directory" description="Search the authorized student population and open a complete academic profile." /><div className="toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search students" placeholder="Search by name or student ID" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="secondary-button"><SlidersHorizontal size={16} /> Filters</button></div>{status === 'loading' ? <Loading message="Loading student records..." /> : status === 'error' ? <ErrorState message="Unable to load student records." /> : <DataTable columns={['Student ID', 'Student name', 'Program', 'Batch', 'Semester', 'CGPA', 'Status']} rows={students.map((student) => [student.student_id, <NavLink className="table-link" to={`/faculty/students/${student.id}`}>{student.student_name}</NavLink>, student.program, student.batch_year, student.current_semester, student.cgpa, <span className="tag">{student.status}</span>])} empty="No students match this search." />}</> }

function StudentProfile() { const { studentId } = useParams(); const [student, setStudent] = useState(null); const [record, setRecord] = useState(null); useEffect(() => { Promise.all([getStudent(studentId), getStudentRecord(studentId)]).then(([one, two]) => { setStudent(one.data); setRecord(two.data) }) }, [studentId]); if (!student) return <Loading message="Loading student profile..." />; const courses = Array.isArray(record?.completed_courses) ? record.completed_courses : []; return <><PageIntro eyebrow="FACULTY VIEW / STUDENT PROFILE" title={student.student_name} description={`Academic record for ${student.student_id}. This view is available to authorized faculty.`} /><div className="metric-grid four">{[['Program', student.program], ['Batch', student.batch_year], ['CGPA', student.cgpa], ['Credits earned', student.credits_earned]].map(([label, value]) => <Metric label={label} value={value ?? 'â€”'} key={label} />)}</div><section className="panel"><SectionHeading title="Completed courses" meta={`${courses.length} records`} /><DataTable columns={['Semester', 'Course code', 'Course name', 'Credits', 'Grade', 'Year']} rows={courses.map((course) => [course.semester, course.course_code, course.course_name, course.credits, course.grade, course.year_of_passing])} empty="No completed courses available." /></section></> }

function CoursesPage() { const [courses, setCourses] = useState([]); const [search, setSearch] = useState(''); useEffect(() => { getCourses().then(({ data }) => setCourses(data ?? [])) }, []); const filteredCourses = useMemo(() => { const term = search.trim().toLowerCase(); if (!term) return courses; return courses.filter((course) => [course.course_code, course.course_name, course.department, course.course_type].some((value) => String(value ?? '').toLowerCase().includes(term))) }, [courses, search]); return <><PageIntro eyebrow="COURSE CATALOG" title="Course information" description="All courses available in the academic course table, with database-driven configuration and competency weightings." /><div className="toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search courses" placeholder="Search by code, name, department, or type" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span className="toolbar-count">{filteredCourses.length} of {courses.length} courses</span></div><DataTable columns={['Code', 'Course name', 'Department', 'Semester', 'Type', 'Reference', 'Range', 'Required']} rows={filteredCourses.map((course) => [course.course_code, course.course_name, course.department, course.semester, course.course_type, course.reference_credits, `${course.min_credits}â€“${course.max_credits}`, `${course.competency_required}%`])} empty="No courses match your search." /></> }
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
  const [evidence, setEvidence] = useState([])
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
    setEvidence(result.data.evidence ?? [])
    setMessages([...nextHistory, { role: 'assistant', content: result.data.answer }].slice(-8))
    setAiStatus('ready')
  }

  function clearConversation() {
    setQuestion('')
    setMessages([])
    setAnswer(null)
    setEvidence([])
    setAiError('')
    setAiStatus('idle')
  }

  const suggestions = ['What are my strongest competency areas?', 'Which areas should I improve?', 'Which completed courses support my strongest competency?', 'Summarize my competency profile.']

  return <>
    <PageIntro eyebrow="AI INSIGHTS" title="Ask about your competency" description="Ask questions about your academic evidence. AI explains your existing competency data; it does not calculate official scores or credits." />
    <section className="panel ai-insight-panel">
      <div className="ai-panel-heading"><div><p className="eyebrow">AI INSIGHTS</p><SectionHeading title="Ask about your competency" meta="Evidence-based explanation" /></div><button type="button" className="secondary-button compact" onClick={clearConversation}><RotateCcw size={15} /> New question</button></div>
      <div className="ai-question-row"><MessageCircle size={17} /><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask() }} placeholder="What are my strongest competency areas?" aria-label="Ask about your competency" /><button type="button" className="primary-button compact" onClick={() => ask()} disabled={aiStatus === 'loading' || !question.trim()}><Send size={15} /> {aiStatus === 'loading' ? 'Thinking...' : 'Ask AI'}</button></div>
      <div className="ai-suggestions"><span>Suggested questions</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
      {aiError && <div className="form-error">{aiError}</div>}
      {answer && <div className="ai-answer"><SectionHeading title="AI insight" meta="Based on your My Competency data" /><p>{answer}</p>{evidence.length > 0 && <div className="ai-evidence"><strong>Evidence used</strong>{evidence.map((item, index) => <span key={`${item.course_code}-${index}`}>{item.course_code} — {item.course_name} — {item.grade}</span>)}</div>}</div>}
    </section>
  </>
}

function CreditBandsPage() { const [bands, setBands] = useState([]); const [status, setStatus] = useState('loading'); useEffect(() => { getCreditBands().then(({ data, error }) => { setBands(data ?? []); setStatus(error ? 'error' : 'ready') }) }, []); return <><PageIntro eyebrow="CREDIT ALLOCATION" title="Credit allocation bands" description="Percentile ranges and awarded credits defined by the academic policy tables." />{status === 'loading' ? <Loading message="Loading credit allocation bands..." /> : status === 'error' ? <ErrorState message="Unable to load credit allocation bands." /> : <DataTable columns={['Reference credits', 'Percentile range', 'Credits awarded', 'Band name']} rows={bands.map((band) => [band.reference_credits, `${band.percentile_min}% â€“ ${band.percentile_max}%`, band.credits_awarded, band.band_name])} empty="No credit allocation bands available." />}</> }

function parseCsvRows(csvText) {
  if (!csvText || !csvText.trim()) return []
  const rows = []
  let current = ''
  let row = []
  let inQuotes = false
  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const next = csvText[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(current)
      if (row.some((cell) => cell !== '')) {
        rows.push(row)
      }
      row = []
      current = ''
    } else {
      current += char
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current)
    if (row.some((cell) => cell !== '')) rows.push(row)
  }
  return rows
}

function normalizeCsvValue(value) {
  return String(value ?? '').trim()
}

function validateCourseConfigurationUpload(rows, availableCourses) {
  const normalizedCourses = new Map((availableCourses ?? []).map((course) => [String(course.course_code).trim().toUpperCase(), course]))
  const headerRow = rows[0]?.map((cell) => normalizeCsvValue(cell).toLowerCase()) ?? []
  const requiredHeaders = ['course_code', 'course_name', 'theory_percentage', 'practical_percentage', 'hands_on_percentage', 'project_percentage', 'reference_credits', 'min_credits', 'max_credits', 'competency_required']
  const missingHeaders = requiredHeaders.filter((key) => !headerRow.includes(key))
  if (missingHeaders.length) {
    return {
      totalRows: rows.length - 1,
      validRows: 0,
      invalidRows: rows.length - 1,
      warnings: [],
      errors: [{ row: 1, course: 'â€”', field: 'headers', problem: `Missing required headers: ${missingHeaders.join(', ')}`, expected: requiredHeaders.join(', ') }],
      preview: []
    }
  }

  const byIndex = Object.fromEntries(requiredHeaders.map((header, index) => [header, headerRow.indexOf(header)]))
  const seenCodes = new Set()
  const invalidRows = []
  const preview = []
  let validRows = 0

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const record = {}
    requiredHeaders.forEach((header) => {
      record[header] = row[byIndex[header]] ?? ''
    })

    const courseCode = normalizeCsvValue(record.course_code).toUpperCase()
    const courseName = normalizeCsvValue(record.course_name)
    const rowErrors = []

    if (!courseCode) rowErrors.push({ field: 'course_code', problem: 'Missing course code', expected: 'Course code is required.' })
    if (!courseName) rowErrors.push({ field: 'course_name', problem: 'Missing course name', expected: 'Course name is required.' })

    if (courseCode && seenCodes.has(courseCode)) {
      rowErrors.push({ field: 'course_code', problem: 'Duplicate course code in upload', expected: 'Each course code should appear once in the file.' })
    } else if (courseCode) {
      seenCodes.add(courseCode)
    }

    if (courseCode && !normalizedCourses.has(courseCode)) {
      rowErrors.push({ field: 'course_code', problem: 'Course not found in the academic course table', expected: 'Course code must match an existing public.courses record.' })
    }

    const numericFields = ['theory_percentage', 'practical_percentage', 'hands_on_percentage', 'project_percentage', 'reference_credits', 'min_credits', 'max_credits', 'competency_required']
    numericFields.forEach((field) => {
      const rawValue = normalizeCsvValue(record[field])
      const numericValue = Number(rawValue)
      if (!rawValue) {
        rowErrors.push({ field, problem: 'Missing value', expected: 'A numeric value is required.' })
      } else if (!Number.isFinite(numericValue)) {
        rowErrors.push({ field, problem: 'Invalid number', expected: 'Use a valid numeric value.' })
      }
    })

    const theory = Number(normalizeCsvValue(record.theory_percentage))
    const practical = Number(normalizeCsvValue(record.practical_percentage))
    const handsOn = Number(normalizeCsvValue(record.hands_on_percentage))
    const project = Number(normalizeCsvValue(record.project_percentage))
    const totalWeight = [theory, practical, handsOn, project].filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + value, 0)
    if (Number.isFinite(theory) && Number.isFinite(practical) && Number.isFinite(handsOn) && Number.isFinite(project) && Math.abs(totalWeight - 100) > 0.0001) {
      rowErrors.push({ field: 'weights', problem: 'Component weights must total 100%.', expected: 'The weight total should equal 100.' })
    }

    if (Number.isFinite(theory) && (theory < 0 || theory > 100)) rowErrors.push({ field: 'theory_percentage', problem: 'Invalid range', expected: 'Expected 0â€“100.' })
    if (Number.isFinite(practical) && (practical < 0 || practical > 100)) rowErrors.push({ field: 'practical_percentage', problem: 'Invalid range', expected: 'Expected 0â€“100.' })
    if (Number.isFinite(handsOn) && (handsOn < 0 || handsOn > 100)) rowErrors.push({ field: 'hands_on_percentage', problem: 'Invalid range', expected: 'Expected 0â€“100.' })
    if (Number.isFinite(project) && (project < 0 || project > 100)) rowErrors.push({ field: 'project_percentage', problem: 'Invalid range', expected: 'Expected 0â€“100.' })

    const referenceCredits = Number(normalizeCsvValue(record.reference_credits))
    const minCredits = Number(normalizeCsvValue(record.min_credits))
    const maxCredits = Number(normalizeCsvValue(record.max_credits))
    const competencyRequired = Number(normalizeCsvValue(record.competency_required))

    if (Number.isFinite(referenceCredits) && (referenceCredits <= 0)) rowErrors.push({ field: 'reference_credits', problem: 'Reference credits must be greater than 0', expected: 'Expected a positive credit value.' })
    if (Number.isFinite(minCredits) && Number.isFinite(maxCredits) && minCredits > maxCredits) rowErrors.push({ field: 'min_credits', problem: 'Minimum credits exceed maximum credits', expected: 'Minimum credits must be less than or equal to maximum credits.' })
    if (Number.isFinite(competencyRequired) && (competencyRequired < 0 || competencyRequired > 100)) rowErrors.push({ field: 'competency_required', problem: 'Competency requirement is outside the valid range', expected: 'Expected 0â€“100.' })

    if (rowErrors.length) {
      invalidRows.push({ row: rowIndex + 1, course: courseCode || 'Unknown', errors: rowErrors })
      preview.push({ row: rowIndex + 1, course: courseCode || 'Unknown', status: 'Invalid', summary: `${rowErrors.length} issue${rowErrors.length > 1 ? 's' : ''}` })
    } else {
      validRows += 1
      preview.push({ row: rowIndex + 1, course: courseCode, status: 'Valid', summary: `${theory}% / ${practical}% / ${handsOn}% / ${project}%` })
    }
  }

  return {
    totalRows: Math.max(rows.length - 1, 0),
    validRows,
    invalidRows,
    warnings: [],
    errors: invalidRows.flatMap((entry) => entry.errors.map((issue) => ({ row: entry.row, course: entry.course, field: issue.field, problem: issue.problem, expected: issue.expected }))),
    preview
  }
}

function validatePerformanceUpload(rows, availableStudents, availableCourses) {
  const studentMap = new Map((availableStudents ?? []).map((student) => [String(student.student_id).trim(), student]))
  const courseMap = new Map((availableCourses ?? []).map((course) => [String(course.course_code).trim().toUpperCase(), course]))
  const headerRow = rows[0]?.map((cell) => normalizeCsvValue(cell).toLowerCase()) ?? []
  const requiredHeaders = ['student_id', 'course_code', 'theory_score', 'practical_score', 'hands_on_score', 'project_score']
  const missingHeaders = requiredHeaders.filter((key) => !headerRow.includes(key))
  if (missingHeaders.length) {
    return {
      totalRows: rows.length - 1,
      validRows: 0,
      invalidRows: rows.length - 1,
      warnings: [],
      errors: [{ row: 1, course: 'â€”', field: 'headers', problem: `Missing required headers: ${missingHeaders.join(', ')}`, expected: requiredHeaders.join(', ') }],
      preview: []
    }
  }

  const byIndex = Object.fromEntries(requiredHeaders.map((header, index) => [header, headerRow.indexOf(header)]))
  const seenPairs = new Set()
  const invalidRows = []
  const preview = []
  let validRows = 0

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const record = {}
    requiredHeaders.forEach((header) => {
      record[header] = row[byIndex[header]] ?? ''
    })

    const studentId = normalizeCsvValue(record.student_id)
    const courseCode = normalizeCsvValue(record.course_code).toUpperCase()
    const rowErrors = []

    if (!studentId) rowErrors.push({ field: 'student_id', problem: 'Missing student id', expected: 'A valid student_id is required.' })
    if (!courseCode) rowErrors.push({ field: 'course_code', problem: 'Missing course code', expected: 'A valid course_code is required.' })
    if (studentId && !studentMap.has(studentId)) rowErrors.push({ field: 'student_id', problem: 'Student not found in the authorized student table', expected: 'Student ID must exist in public.students.' })
    if (courseCode && !courseMap.has(courseCode)) rowErrors.push({ field: 'course_code', problem: 'Course not found in the academic course table', expected: 'Course code must exist in public.courses.' })

    const pairKey = `${studentId}|${courseCode}`
    if (studentId && courseCode && seenPairs.has(pairKey)) rowErrors.push({ field: 'student_id', problem: 'Duplicate student + course record in the same upload', expected: 'Each student/course combination should appear once.' })
    else if (studentId && courseCode) seenPairs.add(pairKey)

    const scoreFields = ['theory_score', 'practical_score', 'hands_on_score', 'project_score']
    scoreFields.forEach((field) => {
      const rawValue = normalizeCsvValue(record[field])
      const numericValue = Number(rawValue)
      if (!rawValue) {
        rowErrors.push({ field, problem: 'Missing score', expected: 'Score is required for all four components.' })
      } else if (!Number.isFinite(numericValue)) {
        rowErrors.push({ field, problem: 'Invalid score', expected: 'Use a numeric value between 0 and 100.' })
      } else if (numericValue < 0 || numericValue > 100) {
        rowErrors.push({ field, problem: 'Score outside valid range', expected: 'Expected 0â€“100.' })
      }
    })

    if (rowErrors.length) {
      invalidRows.push({ row: rowIndex + 1, course: courseCode || 'Unknown', errors: rowErrors })
      preview.push({ row: rowIndex + 1, course: courseCode || studentId || 'Unknown', status: 'Invalid', summary: `${rowErrors.length} issue${rowErrors.length > 1 ? 's' : ''}` })
    } else {
      validRows += 1
      preview.push({ row: rowIndex + 1, course: courseCode, status: 'Valid', summary: `${record.theory_score} / ${record.practical_score} / ${record.hands_on_score} / ${record.project_score}` })
    }
  }

  return {
    totalRows: Math.max(rows.length - 1, 0),
    validRows,
    invalidRows,
    warnings: [],
    errors: invalidRows.flatMap((entry) => entry.errors.map((issue) => ({ row: entry.row, course: entry.course, field: issue.field, problem: issue.problem, expected: issue.expected }))),
    preview
  }
}

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
    const text = await file.text()
    const parsed = parseCsvRows(text)
    if (!parsed.length) {
      setPreview(null)
      setError('The uploaded file is empty or could not be parsed as CSV.')
      return
    }
    const result = validateCourseConfigurationUpload(parsed, courses)
    setPreview(result)
    setError(result.errors.length ? 'Preview completed with validation issues. Review the invalid rows before saving.' : '')
  }

  return <><PageIntro eyebrow="FACULTY / COURSE CONFIGURATION" title="Course configuration upload" description="Upload a CSV file with the course component weights for validation and preview before activation." /><section className="panel upload-panel"><div className="upload-box"><label className="upload-label" htmlFor="course-config-upload">Choose CSV file</label><input id="course-config-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} /></div>{fileName && <p className="config-note">Selected file: {fileName}</p>}{preview && <div className="validation-summary"><div><strong>{preview.totalRows}</strong><span>Total rows</span></div><div><strong>{preview.validRows}</strong><span>Valid rows</span></div><div><strong>{preview.invalidRows}</strong><span>Invalid rows</span></div></div>}{error && <div className="form-error">{error}</div>}{preview?.errors?.length ? <div className="issue-list"><h3>Validation issues</h3>{preview.errors.map((issue, index) => <div key={`${issue.row}-${issue.field}-${index}`} className="issue-row"><strong>Row {issue.row}</strong><span>{issue.course}</span><em>{issue.field}</em><p>{issue.problem}</p><small>Expected: {issue.expected}</small></div>)}</div> : null}{preview && <UploadPreviewTable rows={preview.preview} emptyMessage="No preview rows available." title="course-config" />}{preview && <button className="primary-button compact" type="button" disabled={preview.invalidRows > 0}>Save as draft</button>}</section></>
}

function PerformanceUploadPage() {
  const [courses, setCourses] = useState([])
  const [students, setStudents] = useState([])
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getCourses(), getStudents({ to: 500 })]).then(([coursesResult, studentsResult]) => {
      setCourses(coursesResult.data ?? [])
      setStudents(studentsResult.data ?? [])
    })
  }, [])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseCsvRows(text)
    if (!parsed.length) {
      setPreview(null)
      setError('The uploaded file is empty or could not be parsed as CSV.')
      return
    }
    const result = validatePerformanceUpload(parsed, students, courses)
    setPreview(result)
    setError(result.errors.length ? 'Performance preview completed with validation issues. Correct the invalid rows before importing.' : '')
  }

  return <><PageIntro eyebrow="FACULTY / PERFORMANCE" title="Student performance upload" description="Validate student competency records before they are saved into the official academic dataset." /><section className="panel upload-panel"><div className="upload-box"><label className="upload-label" htmlFor="performance-upload">Choose CSV file</label><input id="performance-upload" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} /></div>{fileName && <p className="config-note">Selected file: {fileName}</p>}{preview && <div className="validation-summary"><div><strong>{preview.totalRows}</strong><span>Total rows</span></div><div><strong>{preview.validRows}</strong><span>Valid rows</span></div><div><strong>{preview.invalidRows}</strong><span>Invalid rows</span></div></div>}{error && <div className="form-error">{error}</div>}{preview?.errors?.length ? <div className="issue-list"><h3>Validation issues</h3>{preview.errors.map((issue, index) => <div key={`${issue.row}-${issue.field}-${index}`} className="issue-row"><strong>Row {issue.row}</strong><span>{issue.course}</span><em>{issue.field}</em><p>{issue.problem}</p><small>Expected: {issue.expected}</small></div>)}</div> : null}{preview && <UploadPreviewTable rows={preview.preview} emptyMessage="No preview rows available." title="performance-uploads" />}{preview && <button className="primary-button compact" type="button" disabled={preview.invalidRows > 0}>Import performance data</button>}</section></>
}

function SimplePage({ title, eyebrow, description, children }) { return <><PageIntro eyebrow={eyebrow} title={title} description={description} />{children ?? <section className="panel"><EmptyState title="No records available yet" detail="This area is ready for the next authorized academic dataset." /></section>}</> }
function Methodology() { return <SimplePage eyebrow="SYSTEM METHOD" title="Research methodology" description="The calculation path from course configuration to competency-based credits."><section className="method-grid">{['Course configuration', 'Student performance', 'Weighted competency score', 'Course-level percentile', 'Credit allocation band', 'Dynamic credits', 'Reference vs dynamic comparison'].map((step, index) => <div className="method-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong><p>{index === 2 ? 'Course percentages weight theory, practical, hands-on, and project scores.' : index === 4 ? 'A matching policy band determines the credits awarded for the course.' : 'Authorized academic data moves to the next stage of the analysis.'}</p></div>)}</section></SimplePage> }
function Unauthorized() { return <main className="center-state"><ShieldAlert size={34} /><h1>Access restricted</h1><p>Your account does not have permission to view this academic area.</p><NavLink className="primary-button compact" to="/">Return to overview</NavLink></main> }
function ProfilePending() { const auth = useAuth(); return <main className="center-state"><UserRound size={34} /><h1>Account awaiting academic access</h1><p>{auth.user?.email} is authenticated, but no student or faculty profile is linked yet. Ask your university administrator to verify your register number.</p><button className="primary-button compact" onClick={auth.signOut}>Sign out</button></main> }
function Loading({ message }) { return <div className="state"><div className="loader" /><span>{message}</span></div> }
function ErrorState({ message }) { return <div className="state error-state"><ShieldAlert size={19} /><span>{message}</span></div> }
function EmptyState({ title, detail }) { return <div className="empty"><div className="empty-mark">â€”</div><strong>{title}</strong><p>{detail}</p></div> }
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function PageIntro({ eyebrow, title, description }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div> }
function SectionHeading({ title, meta }) { return <div className="section-heading"><h3>{title}</h3><span>{meta}</span></div> }
function DataTable({ columns, rows, empty }) { return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length}><EmptyState title={empty} detail="Try another search or check back after the next data import." /></td></tr>}</tbody></table></div> }

function App() { return <Routes><Route path="/login" element={<Login />} /><Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}><Route index element={<RoleHome />} /><Route path="student" element={<RoleGate role="student"><RoleHome /></RoleGate>} /><Route path="student/profile" element={<RoleGate role="student"><StudentDashboard /></RoleGate>} /><Route path="student/competency" element={<RoleGate role="student"><CompetencyPage /></RoleGate>} /><Route path="student/ai-insights" element={<RoleGate role="student"><AiInsightsPage /></RoleGate>} /><Route path="student/courses" element={<RoleGate role="student"><MyCoursesPage /></RoleGate>} /><Route path="courses" element={<CoursesPage />} /><Route path="credit-bands" element={<CreditBandsPage />} /><Route path="methodology" element={<Methodology />} /><Route path="faculty" element={<RoleGate role="faculty"><RoleHome /></RoleGate>} /><Route path="faculty/students" element={<RoleGate role="faculty"><StudentsPage /></RoleGate>} /><Route path="faculty/students/:studentId" element={<RoleGate role="faculty"><StudentProfile /></RoleGate>} /><Route path="faculty/courses" element={<RoleGate role="faculty"><CoursesPage /></RoleGate>} /><Route path="faculty/course-configuration" element={<RoleGate role="faculty"><CourseConfigurationUploadPage /></RoleGate>} /><Route path="faculty/performance-upload" element={<RoleGate role="faculty"><PerformanceUploadPage /></RoleGate>} /><Route path="faculty/analysis" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / ANALYSIS" title="Competency analysis" description="Course-level competency performance and allocation results." /></RoleGate>} /><Route path="faculty/credits" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / CREDITS" title="Credit comparison" description="Reference credits compared with competency-based allocations." /></RoleGate>} /><Route path="faculty/policies" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / POLICIES" title="Credit policies" description="Active and historical allocation policy definitions." /></RoleGate>} /><Route path="faculty/outcomes" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / OUTCOMES" title="Course outcomes" description="Evidence and weighting for each course outcome." /></RoleGate>} /><Route path="faculty/analytics" element={<RoleGate role="faculty"><SimplePage eyebrow="FACULTY / COHORT ANALYTICS" title="Cohort analytics" description="Aggregate distributions without unnecessary student-identifying data." /></RoleGate>} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
function RoleHome() { const auth = useAuth(); return <StudentDashboard faculty={auth.role === 'faculty'} /> }
function RoleGate({ role, children }) { const auth = useAuth(); return auth.role === role ? children : <Unauthorized /> }

export default App



