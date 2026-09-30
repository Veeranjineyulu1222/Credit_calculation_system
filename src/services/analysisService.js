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
  const result = await supabase.from('competency_results').select('*')
  return result
}

export function calculateCompetencyScore(course, scores) {
  if (!course || !scores) return null
  return ((scores.theory * course.theory_percentage) + (scores.practical * course.practical_percentage) + (scores.handsOn * course.hands_on_percentage) + (scores.project * course.project_percentage)) / 100
}

export function findCreditBand(bands, referenceCredits, percentile) {
  return bands.find((band) => Number(band.reference_credits) === Number(referenceCredits) && percentile >= Number(band.percentile_min) && percentile <= Number(band.percentile_max)) ?? null
}