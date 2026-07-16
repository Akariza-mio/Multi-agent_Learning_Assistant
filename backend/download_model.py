import os
from modelscope.hub.snapshot_download import snapshot_download

model_dir = os.path.join(os.path.dirname(__file__), 'models', 'all-MiniLM-L6-v2')
print(f"开始从阿里魔搭 (ModelScope) 下载模型到: {model_dir}")

# 使用魔搭官方同步的 HuggingFace 镜像模型
snapshot_download(
    model_id="AI-ModelScope/all-MiniLM-L6-v2",
    local_dir=model_dir
)
print("✅ 模型下载完成！")
