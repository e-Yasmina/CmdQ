from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel


def get_llm(provider: str, api_key: str, model: str, base_url: str = "") -> BaseChatModel:
    if provider in ("openai", "custom_openai"):
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=base_url or None
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            model=model,
            anthropic_api_key=api_key
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")
