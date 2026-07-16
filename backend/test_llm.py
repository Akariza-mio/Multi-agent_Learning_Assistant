import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

print("Base URL:", os.getenv("OPENAI_API_BASE"))

llm = ChatOpenAI(
    model=os.getenv("LLM_MODEL_NAME", "spark-x"),
    api_key=os.getenv("OPENAI_API_KEY", ""),
    base_url=os.getenv("OPENAI_API_BASE", ""),
    temperature=0.7,
    max_retries=1
)

try:
    res = llm.invoke("你好，请回答1")
    print("成功! 回答:", res.content)
except Exception as e:
    print("失败! 错误信息:", e)
