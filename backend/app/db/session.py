"""
ALGO ROBOT — Database Engine & Session Management
Configured for SQLAlchemy 2.0 with connection pooling and schema initialization.
"""

from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings
from app.db.models import Base

# Determine connect_args based on database dialect
connect_args = {}
if "sqlite" in settings.SYNC_DATABASE_URL:
    connect_args["check_same_thread"] = False

# Create database engine
engine = create_engine(
    settings.SYNC_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Creates all database tables defined in models if they do not exist."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for injecting database session with auto-close."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
