from typing import Dict, Any, List
from supabase import Client
from app.rag.query_classifier import QueryClassifier
from app.rag.hybrid_retriever import HybridRetriever
from app.rag.context_builder import ContextBuilder
from app.rag.prompt_builder import PromptBuilder
from app.services.llm_service import llm_service

def sanitize_answer(answer: str) -> str:
    if not answer or not isinstance(answer, str):
        return "I could not find enough authoritative information in the available academic records to answer that reliably."
    ans = answer.strip()
    ans_lower = ans.lower()
    for sensitive in ["supabase_service_role_key", "openrouter_api_key", "bearer", "access_token", "secret"]:
        if sensitive in ans_lower:
            return "I could not find enough authoritative information in the available academic records to answer that reliably."
    return ans

class AnswerGenerator:
    @staticmethod
    async def generate_answer(
        supabase: Client,
        user_info: Dict[str, Any],
        question: str,
        history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        role = user_info.get("role", "student")
        
        # 1. Query Classification & Intent Detection
        plan = QueryClassifier.classify(question, history, role=role)
        
        # 2. Hybrid SQL + Vector Retrieval
        hybrid_results = HybridRetriever.retrieve(supabase, user_info, plan, question)
        
        # 3. Context Construction
        context = ContextBuilder.build(user_info, hybrid_results)
        
        # 4. Prompt Building with Injection Defenses
        sys_prompt, user_prompt = PromptBuilder.build(context, history, plan["resolvedQuestion"])
        
        # 5. LLM Answer Generation
        raw_answer = await llm_service.generate(sys_prompt, user_prompt)
        final_answer = sanitize_answer(raw_answer)
        
        return {
            "answer": final_answer,
            "retrieval": {
                "category": plan["category"],
                "queryType": plan["queryType"],
                "retrievalMode": plan["retrievalMode"],
                "sql": plan["sql"],
                "semantic": plan["semantic"]
            },
            "sources": hybrid_results["sources"]
        }
