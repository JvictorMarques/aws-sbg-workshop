import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import Base, engine, get_session
from app.models import Checkin

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://app.jvictor.cloud,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

# Limite por IP no POST /checkins. Sintaxe: "30/minute", "5/second", "100/hour"
CHECKIN_RATE_LIMIT = os.getenv("CHECKIN_RATE_LIMIT", "30/minute")

# Contadores em memória: suficiente para uma EC2 com um processo.
# Com várias instâncias, use storage_uri="redis://..." (ElastiCache).
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Workshop Cloud Computing API", lifespan=lifespan)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def rate_limit_exceeded(_: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Muitos check-ins. Limite: {exc.limit.limit}."},
    )

# Front (S3) e back (EC2) ficam em subdomínios diferentes, sem CloudFront
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class CheckinIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CheckinOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    total: int


class CountOut(BaseModel):
    total: int


def count_checkins(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Checkin)) or 0


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/checkins/count", response_model=CountOut)
def get_count(session: Session = Depends(get_session)):
    return CountOut(total=count_checkins(session))


@app.post("/checkins", response_model=CheckinOut, status_code=201)
@limiter.limit(CHECKIN_RATE_LIMIT)
def create_checkin(
    request: Request, body: CheckinIn, session: Session = Depends(get_session)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Informe um nome.")

    checkin = Checkin(name=name)
    session.add(checkin)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409, detail=f"{name} já fez check-in."
        ) from None
    session.refresh(checkin)
    return CheckinOut(
        id=checkin.id,
        name=checkin.name,
        created_at=checkin.created_at,
        total=count_checkins(session),
    )
