from datetime import datetime
from typing import Dict, Any, List, Optional
from supabase import Client

class ConversationService:
    @staticmethod
    def get_or_create_session(supabase: Client, user_info: Dict[str, Any], conversation_id: Optional[str], initial_title: str) -> Dict[str, Any]:
        user_id = user_info["user_id"]
        role = user_info["role"]
        student_id = user_info["student_id"] if role == "student" else None
        
        if conversation_id:
            query = supabase.table("chat_sessions").select("id, title").eq("id", conversation_id).eq("user_id", user_id)
            if role == "student":
                query = query.eq("student_id", student_id)
            else:
                query = query.is_("student_id", "null")
            res = query.maybe_single().execute()
            if res and res.data:
                return res.data
            raise ValueError("Conversation session not found or unauthorized.")
            
        # Create new session
        insert_data = {
            "user_id": user_id,
            "title": initial_title[:80] if initial_title else "Competency conversation"
        }
        if role == "student":
            insert_data["student_id"] = student_id
            
        res = supabase.table("chat_sessions").insert(insert_data).execute()
        if res and res.data:
            return res.data[0]
        raise RuntimeError("Failed to create new conversation session.")

    @staticmethod
    def fetch_conversation_history(supabase: Client, session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        res = supabase.table("chat_messages").select("role, content, created_at").eq("session_id", session_id).order("created_at", desc=True).limit(limit).execute()
        messages = res.data if res and res.data else []
        messages.reverse()
        return messages

    @staticmethod
    def save_message(supabase: Client, session_id: str, role: str, content: str):
        supabase.table("chat_messages").insert({
            "session_id": session_id,
            "role": role,
            "content": content
        }).execute()
        
    @staticmethod
    def touch_session(supabase: Client, session_id: str):
        supabase.table("chat_sessions").update({
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", session_id).execute()

    @staticmethod
    def list_user_sessions(supabase: Client, user_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        query = supabase.table("chat_sessions").select("id, title, created_at, updated_at").eq("user_id", user_info["user_id"]).order("updated_at", desc=True).limit(30)
        if user_info["role"] == "student":
            query = query.eq("student_id", user_info["student_id"])
        else:
            query = query.is_("student_id", "null")
        res = query.execute()
        return res.data if res and res.data else []
