FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn openai mcp python-dotenv httpx pydantic

COPY . .

CMD uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port $PORT