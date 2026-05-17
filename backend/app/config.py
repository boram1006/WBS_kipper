from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str | None = None
    database_url: str = "sqlite:///./wbs_agent.db"
    cors_origins: str = "http://localhost:3000"
    mock_analysis: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
