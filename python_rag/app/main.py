import sys
from pathlib import Path

# Add python_rag directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.chat import router as chat_router
from app.api.ai_chat import router as ai_chat_router
from app.api.health import router as health_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-Quality Python RAG Backend for Competency-Based Dynamic Credit System"
)

# Configure CORS for Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(chat_router, prefix=settings.API_PREFIX)
app.include_router(ai_chat_router, prefix=settings.API_PREFIX)

# Legacy Vercel endpoint compatibility route /api/ai/competency-insights
@app.api_route("/api/ai/competency-insights", methods=["GET", "POST"])
async def legacy_competency_insights_proxy(request: Request):
    from app.api.chat import chat_endpoint, list_conversations
    from app.core.security import get_authenticated_user
    from fastapi.security import HTTPAuthorizationCredentials

    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""
    if not token:
        return Response(content='{"error": "Authentication required."}', status_code=401, media_type="application/json")

    try:
        user_info = await get_authenticated_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
    except Exception as e:
        status_code = getattr(e, "status_code", 401)
        detail = getattr(e, "detail", "Authentication required.")
        return Response(content=f'{{"error": "{detail}"}}', status_code=status_code, media_type="application/json")

    if request.method == "GET":
        conv_id = request.query_params.get("conversation_id")
        res = await list_conversations(conversation_id=conv_id, user_info=user_info)
        import json
        return Response(content=json.dumps(res), status_code=200, media_type="application/json")
    
    # POST
    try:
        body = await request.json()
    except Exception:
        body = {}
        
    question = str(body.get("question", "")).strip()
    if not question:
        return Response(content='{"error": "Enter a question up to 1200 characters."}', status_code=400, media_type="application/json")

    from app.models.schemas import ChatRequest
    chat_req = ChatRequest(
        question=question,
        conversation_id=body.get("conversation_id"),
        history=body.get("history", [])
    )

    res = await chat_endpoint(request=chat_req, user_info=user_info)
    import json
    return Response(content=json.dumps(res.model_dump()), status_code=200, media_type="application/json")
