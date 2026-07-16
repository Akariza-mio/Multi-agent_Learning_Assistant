import os
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

CHROMA_DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'chroma_db')
LOCAL_MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models', 'all-MiniLM-L6-v2')

_vectorstore = None

def get_vectorstore():
    global _vectorstore
    if _vectorstore is None:
        try:
            embeddings = HuggingFaceEmbeddings(model_name=LOCAL_MODEL_PATH)
            _vectorstore = Chroma(
                persist_directory=CHROMA_DB_DIR,
                embedding_function=embeddings
            )
            print("✅ 成功加载本地向量数据库与 Embedding 模型")
        except Exception as e:
            print(f"加载向量数据库失败: {e}")
    return _vectorstore

def retrieve_knowledge(query: str, k: int = 3) -> str:
    """检索相关的操作系统知识片段"""
    vs = get_vectorstore()
    if not vs:
        return "暂无本地知识库数据，请先运行 build_knowledge_base.py"
    
    docs = vs.similarity_search(query, k=k)
    return "\n\n---\n\n".join([doc.page_content for doc in docs])
