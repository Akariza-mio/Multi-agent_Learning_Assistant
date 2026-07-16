from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class StudentProfile(BaseModel):
    """动态学生画像模型 (6个维度)"""
    knowledge_base: str = Field(default="未知", description="知识基础 (对核心概念的掌握程度)")
    error_preference: str = Field(default="未知", description="易错点偏好 (常犯错误和薄弱环节)")
    learning_progress: str = Field(default="未知", description="学习进度 (当前复习或学习到的章节或学科)")
    interest_direction: str = Field(default="未知", description="兴趣方向 (偏好的学习兴趣)")
    frustration_tolerance: str = Field(default="未知", description="抗挫折能力 (遇到难题时的耐心与情绪)")
    curiosity: str = Field(default="未知", description="好奇心 (探索拓展知识的意愿)")

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_session"
    current_profile: Optional[StudentProfile] = None
    image_base64: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None

class GeneratedResources(BaseModel):
    explanation_doc: str = ""   # 课程讲解文档
    mind_map_mermaid: str = ""  # 思维导图 (Mermaid代码)
    exercises: str = ""         # 重难点练习题目
    code_examples: str = ""     # 代码示例
    extended_reading: str = ""  # 拓展阅读材料
    resource_push: str = ""     # 新增资源推送字段

class ChatResponse(BaseModel):
    reply: str
    updated_profile: StudentProfile
    resources: Optional[GeneratedResources] = None
    learning_path: Optional[str] = None
