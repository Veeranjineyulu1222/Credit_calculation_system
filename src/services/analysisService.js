import { supabase } from '../lib/supabase'

export async function calculateDynamicCredits(studentId, courseId) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const { data, error } = await supabase.rpc('calculate_dynamic_credits', {
    p_student_id: studentId,
    p_course_id: courseId,
  })
  return { data: data?.[0] ?? null, error }
}

export async function getStudentPerformance(studentId) {
  if (!supabase || !studentId) return { data: [], error: null }
  return supabase
    .from('student_course_performance')
    .select('course_id, theory_score, practical_score, hands_on_score, project_score')
    .eq('student_id', studentId)
}

export async function getCompetencyAnalyses() {
  if (!supabase) return { data: [], error: null }
  const result = await supabase.from('competency_analysis_results').select('*')
  if (result.error && result.error.code === '42P01') {
    return supabase.from('competency_results').select('*')
  }
  return result
}

export function calculateCompetencyScore(course, scores) {
  if (!course || !scores) return null
  const theory = scores.theory_score ?? scores.theory ?? 0
  const practical = scores.practical_score ?? scores.practical ?? 0
  const handsOn = scores.hands_on_score ?? scores.handsOn ?? 0
  const project = scores.project_score ?? scores.project ?? 0
  return ((theory * course.theory_percentage) + (practical * course.practical_percentage) + (handsOn * course.hands_on_percentage) + (project * course.project_percentage)) / 100
}

export function findCreditBand(bands, referenceCredits, percentile) {
  return bands.find((band) => Number(band.reference_credits) === Number(referenceCredits) && percentile >= Number(band.percentile_min) && percentile <= Number(band.percentile_max)) ?? null
}

/**
 * Fetches all authoritative database data required for batch calculation:
 * - courses
 * - students
 * - student_records
 * - existing student_course_performance (cohort records)
 * - active credit_policies
 * - credit_allocation_bands
 */
export async function fetchPerformanceImportContext() {
  if (!supabase) {
    return {
      courses: [],
      students: [],
      studentRecords: [],
      existingPerformance: [],
      activePolicy: null,
      creditBands: []
    }
  }

  const courseFields = 'id, course_code, course_name, department, semester, course_type, reference_credits, min_credits, max_credits, competency_required, status, theory_percentage, practical_percentage, hands_on_percentage, project_percentage'
  const studentFields = 'id, student_id, student_name, program, batch_year, current_semester, cgpa, credits_earned, credits_studied, credits_to_be_earned, arrears_count, status'

  const [coursesRes, studentsRes, recordsRes, perfRes, policiesRes, bandsRes] = await Promise.all([
    supabase.from('courses').select(courseFields),
    supabase.from('students').select(studentFields),
    supabase.from('student_records').select('id, student_id, completed_courses'),
    supabase.from('student_course_performance').select('id, student_id, course_id, theory_score, practical_score, hands_on_score, project_score'),
    supabase.from('credit_policies').select('id, policy_name, version, status').eq('status', 'active').limit(1),
    supabase.from('credit_allocation_bands').select('id, policy_id, reference_credits, percentile_min, percentile_max, credits_awarded, band_name')
  ])

  return {
    courses: coursesRes.data ?? [],
    students: studentsRes.data ?? [],
    studentRecords: recordsRes.data ?? [],
    existingPerformance: perfRes.data ?? [],
    activePolicy: policiesRes.data?.[0] ?? null,
    creditBands: bandsRes.data ?? []
  }
}

/**
 * Stage 2: Persists confirmed performance records and competency analysis results to Supabase.
 */
export async function savePerformanceImportBatch(calculatedRecords, fileName = 'performance_import.csv', userAuthId = null) {
  if (!supabase || !calculatedRecords || !calculatedRecords.length) {
    return { success: false, count: 0, error: 'No records to import or Supabase unavailable.' }
  }

  try {
    // 1. Prepare performance records for upsert on student_course_performance
    const perfPayload = calculatedRecords.map((rec) => ({
      student_id: rec.studentDbId,
      course_id: rec.courseDbId,
      theory_score: rec.theory,
      practical_score: rec.practical,
      hands_on_score: rec.handsOn,
      project_score: rec.project,
      updated_at: new Date().toISOString()
    }))

    const { data: perfSaved, error: perfErr } = await supabase
      .from('student_course_performance')
      .upsert(perfPayload, { onConflict: 'student_id,course_id' })

    if (perfErr) {
      console.warn('Upsert on student_course_performance returned error/warning:', perfErr)
    }

    // 2. Prepare competency analysis result records
    const analysisPayload = calculatedRecords.map((rec) => ({
      student_id: rec.studentDbId,
      course_id: rec.courseDbId,
      policy_id: rec.policyId || null,
      band_id: rec.bandId || null,
      competency_score: rec.competencyScore,
      percentile: rec.percentile,
      reference_credits: rec.referenceCredits,
      credits_awarded: rec.dynamicCredits,
      credit_difference: rec.creditDifference,
      details: rec.details ?? {},
      calculated_at: new Date().toISOString()
    }))

    const { error: analysisErr } = await supabase
      .from('competency_analysis_results')
      .insert(analysisPayload)

    if (analysisErr) {
      // Fallback if competency_analysis_results table does not exist
      await supabase.from('competency_results').insert(analysisPayload).catch(() => {})
    }

    // 3. Log data import batch record if userAuthId provided
    if (userAuthId) {
      await supabase.from('data_import_batches').insert({
        import_type: 'student_performance',
        file_name: fileName,
        uploaded_by: userAuthId,
        total_rows: calculatedRecords.length,
        successful_rows: calculatedRecords.length,
        failed_rows: 0,
        status: 'completed',
        metadata: { imported_at: new Date().toISOString(), records_count: calculatedRecords.length }
      }).catch(() => {})
    }

    return {
      success: true,
      count: calculatedRecords.length,
      error: null
    }
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err.message || 'An error occurred during database persistence.'
    }
  }
}