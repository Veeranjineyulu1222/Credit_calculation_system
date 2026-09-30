import { supabase } from '../lib/supabase'

const courseFields = 'id, course_code, course_name, department, semester, course_type, reference_credits, min_credits, max_credits, competency_required, status, theory_percentage, practical_percentage, hands_on_percentage, project_percentage'

export async function getCourses() {
  if (!supabase) return { data: [], error: null }
  return supabase.from('courses').select(courseFields).order('course_code')
}

export async function getCourse(courseId) {
  if (!supabase) return { data: null, error: null }
  return supabase.from('courses').select(courseFields).eq('id', courseId).single()
}