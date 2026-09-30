import { supabase } from '../lib/supabase'

export async function getCourseOutcomes(courseId) {
  if (!supabase) return { data: [], error: null }
  return supabase.from('course_outcomes').select('id, course_id, co_code, co_description, theory_percentage, practical_percentage, hands_on_percentage, project_percentage, hours, evidence').eq('course_id', courseId).order('co_code')
}