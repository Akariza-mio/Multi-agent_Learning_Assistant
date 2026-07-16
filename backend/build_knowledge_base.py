import os
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

MARKDOWN_PATH = os.path.join(os.path.dirname(__file__), '..', '课程复习.md')
CHROMA_DB_DIR = os.path.join(os.path.dirname(__file__), 'chroma_db')
LOCAL_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'all-MiniLM-L6-v2')

def main():
    print("========================================")
    print(" 开始解析课程知识库 (完全离线模式)...")
    print("========================================")
    
    if not os.path.exists(MARKDOWN_PATH):
        print(f"错误: 找不到文件 {MARKDOWN_PATH}")
        return

    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
    
    with open(MARKDOWN_PATH, "r", encoding="utf-8") as f:
        md_text = f.read()
    
    md_header_splits = markdown_splitter.split_text(md_text)
    print(f"[1/3] 按Markdown标题初步切分为 {len(md_header_splits)} 个大段落。")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
    )
    splits = text_splitter.split_documents(md_header_splits)
    print(f"[2/3] 细化切分为 {len(splits)} 个小文本块 (Chunks)。")

    print("\n[3/3] 正在加载项目内置的本地 Embedding 模型 ...")
    
    if not os.path.exists(LOCAL_MODEL_PATH):
        print(f"错误: 找不到本地模型文件夹 {LOCAL_MODEL_PATH}")
        print("请确保模型已正确下载到 models 目录下！")
        return
        
    embeddings = HuggingFaceEmbeddings(model_name=LOCAL_MODEL_PATH)

    print("\n正在生成向量并存入本地 ChromaDB 数据库，过程完全离线，请稍候...")
    
    vectorstore = Chroma.from_documents(
        documents=splits,
        embedding=embeddings,
        persist_directory=CHROMA_DB_DIR
    )
    
    print("\n========================================")
    print(f"✅ 知识库构建成功！数据库已安全保存至: \n   {os.path.abspath(CHROMA_DB_DIR)}")
    print("========================================")

if __name__ == "__main__":
    main()
