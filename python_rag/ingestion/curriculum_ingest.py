import os
import hashlib
from typing import List, Dict, Any
from pypdf import PdfReader
from app.services.embedding_service import embedding_service
from app.core.security import get_service_role_client

def extract_pdf_chunks(pdf_path: str, program_name: str, chunk_size: int = 700, chunk_overlap: int = 100) -> List[Dict[str, Any]]:
    if not os.path.exists(pdf_path):
        return []
        
    reader = PdfReader(pdf_path)
    chunks = []
    
    for page_idx, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if not text.strip():
            continue
            
        words = text.split()
        total_words = len(words)
        start = 0
        
        while start < total_words:
            end = min(start + chunk_size, total_words)
            chunk_text = " ".join(words[start:end])
            
            # Generate content hash for idempotency
            content_hash = hashlib.sha256(f"{program_name}_{page_idx}_{start}_{chunk_text}".encode('utf-8')).hexdigest()
            
            chunks.append({
                "program": program_name,
                "page_number": page_idx + 1,
                "content": chunk_text,
                "content_hash": content_hash,
                "metadata": {
                    "program": program_name,
                    "document_type": "curriculum",
                    "source_document": os.path.basename(pdf_path),
                    "page_number": page_idx + 1,
                    "section": f"{program_name} Curriculum Page {page_idx + 1}"
                }
            })
            
            start += (chunk_size - chunk_overlap)
            
    return chunks

def index_curriculum_documents():
    print("Starting curriculum document ingestion pipeline...")
    supabase = get_service_role_client()
    
    pdf_sources = [
        ("CSE 2025 Curriculum.pdf", "CSE"),
        ("AIDS 2025 Curriculum.pdf", "AIDS")
    ]
    
    total_chunks = 0
    total_indexed = 0
    
    for pdf_name, program in pdf_sources:
        pdf_path = os.path.join(os.getcwd(), pdf_name)
        if not os.path.exists(pdf_path):
            pdf_path = os.path.join(os.path.dirname(__file__), "..", pdf_name)
            
        chunks = extract_pdf_chunks(pdf_path, program)
        total_chunks += len(chunks)
        print(f"Extracted {len(chunks)} chunks from {pdf_name}")
        
        for c in chunks:
            vector = embedding_service.encode(c["content"])
            
            payload = {
                "document_type": "curriculum",
                "content": c["content"],
                "content_hash": c["content_hash"],
                "metadata": c["metadata"],
                "embedding": vector
            }
            
            try:
                # Idempotent upsert by content_hash
                existing = supabase.table("rag_documents").select("id").eq("content_hash", c["content_hash"]).maybe_single().execute()
                if existing and existing.data:
                    supabase.table("rag_documents").update(payload).eq("id", existing.data["id"]).execute()
                else:
                    supabase.table("rag_documents").insert(payload).execute()
                total_indexed += 1
            except Exception as e:
                print(f"Error indexing chunk from {pdf_name}: {e}")
                
    print(f"Curriculum Ingestion Complete: {total_indexed}/{total_chunks} chunks indexed successfully.")

if __name__ == "__main__":
    index_curriculum_documents()
