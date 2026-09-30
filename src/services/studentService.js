import { supabase } from '../lib/supabase'

const studentFields = 'id, student_id, student_name, program, batch_year, current_semester, cgpa, credits_earned, credits_studied, credits_to_be_earned, arrears_count, status'

export async function getStudent(studentId) {
  if (!supabase || !studentId) return { data: null, error: null }
  return supabase.from('students').select(studentFields).eq('id', studentId).single()
}

export async function getStudents(filters = {}) {
  if (!supabase) return { data: [], error: null, count: 0 }
  let query = supabase.from('students').select(studentFields, { count: 'exact' }).order('student_name')
  if (filters.program) query = query.eq('program', filters.program)
  if (filters.batch) query = query.eq('batch_year', filters.batch)
  if (filters.semester) query = query.eq('current_semester', filters.semester)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.search) query = query.or(`student_name.ilike.%${filters.search}%,student_id.ilike.%${filters.search}%`)
  return query.range(filters.from ?? 0, filters.to ?? 49)
}

export async function getStudentRecord(studentId) {
  if (!supabase || !studentId) return { data: null, error: null }
  return supabase.from('student_records').select('id, student_id, completed_courses, created_at, updated_at').eq('student_id', studentId).maybeSingle()
}