FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn openai mcp python-dotenv httpx pydantic

COPY . .

WORKDIR /app/backend

CMD uvicorn main:app --host 0.0.0.0 --port $PORT