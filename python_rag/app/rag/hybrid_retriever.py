from typing import Dict, Any, List
from supabase import Client
from app.rag.sql_retriever import SQLRetriever
from app.rag.vector_retriever import VectorRetriever

class HybridRetriever:
    @staticmethod
    def retrieve(supabase: Client, user_info: Dict[str, Any], plan: Dict[str, Any], raw_question: str) -> Dict[str, Any]:
        # 1. SQL Retrieval for authoritative structured records
        sql_data = SQLRetriever.retrieve(supabase, user_info, plan)
        
        # 2. Vector Retrieval for semantic content (curriculum, descriptions, policies)
        vector_docs = []
        if plan.get("semantic", True):
            query_str = " ".join(plan.get("terms", [])) or raw_question
            vector_docs = VectorRetriever.retrieve(supabase, query_str)
            
        # 3. Hybrid Merge and Source Metadata Formatting
        sources = []
        
        # Completed courses sources
        for course in sql_data.get("completed_courses", []):
            sources.append({
                "type": "completed_course",
                "label": "Completed Course",
                "course_code": course.get("course_code"),
                "course_name": course.get("course_name"),
                "grade": course.get("grade"),
                "credits": course.get("credits"),
                "semester": course.get("semester")
            })
            
        # SQL Course sources
        for course in sql_data.get("courses", []):
            sources.append({
                "type": "course",
                "label": "Course Information",
                "course_code": course.get("course_code"),
                "course_name": course.get("course_name")
            })
            
        # SQL Course outcome sources
        for outcome in sql_data.get("course_outcomes", []):
            matched_course = next((c for c in sql_data.get("courses", []) if c.get("id") == outcome.get("course_id")), None)
            sources.append({
                "type": "course_outcome",
                "label": "Course Outcome",
                "course_code": matched_course.get("course_code") if matched_course else None,
                "outcome": outcome.get("co_code"),
                "description": outcome.get("co_description")
            })
            
        # Vector Semantic Document sources
        for doc in vector_docs:
            meta = doc.get("metadata") or {}
            sources.append({
                "type": doc.get("document_type", "curriculum_doc"),
                "label": meta.get("section") or "Curriculum Vector Document",
                "course_code": meta.get("course_code"),
                "page": meta.get("page_number"),
                "content_snippet": doc.get("content", "")[:200]
            })
            
        # Performance and Analysis metrics sources
        if sql_data.get("performance"):
            sources.append({
                "type": "performance",
                "label": "Component Performance Data",
                "count": len(sql_data["performance"])
            })
        if sql_data.get("official_credit_results"):
            sources.append({
                "type": "competency_analysis",
                "label": "Official Dynamic Credit Analysis",
                "count": len(sql_data["official_credit_results"])
            })

        return {
            "retrieval_plan": plan,
            "sql_data": sql_data,
            "vector_docs": vector_docs,
            "sources": sources
        }
