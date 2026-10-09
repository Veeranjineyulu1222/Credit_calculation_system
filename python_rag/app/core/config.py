import os
from pathlib import Path
from dotenv import load_dotenv

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings

# Ensure root workspace .env is loaded
# __file__ is python_rag/app/core/config.py
# parent = app/core, parent.parent = app, parent.parent.parent = python_rag, parent.parent.parent.parent = workspace_root
env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "CSP Competency Credit RAG API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    @property
    def SUPABASE_URL(self) -> str:
        return os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")

    @property
    def SUPABASE_ANON_KEY(self) -> str:
        return os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

    @property
    def SUPABASE_SERVICE_ROLE_KEY(self) -> str:
        return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def LLM_PROVIDER(self) -> str:
        return os.getenv("LLM_PROVIDER", "openrouter")

    @property
    def OLLAMA_BASE_URL(self) -> str:
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    @property
    def OLLAMA_MODEL(self) -> str:
        return os.getenv("OLLAMA_MODEL", "mistral")

    @property
    def OPENROUTER_API_KEY(self) -> str:
        return os.getenv("OPENROUTER_API_KEY", "")

    @property
    def OPENROUTER_MODEL(self) -> str:
        return os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")

    @property
    def OPENROUTER_SITE_URL(self) -> str:
        return os.getenv("OPENROUTER_SITE_URL", "https://creditcalculationsystem.vercel.app")

    LLM_TEMPERATURE: float = 0.2
    LLM_MAX_TOKENS: int = 700

    # Embedding Configuration
    EMBEDDING_PROVIDER: str = "sentence_transformers"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    VECTOR_TOP_K: int = 5
    VECTOR_SIMILARITY_THRESHOLD: float = 0.3

    # RAG Settings
    RAG_MAX_CONTEXT_CHUNKS: int = 8
    DEBUG_MODE: bool = False

    class Config:
        env_file = str(env_path)
        extra = "ignore"

settings = Settings()
