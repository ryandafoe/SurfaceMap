"""
main.py — FastAPI entry point for SurfaceMap.

Responsibilities:
- Initialize the FastAPI app
- Register API routes (e.g. /recon, /summarize)
- Load environment variables via python-dotenv
- Handle CORS so the React frontend can communicate with this server
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from recon.subdomains import fetch_subdomains
from llm.summarize import summarize_findings

load_dotenv()

app = FastAPI(title="SurfaceMap API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    domain: str


class Finding(BaseModel):
    subdomain: str
    risk: str
    explanation: str


class GlossaryEntry(BaseModel):
    term: str
    definition: str


class Analysis(BaseModel):
    risk_level: str
    overview: str
    findings: list[Finding]
    recommendations: list[str]
    glossary: list[GlossaryEntry]


class ScanResponse(BaseModel):
    domain: str
    subdomains: list[str]
    analysis: Analysis


@app.get("/")
async def root():
    return {"message": "SurfaceMap API is running"}


@app.post("/scan", response_model=ScanResponse)
async def scan(request: ScanRequest):
    domain = request.domain.strip().lower()

    try:
        subdomains = await fetch_subdomains(domain)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"Recon failed: {e}")

    try:
        analysis = await summarize_findings(domain, subdomains)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"Summarization failed: {e}")

    return ScanResponse(domain=domain, subdomains=subdomains, analysis=analysis)
