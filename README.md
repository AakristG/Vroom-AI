# Toyota Financial Services — HackUTD 2026

A voice enabled AI assistant for Toyota Financial Services. A caller talks to a Retell AI voice
agent, which is powered by an NVIDIA NIM (Nemotron) LLM running behind our Django backend. Live
session is kept in SpacetimeDB so the React dashboard updates in real time while the
call is happening.

## Repo layout

```
.
├── backend/        Django + Channels REST/WebSocket API (Python)
├── frontend/        React + Vite dashboard/UI (TypeScript)
├── spacetimedb/     SpacetimeDB module (Rust)
```

## How to set up the project

### 1. Backend (Django)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 2. Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env       
npm run dev
```

### 3. SpacetimeDB module

```bash
# Install the CLI once: https://spacetimedb.com/install
cd spacetimedb/server
spacetime start                        
spacetime build
spacetime publish --project-path . toyota-fs-dev
```

## Tech stack

- **Backend:** Django + OpenAI SDK + SpacetimeDB + Retell AI
- **Frontend:** React + Vite + Tailwind CSS
- **AI inference:** NVIDIA NIM cloud API
- **Languages:** Python + Rust + TypeScript
