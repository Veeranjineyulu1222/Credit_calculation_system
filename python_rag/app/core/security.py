from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings

security_scheme = HTTPBearer(auto_error=False)

def get_supabase_client(access_token: Optional[str] = None) -> Client:
    """
    Returns a Supabase client.
    If access_token is provided, attaches the Authorization header to respect RLS.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(status_code=503, detail="Supabase server configuration is missing.")
    
    headers = {}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    if access_token:
        client.postgrest.auth(access_token)
    return client

def get_service_role_client() -> Client:
    """
    Returns a Supabase client initialized with the service role key for administrative RAG ingestion operations.
    """
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    return create_client(settings.SUPABASE_URL, key)

async def get_authenticated_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme)) -> Dict[str, Any]:
    """
    Validates Supabase JWT access token server-side and resolves the authenticated user profile and role.
    Fallback resolution maps student registration numbers from auth email/metadata if user_profiles link is missing.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")
    
    token = credentials.credentials
    supabase = get_supabase_client(token)
    service_client = get_service_role_client()
    
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Authentication required.")
        user = user_response.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Authentication required or session expired.")
    
    role = "student"
    student_uuid = None
    student_reg_no = None

    # 1. Check user_profiles table
    try:
        profile_res = service_client.table("user_profiles").select("role, student_id").eq("user_id", user.id).maybe_single().execute()
        profile = profile_res.data if profile_res else None
        if profile:
            role = profile.get("role", "student")
            student_uuid = str(profile.get("student_id")) if profile.get("student_id") else None
    except Exception as e:
        print(f"[Security User Profile Lookup Warning] {e}")

    # 2. If student role and student_uuid is not set, resolve via student_id (registration number) or email
    if role == "student" and not student_uuid:
        reg_number = None
        if user.user_metadata and isinstance(user.user_metadata, dict):
            reg_number = user.user_metadata.get("register_number")
        
        if not reg_number and user.email:
            reg_number = user.email.split("@")[0].strip()

        if reg_number:
            try:
                # Query students table by registration number (student_id column)
                stud_res = service_client.table("students").select("id, student_id").eq("student_id", str(reg_number)).maybe_single().execute()
                if stud_res and stud_res.data:
                    student_uuid = str(stud_res.data["id"])
                    student_reg_no = str(stud_res.data["student_id"])
            except Exception as st_err:
                print(f"[Security Student Lookup Warning] {st_err}")

    # If role is faculty, allow access without student_id
    if role == "faculty":
        return {
            "user_id": str(user.id),
            "email": user.email,
            "role": "faculty",
            "student_id": None,
            "token": token
        }

    return {
        "user_id": str(user.id),
        "email": user.email,
        "role": "student",
        "student_id": student_uuid,
        "student_reg_no": student_reg_no,
        "token": token
    }
