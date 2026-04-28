from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db, seed_db
from app.routes import api

app = FastAPI(title="Carbon Guardian AI", version="1.0.0")
STATIC_DIR = Path(__file__).resolve().parent / "static"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    seed_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "Carbon Guardian AI"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="http://127.0.0.1:5173", status_code=307)


app.include_router(api.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
