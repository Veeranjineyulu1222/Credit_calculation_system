# Python RAG Backend & Local AI Pipeline Architecture

Production-quality local RAG system built with Python FastAPI, Supabase PostgreSQL, `pgvector`, `sentence-transformers`, and `Ollama`.

---

## 1. Architecture Overview

```
React/Vite Frontend
        ↓ (HTTP / REST)
Python FastAPI Backend (/api/rag/chat, /api/rag/conversations, /api/health)
        ↓
Server-Side Supabase Authentication & RLS Role Validation
        ↓
Query Classifier (Deterministic Intent & Follow-up Resolution)
   ┌───────────────────────────┬───────────────────────────┐
   │ Structured SQL Retrieval   │ Vector Similarity Search  │
   │ (Supabase PostgreSQL DB)  │ (pgvector + Embedding)    │
   └───────────────────────────┴───────────────────────────┘
                ↓
          Context Builder & Injection-Defended Prompt
                ↓
          LLM Provider Abstraction (Ollama Local Inference)
                ↓
          Grounded Answer & Deduplicated Source Metadata
                ↓
          Supabase Chat History Persistence
```

---

## 2. Environment Setup & Configuration

1. **Python Environment**:
   - Python version: `3.11+`
   - Dependencies: `fastapi`, `uvicorn`, `pydantic-settings`, `supabase`, `sentence-transformers`, `httpx`, `pypdf`, `torch`

2. **Environment File (`.env`)**:
   ```env
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sbp_...
   SUPABASE_SERVICE_ROLE_KEY=ey...

   LLM_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=mistral

   EMBEDDING_PROVIDER=sentence_transformers
   EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
   VECTOR_TOP_K=5
   ```

---

## 3. Database & pgvector Setup

Run the SQL migration in Supabase SQL Editor:
- [`supabase/migrations/014_rag_documents_pgvector.sql`](file:///e:/credit_calculation_system/supabase/migrations/014_rag_documents_pgvector.sql)

This enables the `vector` extension and creates the `public.rag_documents` vector index table with HNSW indexing and RLS security policies.

---

## 4. Ingestion Command (Indexing Curriculum PDFs)

To chunk and index curriculum PDF documents locally into `pgvector`:
```bash
python python_rag/ingestion/curriculum_ingest.py
```

---

## 5. Running the Complete Application locally

1. **Start Ollama & Pull Model**:
   ```bash
   ollama serve
   ollama pull mistral
   ```

2. **Start Python FastAPI RAG Server**:
   ```bash
   cd python_rag
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

3. **Start Vite React Frontend**:
   ```bash
   npm run dev
   ```

4. **Run Python RAG Automated Tests**:
   ```bash
   python python_rag/tests/test_rag.py
   ```

---

## 6. Security & Prompt Injection Protections

- **Server-side Auth Resolution**: User identity and role (`student` vs `faculty`) are resolved directly from Supabase JWT tokens server-side.
- **Student Authorization Isolation**: Students can ONLY access their own records (`student_id`).
- **Prompt Injection Defense**: Retrieved document text is treated as data in structured JSON blocks.
- **Dynamic Credit Protection**: System prompts strictly forbid the LLM from generating or modifying official dynamic credits.
