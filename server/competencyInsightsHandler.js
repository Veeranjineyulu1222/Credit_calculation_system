import { createClient } from '@supabase/supabase-js'

const SYSTEM_PROMPT = `You are an academic competency insight assistant.

Answer questions about a university student's competency profile using only the competency data supplied in the current request. Do not invent courses, grades, competency areas, course outcomes, scores, or academic achievements. Do not reveal information about other students.

Clearly distinguish observations supported by the academic data, reasonable interpretations, and general recommendations. Use careful language such as "Based on your completed coursework" and "Your academic record shows". If the data is insufficient, say so clearly.

You may explain, summarize, observe patterns, and suggest study improvements. You must never calculate or determine official competency scores, percentiles, credit allocations, dynamic credits, credit policies, or allocation bands. Those remain deterministic application and database logic. Do not override university records or make professional, medical, psychological, or personality assessments.

Answer the student's question directly and concisely.`

function jsonResponse(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function normalizedGrade(grade) {
  return String(grade ?? '').trim().toUpperCase()
}

function gradeEvidence(grade) {
  const value = normalizedGrade(grade)
  if (value === 'S' || value === 'A') return 'Advanced evidence'
  if (value === 'B' || value === 'C') return 'Proficient evidence'
  if (value === 'D' || value === 'E') return 'Basic competency evidence'
  return 'Recorded academic evidence'
}

function compactCourse(course) {
  const source = course && typeof course === 'object' ? course : {}
  return {
    course_code: source.course_code ?? null,
    course_name: source.course_name ?? null,
    credits: source.credits ?? null,
    grade: normalizedGrade(source.grade),
    semester: source.semester ?? null,
    competency_category: source.competency_category ?? source.competency ?? null,
    competency_evidence: source.competency_evidence ?? gradeEvidence(source.grade),
    course_outcomes: Array.isArray(source.course_outcomes) ? source.course_outcomes.map((outcome) => ({
      co_code: outcome.co_code ?? null,
      co_description: outcome.co_description ?? null,
      evidence: outcome.evidence ?? null,
    })) : [],
  }
}

function buildCompetencyContext(student, record) {
  const courses = Array.isArray(record?.completed_courses) ? record.completed_courses.map(compactCourse) : []
  const grouped = new Map()

  courses.forEach((course) => {
    const category = course.competency_category || course.competency_evidence
    if (!grouped.has(category)) grouped.set(category, [])
    grouped.get(category).push(course)
  })

  const competencyProfile = [...grouped.entries()].map(([competency, supportingCourses]) => ({
    competency,
    evidence_level: supportingCourses.some((course) => course.grade === 'S' || course.grade === 'A')
      ? 'Strong academic evidence'
      : supportingCourses.some((course) => course.grade === 'B' || course.grade === 'C')
        ? 'Good academic evidence'
        : 'Developing or recorded academic evidence',
    supporting_courses: supportingCourses,
  }))

  const strengthAreas = courses.filter((course) => course.grade === 'S' || course.grade === 'A').map((course) => course.competency_category || course.competency_evidence)
  const improvementAreas = courses.filter((course) => course.grade === 'D' || course.grade === 'E' || course.grade === 'F').map((course) => course.competency_category || course.competency_evidence)

  return {
    student: {
      program: student?.program ?? null,
      batch_year: student?.batch_year ?? null,
      semester: student?.current_semester ?? null,
    },
    competency_profile: competencyProfile,
    completed_courses: courses,
    strength_areas: [...new Set(strengthAreas)],
    improvement_areas: [...new Set(improvementAreas)],
  }
}

function recentHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 1200) }))
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  let body = ''
  for await (const chunk of request) body += chunk
  return body ? JSON.parse(body) : {}
}

