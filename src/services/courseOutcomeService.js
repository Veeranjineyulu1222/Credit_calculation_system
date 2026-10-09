import { supabase } from '../lib/supabase'

export async function getCourseOutcomes(courseId) {
  if (!supabase) return { data: [], error: null }
  return supabase
    .from('course_outcomes')
    .select('id, course_id, co_code, co_description, theory_percentage, practical_percentage, hands_on_percentage, project_percentage, hours, evidence')
    .eq('course_id', courseId)
    .order('co_code')
}

export async function getAllCourseOutcomes() {
  if (!supabase) return { data: [], error: null }

  try {
    // 1. Attempt single join query via foreign key
    const { data: joinedData, error: joinError } = await supabase
      .from('course_outcomes')
      .select('id, course_id, co_code, co_description, theory_percentage, practical_percentage, hands_on_percentage, project_percentage, hours, evidence, courses(id, course_code, course_name, department)')
      .order('co_code')

    if (!joinError && joinedData) {
      return { data: joinedData, error: null }
    }

    // 2. Fallback: query course_outcomes and courses separately and merge
    const [coRes, courseRes] = await Promise.all([
      supabase.from('course_outcomes').select('*').order('co_code'),
      supabase.from('courses').select('id, course_code, course_name, department')
    ])

    if (coRes.error) return { data: [], error: coRes.error }

    const coursesMap = new Map((courseRes.data ?? []).map(c => [c.id, c]))
    const merged = (coRes.data ?? []).map(co => ({
      ...co,
      courses: coursesMap.get(co.course_id) ?? null
    }))

    return { data: merged, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}