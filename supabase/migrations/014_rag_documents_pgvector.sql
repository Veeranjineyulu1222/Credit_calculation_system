-- Enable pgvector extension for semantic RAG vector retrieval
create extension if not exists vector;

-- Create rag_documents table for curriculum documents, course outcomes, descriptions, and policies
create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  source_table text,
  source_id uuid,
  student_id uuid references public.students(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(384),
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for similarity search
create index if not exists rag_documents_embedding_hnsw_idx 
  on public.rag_documents using hnsw (embedding vector_cosine_ops);

-- Index for filtering by document_type, source_id, student_id, course_id
create index if not exists rag_documents_lookup_idx 
  on public.rag_documents (document_type, course_id, student_id);

-- Index for content hash deduplication
create index if not exists rag_documents_content_hash_idx 
  on public.rag_documents (content_hash);

alter table public.rag_documents enable row level security;

-- RLS Policy: Authenticated users can read public documents or own student documents; faculty can read all
drop policy if exists "authenticated users read rag documents" on public.rag_documents;
create policy "authenticated users read rag documents"
  on public.rag_documents for select to authenticated
  using (
    public.is_faculty()
    or student_id is null
    or student_id = (select up.student_id from public.user_profiles up where up.user_id = auth.uid())
  );

grant select on public.rag_documents to authenticated;
