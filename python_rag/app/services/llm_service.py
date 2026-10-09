from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 700) -> str:
        pass

class OpenRouterProvider(LLMProvider):
    def __init__(self, api_key: str = None, model: str = None):
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.model = model or settings.OPENROUTER_MODEL or "meta-llama/llama-3.3-70b-instruct:free"

    async def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 700) -> str:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is missing in environment settings.")
            
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": "University Competency & Credit System",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    return choices[0].get("message", {}).get("content", "").strip()
                return ""
            else:
                error_detail = response.text
                raise RuntimeError(f"OpenRouter API returned HTTP {response.status_code}: {error_detail}")

class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = None, model: str = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self.model = model or settings.OLLAMA_MODEL

    async def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 700) -> str:
        url = f"{self.base_url}/api/generate"
        prompt = f"System: {system_prompt}\n\nUser: {user_prompt}"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    return data.get("response", "").strip()
                else:
                    raise Exception(f"Ollama returned HTTP {response.status_code}")
            except Exception as e:
                # Return graceful fallback if Ollama is unavailable
                raise RuntimeError(f"Ollama model {self.model} is currently unavailable.") from e

class FallbackLLMProvider(LLMProvider):
    """Fallback provider when primary local LLM server is starting up or unavailable."""
    async def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 700) -> str:
        return "I could not connect to the AI model server. Please verify your OpenRouter configuration."

class LLMService:
    def __init__(self):
        provider_name = settings.LLM_PROVIDER.lower()
        if provider_name == "openrouter" or (settings.OPENROUTER_API_KEY and provider_name != "ollama"):
            self.provider: LLMProvider = OpenRouterProvider()
        elif provider_name == "ollama":
            self.provider = OllamaProvider()
        else:
            self.provider = OpenRouterProvider() if settings.OPENROUTER_API_KEY else FallbackLLMProvider()

    async def generate(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 700) -> str:
        try:
            return await self.provider.generate(system_prompt, user_prompt, temperature, max_tokens)
        except Exception as e:
            print(f"[LLMService Error] {e}")
            return f"AI insight generation note: {e}"

llm_service = LLMService()