export async function competencyInsightsHandler(request, response) {
  if (request.method !== 'POST') return jsonResponse(response, 405, { error: 'Method not allowed.' })

  const authorization = request.headers.authorization || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) return jsonResponse(response, 401, { error: 'Authentication required.' })

  let body
  try {
    body = await readBody(request)
  } catch {
    return jsonResponse(response, 400, { error: 'Invalid request.' })
  }

  const question = String(body.question ?? '').trim()
  if (!question || question.length > 1200) return jsonResponse(response, 400, { error: 'Enter a question up to 1200 characters.' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL

  if (!supabaseUrl || !supabaseKey || !openRouterKey || !model) {
    return jsonResponse(response, 503, { error: 'AI insights are temporarily unavailable.' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const { data: userResult, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userResult?.user) return jsonResponse(response, 401, { error: 'Authentication required.' })

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role, student_id')
    .eq('user_id', userResult.user.id)
    .maybeSingle()

  if (profileError || !profile || profile.role !== 'student' || !profile.student_id) {
    return jsonResponse(response, 403, { error: 'Student competency access is not available for this account.' })
  }

  const [{ data: student, error: studentError }, { data: record, error: recordError }] = await Promise.all([
    supabase.from('students').select('program, batch_year, current_semester').eq('id', profile.student_id).maybeSingle(),
    supabase.from('student_records').select('completed_courses').eq('student_id', profile.student_id).maybeSingle(),
  ])

  if (studentError || recordError) return jsonResponse(response, 500, { error: 'Unable to load your competency data.' })

  const completedCourses = Array.isArray(record?.completed_courses) ? record.completed_courses : []
  const courseCodes = completedCourses.filter((course) => course && typeof course === 'object').map((course) => String(course.course_code ?? '').trim()).filter(Boolean)
  let outcomesByCourse = new Map()
  if (courseCodes.length) {
    const { data: courseDefinitions } = await supabase.from('courses').select('id, course_code').in('course_code', courseCodes)
    const courseIds = (courseDefinitions ?? []).map((course) => course.id).filter(Boolean)
    if (courseIds.length) {
      const { data: outcomes } = await supabase.from('course_outcomes').select('course_id, co_code, co_description, evidence').in('course_id', courseIds)
      const courseCodeById = new Map((courseDefinitions ?? []).map((course) => [course.id, String(course.course_code).trim().toUpperCase()]))
      outcomesByCourse = new Map()
      ;(outcomes ?? []).forEach((outcome) => {
        const courseCode = courseCodeById.get(outcome.course_id)
        if (!courseCode) return
        if (!outcomesByCourse.has(courseCode)) outcomesByCourse.set(courseCode, [])
        outcomesByCourse.get(courseCode).push(outcome)
      })
    }
  }

  const enrichedRecord = {
    ...record,
    completed_courses: completedCourses.filter((course) => course && typeof course === 'object').map((course) => ({
      ...course,
      course_outcomes: outcomesByCourse.get(String(course.course_code ?? '').trim().toUpperCase()) ?? course.course_outcomes ?? [],
    })),
  }
  const context = buildCompetencyContext(student, enrichedRecord)
  if (!context.completed_courses.length) return jsonResponse(response, 422, { error: 'There is not enough competency data available yet to generate an AI insight.' })

  const userPrompt = `STUDENT MY COMPETENCY DATA:\n${JSON.stringify(context)}\n\nRECENT CONVERSATION:\n${JSON.stringify(recentHistory(body.history))}\n\nSTUDENT QUESTION:\n${question}\n\nAnswer only from the supplied competency data. Do not calculate official scores, percentiles, or credits.`

  let openRouterResponse
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://creditcalculationsystem.vercel.app',
        'X-Title': 'CSP Competency Credit System',
      },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }] }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    return jsonResponse(response, 502, { error: 'AI insights are temporarily unavailable. Your competency data is still available.' })
  }

  if (!openRouterResponse.ok) return jsonResponse(response, 502, { error: 'AI insights are temporarily unavailable. Your competency data is still available.' })

  let result
  try {
    result = await openRouterResponse.json()
  } catch {
    return jsonResponse(response, 502, { error: 'AI insights are temporarily unavailable. Your competency data is still available.' })
  }

  const answer = result?.choices?.[0]?.message?.content
  if (typeof answer !== 'string' || !answer.trim()) return jsonResponse(response, 502, { error: 'AI insights are temporarily unavailable. Your competency data is still available.' })

  return jsonResponse(response, 200, {
    answer: answer.trim(),
    evidence: context.completed_courses.map((course) => ({ course_code: course.course_code, course_name: course.course_name, grade: course.grade, credits: course.credits, semester: course.semester })).slice(0, 12),
  })
}
