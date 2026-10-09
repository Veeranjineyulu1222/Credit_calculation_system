from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import get_authenticated_user, get_supabase_client
from app.models.schemas import ChatRequest, ChatResponse
from app.services.conversation_service import ConversationService
from app.rag.answer_generator import AnswerGenerator

router = APIRouter(prefix="/rag", tags=["RAG Chat"])

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, user_info: Dict[str, Any] = Depends(get_authenticated_user)):
    supabase = get_supabase_client(user_info["token"])
    
    # Resolve or create conversation session
    try:
        session = ConversationService.get_or_create_session(
            supabase, user_info, request.conversation_id, request.question
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Unable to initialize competency conversation session.")
        
    session_id = session["id"]
    
    # Save user message
    try:
        ConversationService.save_message(supabase, session_id, "user", request.question)
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to save user message.")
        
    # Fetch recent history for follow-up resolution
    history = ConversationService.fetch_conversation_history(supabase, session_id, limit=6)
    
    # Generate RAG answer
    try:
        rag_output = await AnswerGenerator.generate_answer(supabase, user_info, request.question, history)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error generating AI competency insight response.")
        
    # Save assistant response
    try:
        ConversationService.save_message(supabase, session_id, "assistant", rag_output["answer"])
        ConversationService.touch_session(supabase, session_id)
    except Exception:
        pass
        
    return ChatResponse(
        conversation_id=session_id,
        answer=rag_output["answer"],
        retrieval=rag_output["retrieval"],
        sources=rag_output["sources"]
    )

@router.get("/conversations")
async def list_conversations(
    conversation_id: Optional[str] = Query(None),
    user_info: Dict[str, Any] = Depends(get_authenticated_user)
):
    supabase = get_supabase_client(user_info["token"])
    
    if conversation_id:
        try:
            session = ConversationService.get_or_create_session(supabase, user_info, conversation_id, "")
            messages = ConversationService.fetch_conversation_history(supabase, session["id"], limit=100)
            return {"conversation": session, "messages": messages}
        except Exception:
            raise HTTPException(status_code=404, detail="Conversation session not found.")
            
    sessions = ConversationService.list_user_sessions(supabase, user_info)
    return {"conversations": sessions}
