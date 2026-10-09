from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ChatRequest(BaseModel):
    question: str = Field(..., max_length=1200)
    conversation_id: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = []

class SourceItem(BaseModel):
    type: str
    label: Optional[str] = None
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    grade: Optional[str] = None
    credits: Optional[float] = None
    semester: Optional[int] = None
    page: Optional[int] = None
    outcome: Optional[str] = None
    count: Optional[int] = None

class RetrievalInfo(BaseModel):
    category: str
    queryType: str
    retrievalMode: str
    sql: bool
    semantic: bool

class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    retrieval: RetrievalInfo
    sources: List[Dict[str, Any]]

class ConversationMessage(BaseModel):
    role: str
    content: str
    created_at: str

class ConversationSession(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str

class ConversationDetailResponse(BaseModel):
    conversation: Dict[str, Any]
    messages: List[Dict[str, Any]]

class ConversationsListResponse(BaseModel):
    conversations: List[Dict[str, Any]]
