from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.routes import router as api_router
from api.auth import router as auth_router
from api.users import router as users_router
from api.sessions import router as sessions_router
from api.taxonomy import router as taxonomy_router
from api.routes import router as routes_router
from api.analytics import router as analytics_router
from websocket.stream import router as websocket_router

app = FastAPI(title="FocusAI Cognitive Telemetry Engine")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include separated routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["sessions"])
app.include_router(taxonomy_router, prefix="/api/taxonomy", tags=["taxonomy"])
app.include_router(routes_router, prefix="/api", tags=["telemetry"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(websocket_router)

@app.get("/")
async def root():
    return {"message": "FocusAI Backend is running securely."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)