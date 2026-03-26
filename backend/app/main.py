"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db, SessionLocal
from app.auth import init_default_user

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    init_db()

    # Initialize default user
    db = SessionLocal()
    try:
        init_default_user(db)
    finally:
        db.close()

    # Start scheduler
    from app.services.scheduler import init_scheduler
    init_scheduler()

    yield

    # Shutdown
    from app.services.scheduler import scheduler
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="SubscribeManage",
    description="订阅管理系统 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploaded logos
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Register routers
from app.routers import auth, settings as settings_router, categories, subscriptions, reports

app.include_router(auth.router)
app.include_router(settings_router.router)
app.include_router(categories.router)
app.include_router(subscriptions.router)
app.include_router(reports.router)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}
