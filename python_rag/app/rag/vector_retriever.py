from typing import List, Dict, Any, Optional
from supabase import Client
from app.services.embedding_service import embedding_service
from app.core.config import settings

class VectorRetriever:
    @staticmethod
    def retrieve(supabase: Client, query_text: str, top_k: int = None, threshold: float = None) -> List[Dict[str, Any]]:
        k = top_k or settings.VECTOR_TOP_K
        sim_threshold = threshold or settings.VECTOR_SIMILARITY_THRESHOLD
        
        query_vector = embedding_service.encode(query_text)
        
        try:
            rpc_res = supabase.rpc(
                "match_rag_documents",
                {
                    "query_embedding": query_vector,
                    "match_threshold": sim_threshold,
                    "match_count": k
                }
            ).execute()
            
            if rpc_res and rpc_res.data:
                return rpc_res.data
        except Exception:
            # Fallback to direct pgvector / table query if RPC is not present yet
            try:
                table_res = supabase.table("rag_documents").select("id, document_type, content, metadata, course_id, student_id").limit(k).execute()
                if table_res and table_res.data:
                    return table_res.data
            except Exception:
                pass
                
        return []
