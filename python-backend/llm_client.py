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
        target_model = model
        # if target_model in ("gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.0-pro", "gemini-1.0"):
        #     target_model = "gemini-3.6-flash"
        return ChatGoogleGenerativeAI(
            model=target_model,
            google_api_key=api_key
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            model=model,
            anthropic_api_key=api_key
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")
