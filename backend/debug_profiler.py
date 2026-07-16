import os
import sys
# Set path so we can import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.schemas import StudentProfile
from app.agents import get_llm
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser

llm = get_llm()
sys_msg = SystemMessage(content="""你是一个“学生画像分析智能体”。你的任务是根据学生最近的对话，更新其6维动态学习画像。
请直接输出纯净的 JSON 格式，严格包含以下6个字段（值为中文描述）：
knowledge_base, error_preference, learning_progress, interest_direction, frustration_tolerance, curiosity。
如果某项无法从对话推断，请保留原有值。不要输出任何除了JSON以外的文字。""")

profile = StudentProfile()
current_message = "帮我看看这张图"
profile_json = profile.model_dump_json(ensure_ascii=False)
user_content = [{"type": "text", "text": f"现有画像: {profile_json}\n当前对话: {current_message}\n请输出更新后的JSON:"}]

# 增加一个纯黑的 1x1 像素 base64 测试 Vision API
fake_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
user_content.append({"type": "image_url", "image_url": {"url": fake_image}})

messages = [sys_msg, HumanMessage(content=user_content)]

try:
    print("Calling LLM...")
    res = (llm | JsonOutputParser()).invoke(messages)
    print("Result:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
