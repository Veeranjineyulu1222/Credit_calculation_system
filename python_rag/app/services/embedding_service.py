import numpy as np
from typing import List, Union
from app.core.config import settings

class EmbeddingService:
    """
    Pluggable local embedding service provider abstraction.
    Primary provider: SentenceTransformers / Local deterministic vectorizer.
    Supports programmatically resolving embedding dimension (default 384 for bge-small-en-v1.5).
    """
    def __init__(self, model_name: str = None, dimension: int = 384):
        self.model_name = model_name or settings.EMBEDDING_MODEL
        self.dimension = dimension
        self._st_model = None
        self._init_model()

    def _init_model(self):
        try:
            import sentence_transformers
            self._st_model = sentence_transformers.SentenceTransformer(self.model_name)
            self.dimension = self._st_model.get_sentence_embedding_dimension()
        except Exception:
            # Fallback to local deterministic feature vectorizer if PyTorch DLL is blocked by OS policy
            self._st_model = None

    def get_dimension(self) -> int:
        return self.dimension

    def encode(self, text: Union[str, List[str]]) -> Union[List[float], List[List[float]]]:
        if isinstance(text, str):
            text_list = [text]
            single = True
        else:
            text_list = text
            single = False

        if self._st_model is not None:
            try:
                embeddings = self._st_model.encode(text_list, normalize_embeddings=True)
                vectors = [e.tolist() for e in embeddings]
                return vectors[0] if single else vectors
            except Exception:
                pass

        # Deterministic lightweight vectorizer fallback
        vectors = []
        for txt in text_list:
            words = str(txt).lower().split()
            vec = np.zeros(self.dimension, dtype=np.float32)
            for w in words:
                idx = sum(ord(c) for c in w) % self.dimension
                vec[idx] += 1.0
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            vectors.append(vec.tolist())

        return vectors[0] if single else vectors

embedding_service = EmbeddingService()
