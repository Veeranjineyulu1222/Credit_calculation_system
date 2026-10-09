from typing import Dict, Any, List
from supabase import Client

class SQLRetriever:
    @staticmethod
    def retrieve(supabase: Client, user_info: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
        role = user_info.get("role")
        student_id = user_info.get("student_id")
        category = plan.get("category")
        eff_category = plan.get("inheritedCategory") or category
        
        result = {
            "student_profile": None,
            "completed_courses": [],
            "performance": [],
            "official_credit_results": [],
            "courses": [],
            "course_outcomes": []
        }

        # 1. Student Profile & History
        if role == "student" and student_id:
            try:
                stu_res = supabase.table("students").select("program, batch_year, current_semester, cgpa, credits_earned").eq("id", student_id).maybe_single().execute()
                if stu_res and stu_res.data:
                    result["student_profile"] = stu_res.data
            except Exception:
                pass

            if category in ['academic_history', 'grades', 'credits', 'competency', 'course_outcomes', 'follow_up'] or eff_category in ['academic_history', 'grades', 'credits', 'competency', 'course_outcomes']:
                try:
                    rec_res = supabase.table("student_records").select("completed_courses").eq("student_id", student_id).maybe_single().execute()
                    if rec_res and rec_res.data and isinstance(rec_res.data.get("completed_courses"), list):
                        result["completed_courses"] = rec_res.data["completed_courses"][:100]
                except Exception:
                    pass

        # 2. Performance
        if role == "student" and student_id and (category in ['performance', 'follow_up'] or eff_category == 'performance'):
            try:
                perf_res = supabase.table("student_course_performance").select("course_id, theory_score, practical_score, hands_on_score, project_score").eq("student_id", student_id).limit(50).execute()
                if perf_res and perf_res.data:
                    result["performance"] = perf_res.data
            except Exception:
                pass
        elif role == "faculty" and (category in ['faculty_performance', 'faculty_aggregate', 'follow_up'] or eff_category in ['faculty_performance', 'faculty_aggregate']):
            try:
                perf_res = supabase.table("student_course_performance").select("student_id, course_id, theory_score, practical_score, hands_on_score, project_score").limit(200).execute()
                if perf_res and perf_res.data:
                    result["performance"] = perf_res.data
            except Exception:
                pass

        # 3. Official Dynamic Credit Results
        if role == "student" and student_id and (category in ['dynamic_credit', 'competency', 'follow_up'] or eff_category in ['dynamic_credit', 'competency']):
            try:
                cred_res = supabase.table("competency_analysis_results").select("course_id, competency_score, percentile, reference_credits, credits_awarded, credit_difference, calculated_at").eq("student_id", student_id).order("calculated_at", desc=True).limit(50).execute()
                if cred_res and cred_res.data:
                    result["official_credit_results"] = cred_res.data
            except Exception:
                pass
        elif role == "faculty" and (category in ['faculty_competency', 'faculty_dynamic_credit', 'faculty_student_analysis', 'follow_up'] or eff_category in ['faculty_competency', 'faculty_dynamic_credit', 'faculty_student_analysis']):
            try:
                cred_res = supabase.table("competency_analysis_results").select("student_id, course_id, competency_score, percentile, reference_credits, credits_awarded, credit_difference, calculated_at").order("calculated_at", desc=True).limit(200).execute()
                if cred_res and cred_res.data:
                    result["official_credit_results"] = cred_res.data
            except Exception:
                pass

        # 4. Keyword Course Search (Fallback or structured query)
        if plan.get("terms"):
            try:
                query = supabase.table("courses").select("id, course_code, course_name, department, semester, course_type, reference_credits, competency_required").limit(8)
                filters = []
                for term in plan["terms"]:
                    t_safe = "".join(c for c in term if c.isalnum() or c in ['&', '+', '-'])
                    if t_safe:
                        filters.extend([f"course_code.ilike.%{t_safe}%", f"course_name.ilike.%{t_safe}%", f"department.ilike.%{t_safe}%"])
                if filters:
                    query = query.or_(",".join(filters))
                courses_res = query.execute()
                if courses_res and courses_res.data:
                    result["courses"] = courses_res.data
            except Exception:
                pass

        # 5. Course Outcomes for matched courses
        if result["courses"]:
            c_ids = [c["id"] for c in result["courses"] if c.get("id")]
            if c_ids:
                try:
                    co_res = supabase.table("course_outcomes").select("course_id, co_code, co_description, evidence").in_("course_id", c_ids).limit(40).execute()
                    if co_res and co_res.data:
                        result["course_outcomes"] = co_res.data
                except Exception:
                    pass

        return result
