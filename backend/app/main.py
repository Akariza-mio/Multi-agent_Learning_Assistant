from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import os
import json
from pydantic import BaseModel
from typing import Optional
from app.schemas import ChatRequest, ChatResponse, StudentProfile
from app.agents import process_chat_and_generate_stream, generate_mindmap_stream, generate_ppt_stream

app = FastAPI(
    title="多智能体学习辅导系统后端API",
    description="基于大模型的个性化资源生成与学习多智能体系统"
)

# 允许跨域，方便前端页面调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载前端静态文件目录
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    """将根路由指向原生的单页面应用 (SPA)"""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """
    流式处理聊天请求 (不包含思维导图)
    """
    profile = req.current_profile if req.current_profile else StudentProfile()
    
    def event_generator():
        for chunk in process_chat_and_generate_stream(req.message, profile, req.image_base64, req.chat_history):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

class MapRequest(BaseModel):
    topic: str

class PptRequest(BaseModel):
    topic: str
    requirements: str
    current_profile: Optional[StudentProfile] = None

@app.post("/api/mindmap")
async def mindmap_endpoint(req: MapRequest):
    """
    流式处理独立的思维导图请求
    """
    def event_generator():
        for chunk in generate_mindmap_stream(req.topic):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/generate_ppt")
async def ppt_endpoint(req: PptRequest):
    """
    流式处理独立的PPT生成请求
    """
    profile = req.current_profile if req.current_profile else StudentProfile()
    def event_generator():
        for chunk in generate_ppt_stream(req.topic, req.requirements, profile):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")
