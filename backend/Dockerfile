FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Daphne serves the ASGI app so the Retell Custom LLM WebSocket (apps/voice) works too.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
