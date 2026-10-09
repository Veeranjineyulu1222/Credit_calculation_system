from typing import Dict, Any, List

class ContextBuilder:
    @staticmethod
    def build(user_info: Dict[str, Any], hybrid_results: Dict[str, Any]) -> Dict[str, Any]:
        sql_data = hybrid_results.get("sql_data", {})
        vector_docs = hybrid_results.get("vector_docs", [])
        
        # Build concise structured context blocks
        student_context = {}
        if sql_data.get("student_profile"):
            sp = sql_data["student_profile"]
            student_context = {
                "program": sp.get("program"),
                "batch_year": sp.get("batch_year"),
                "semester": sp.get("current_semester"),
                "cgpa": sp.get("cgpa"),
                "credits_earned": sp.get("credits_earned")
            }
            
        completed_courses = []
        for c in sql_data.get("completed_courses", []):
            completed_courses.append({
                "course_code": c.get("course_code"),
                "course_name": c.get("course_name"),
                "credits": c.get("credits"),
                "grade": c.get("grade"),
                "semester": c.get("semester")
            })
            
        official_credits = []
        for r in sql_data.get("official_credit_results", []):
            official_credits.append({
                "course_id": r.get("course_id"),
                "competency_score": r.get("competency_score"),
                "percentile": r.get("percentile"),
                "reference_credits": r.get("reference_credits"),
                "credits_awarded": r.get("credits_awarded"),
                "credit_difference": r.get("credit_difference"),
                "calculated_at": r.get("calculated_at")
            })
            
        retrieved_curriculum = []
        for doc in vector_docs:
            meta = doc.get("metadata") or {}
            retrieved_curriculum.append({
                "document_type": doc.get("document_type"),
                "section": meta.get("section"),
                "page": meta.get("page_number"),
                "content": doc.get("content")
            })

        return {
            "student_profile": student_context,
            "completed_courses": completed_courses[:20],
            "performance_records": sql_data.get("performance", [])[:20],
            "official_dynamic_credit_results": official_credits[:10],
            "relevant_courses": sql_data.get("courses", [])[:8],
            "course_outcomes": sql_data.get("course_outcomes", [])[:20],
            "retrieved_curriculum_documents": retrieved_curriculum[:5]
        }
