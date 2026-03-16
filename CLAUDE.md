# SurfaceMap — Claude Context

## What is this?
SurfaceMap is an AI-powered attack surface reconnaissance tool. Given a target domain, it enumerates subdomains using public Certificate Transparency logs (crt.sh) and passes the results to Claude to produce a structured analysis of the exposed attack surface.

## Stack
| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Python 3.11+, FastAPI, uvicorn    |
| HTTP     | httpx (async)                     |
| AI       | Anthropic SDK (`anthropic`)       |
| Frontend | React 18, Vite 4                  |
| Config   | python-dotenv, `.env`             |

## Project Structure
```
SurfaceMap/
├── backend/
│   ├── main.py              # FastAPI app, CORS, route registration
│   ├── recon/
│   │   └── subdomains.py    # crt.sh subdomain enumeration
│   └── llm/
│       └── summarize.py     # Claude API attack surface summarization
├── frontend/                # Vite + React app
├── requirements.txt
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## Running locally

**Backend**
```bash
cd backend
pip install -r ../requirements.txt
cp ../.env.example ../.env  # fill in ANTHROPIC_API_KEY
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## Key conventions
- All recon logic lives in `backend/recon/`
- All LLM logic lives in `backend/llm/`
- The FastAPI app in `main.py` wires everything together via routers
- Never commit `.env` — use `.env.example` as the template
- The Claude model to use is `claude-opus-4-6` unless a faster/cheaper model is preferable for the task
