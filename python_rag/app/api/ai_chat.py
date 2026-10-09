import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.security import get_authenticated_user, get_supabase_client, get_service_role_client
from app.services.llm_service import llm_service

router = APIRouter(prefix="/ai", tags=["AI Insights"])

class DirectAiChatRequest(BaseModel):
    question: str = Field(..., max_length=1200)
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

class DirectAiChatResponse(BaseModel):
    answer: str
    student_id: Optional[str] = None
    role: str

@router.post("/chat", response_model=DirectAiChatResponse)
async def ai_chat_endpoint(
    request: DirectAiChatRequest,
    user_info: Dict[str, Any] = Depends(get_authenticated_user)
):
    """
    Dedicated Direct AI Chat Endpoint for AI Insights.
    Grounded strictly in authenticated student database records from Supabase.
    Completely isolated from vector search / pgvector / RAG.
    """
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    role = user_info["role"]
    student_uuid = user_info.get("student_id")
    student_reg_no = user_info.get("student_reg_no") or "N/A"
    user_id = user_info["user_id"]
    token = user_info["token"]

    print("\n[AI DEBUG]")
    print(f"Authenticated user ID: {user_id}")
    print(f"Student ID: {student_reg_no} (UUID: {student_uuid})")
    print("[/AI DEBUG]\n")

    context_obj: Dict[str, Any] = {}
    courses_count = 0
    credits_retrieved = 0
    competencies_count = 0
    cos_count = 0
    student_record_found = False

    try:
        # Use administrative service client for database queries once user session is verified server-side
        db_client = get_service_role_client()

        if role == "student":
            # If student_uuid wasn't resolved by UUID, attempt resolution by registration number
            if not student_uuid and student_reg_no != "N/A":
                lookup_res = db_client.table("students").select("id, student_id").eq("student_id", student_reg_no).maybe_single().execute()
                if lookup_res and lookup_res.data:
                    student_uuid = str(lookup_res.data["id"])

            if not student_uuid:
                print("[AI CONTEXT DEBUG] No student UUID found for authenticated user.")
                return DirectAiChatResponse(
                    answer="I couldn't find academic records for your account yet.",
                    student_id=student_reg_no,
                    role=role
                )

            # 1. Query 'students' table
            student_res = db_client.table("students").select(
                "id, student_id, student_name, program, batch_year, current_semester, cgpa, credits_earned"
            ).eq("id", student_uuid).maybe_single().execute()
            
            student_record = student_res.data if student_res and student_res.data else {}
            if student_record:
                student_record_found = True
                student_reg_no = student_record.get("student_id") or student_reg_no
                credits_retrieved = student_record.get("credits_earned") or 0

            # 2. Query 'student_records' table for completed courses
            acad_res = db_client.table("student_records").select("completed_courses").eq("student_id", student_uuid).maybe_single().execute()
            completed_courses = (acad_res.data.get("completed_courses", []) if (acad_res and acad_res.data) else [])
            courses_count = len(completed_courses)

            # 3. Query 'student_course_performance' with joined course info
            perf_res = db_client.table("student_course_performance").select(
                "course_id, theory_score, practical_score, hands_on_score, project_score"
            ).eq("student_id", student_uuid).execute()
            
            perf_data = perf_res.data if perf_res and perf_res.data else []
            
            # Fetch catalog courses to map details
            course_ids = list(set([p["course_id"] for p in perf_data if p.get("course_id")]))
            courses_map = {}
            if course_ids:
                c_res = db_client.table("courses").select(
                    "id, course_code, course_name, theory_percentage, practical_percentage, hands_on_percentage, project_percentage, reference_credits"
                ).in_("id", course_ids).execute()
                if c_res and c_res.data:
                    courses_map = {c["id"]: c for c in c_res.data}

            component_performances = []
            for p in perf_data:
                cid = p.get("course_id")
                c_info = courses_map.get(cid, {})
                component_performances.append({
                    "course_code": c_info.get("course_code", "N/A"),
                    "course_name": c_info.get("course_name", "N/A"),
                    "theory_score": p.get("theory_score"),
                    "practical_score": p.get("practical_score"),
                    "hands_on_score": p.get("hands_on_score"),
                    "project_score": p.get("project_score"),
                    "component_weights": {
                        "theory_pct": c_info.get("theory_percentage"),
                        "practical_pct": c_info.get("practical_percentage"),
                        "hands_on_pct": c_info.get("hands_on_percentage"),
                        "project_pct": c_info.get("project_percentage")
                    }
                })

            # 4. Query 'competency_analysis_results'
            comp_res = db_client.table("competency_analysis_results").select(
                "course_id, competency_score, percentile, reference_credits, credits_awarded, credit_difference, calculated_at"
            ).eq("student_id", student_uuid).order("calculated_at", desc=True).execute()
            
            comp_data = comp_res.data if comp_res and comp_res.data else []
            competencies_count = len(comp_data)

            competency_results = []
            for comp in comp_data:
                cid = comp.get("course_id")
                c_info = courses_map.get(cid, {})
                competency_results.append({
                    "course_code": c_info.get("course_code", "N/A"),
                    "course_name": c_info.get("course_name", "N/A"),
                    "competency_score": comp.get("competency_score"),
                    "percentile": comp.get("percentile"),
                    "reference_credits": comp.get("reference_credits"),
                    "credits_awarded": comp.get("credits_awarded"),
                    "credit_difference": comp.get("credit_difference")
                })

            # 5. Query 'course_outcomes' for relevant courses
            course_outcomes = []
            if course_ids:
                co_res = db_client.table("course_outcomes").select(
                    "course_id, co_code, co_description, theory_percentage, practical_percentage, hands_on_percentage, project_percentage"
                ).in_("course_id", course_ids).execute()
                if co_res and co_res.data:
                    cos_count = len(co_res.data)
                    for co in co_res.data:
                        cid = co.get("course_id")
                        c_info = courses_map.get(cid, {})
                        course_outcomes.append({
                            "course_code": c_info.get("course_code", "N/A"),
                            "co_code": co.get("co_code"),
                            "description": co.get("co_description"),
                            "weights": {
                                "theory": co.get("theory_percentage"),
                                "practical": co.get("practical_percentage"),
                                "hands_on": co.get("hands_on_percentage"),
                                "project": co.get("project_percentage")
                            }
                        })

            # Assemble structured context object
            context_obj = {
                "student": {
                    "student_id": student_record.get("student_id") or student_reg_no,
                    "name": student_record.get("student_name"),
                    "program": student_record.get("program"),
                    "batch_year": student_record.get("batch_year"),
                    "current_semester": student_record.get("current_semester")
                },
                "academic_summary": {
                    "completed_credits": student_record.get("credits_earned"),
                    "official_cgpa": student_record.get("cgpa")
                },
                "completed_courses": completed_courses,
                "course_component_performance": component_performances,
                "competency_analysis": competency_results,
                "course_outcomes": course_outcomes
            }

        elif role == "faculty":
            courses_res = db_client.table("courses").select(
                "course_code, course_name, department, reference_credits, theory_percentage, practical_percentage, hands_on_percentage, project_percentage"
            ).limit(20).execute()
            courses = courses_res.data if courses_res and courses_res.data else []
            context_obj = {
                "faculty_role": "University Faculty Member",
                "curriculum_courses": courses
            }

    except Exception as db_err:
        print(f"[AI Context DB Query Error] {db_err}")
        context_obj = {"error": "Failed to query authenticated database records.", "role": role}

    # Development Debug Output
    print("AI CONTEXT DEBUG")
    print("----------------")
    print(f"Authenticated Student ID: {student_reg_no} ({student_uuid})")
    print(f"Student record found: {student_record_found}")
    print(f"Courses found: {courses_count}")
    print(f"Competency records found: {competencies_count}")
    print(f"Credits found: {credits_retrieved}")
    print(f"Course outcomes found: {cos_count}")
    print("----------------\n")

    # Handle No-Data Case gracefully before asking OpenRouter
    if role == "student" and not student_record_found and courses_count == 0 and competencies_count == 0:
        return DirectAiChatResponse(
            answer="I couldn't find academic records for your account yet.",
            student_id=student_reg_no,
            role=role
        )

    # Convert context object to clean formatted JSON string for LLM
    context_str = json.dumps(context_obj, indent=2)

    # Build Strict Anti-Hallucination System Prompt
    system_prompt = (
        "You are the Academic AI Assistant for a university competency-based credit system.\n\n"
        "The application provides you with AUTHORITATIVE DATA belonging to the currently authenticated student.\n"
        "Use ONLY the STUDENT ACADEMIC CONTEXT supplied below.\n\n"
        "STRICT ANTI-HALLUCINATION RULES:\n"
        "1. You must not invent or assume academic information.\n"
        "2. Never invent courses, course codes, grades, marks, credits, CGPA, competencies, competency scores, Course Outcomes, or student achievements.\n"
        "3. If a requested value exists in STUDENT ACADEMIC CONTEXT, use it.\n"
        "4. If a requested value or question topic does not exist in STUDENT ACADEMIC CONTEXT, clearly say that it is not available in the current academic records.\n"
        "5. The database and application calculations are the source of truth.\n"
        "6. Your role is to explain the supplied academic data in a clear, concise, and structured manner using bullet points.\n"
        "7. When discussing competency strengths or weaknesses, use the competency results supplied by the application.\n"
        "8. When discussing courses, only mention courses present in the student's records.\n"
        "9. Do not fabricate examples and present them as student data."
    )

    formatted_prompt = (
        f"STUDENT ACADEMIC CONTEXT:\n{context_str}\n\n"
        f"QUESTION:\n{question}"
    )

    # Call OpenRouter LLM Service
    try:
        answer = await llm_service.generate(system_prompt, formatted_prompt)
        if not answer:
            answer = "I analyzed your academic record, but no specific response was generated."
    except Exception as llm_err:
        print(f"[AI Chat Endpoint Error] {llm_err}")
        raise HTTPException(status_code=500, detail=f"AI Assistant error: {str(llm_err)}")

    return DirectAiChatResponse(
        answer=answer,
        student_id=student_reg_no,
        role=role
    )


