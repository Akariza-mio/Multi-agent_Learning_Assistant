import os
import time
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_core.messages import SystemMessage, HumanMessage
import concurrent.futures
from app.schemas import StudentProfile, GeneratedResources
from app.rag import retrieve_knowledge
import json
import re
import urllib.parse

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def get_llm(needs_vision=False):
    if needs_vision and os.getenv("VISION_MODEL_NAME"):
        return ChatOpenAI(
            model=os.getenv("VISION_MODEL_NAME"),
            api_key=os.getenv("VISION_API_KEY") or os.getenv("OPENAI_API_KEY", ""),
            base_url=os.getenv("VISION_API_BASE") or os.getenv("OPENAI_API_BASE", ""),
            temperature=0.7,
            max_retries=5
        )
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL_NAME"),
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_API_BASE", ""),
        temperature=0.7,
        max_retries=5
    )

def with_retry(func, fallback_val, max_retries=3, *args, **kwargs):
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"[Retry Failed] Agent {func.__name__} exhausted {max_retries} retries. Error: {e}")
                return fallback_val
            print(f"[Retry] Agent {func.__name__} failed (attempt {attempt+1}/{max_retries}). Retrying in 1s... Error: {e}")
            time.sleep(1)

def run_profiler_agent(current_message: str, current_profile: StudentProfile, image_base64: str = None) -> StudentProfile:
    llm = get_llm(needs_vision=bool(image_base64))
    
    # [Prompt: 学生画像分析师]
    sys_msg = SystemMessage(content="""你是一个“学生画像分析智能体”。你的任务是根据学生最近的对话，更新其6维动态学习画像。
核心要求：更新的内容应做宏观上的高度概括，不要罗列细节。严禁使用“已知”、“未知”、“正在学习”等空泛词汇。
推理指南：必须更加敏锐：请善于从对话的微小线索中主动推断，不要过于保守：
抗挫折能力 (frustration_tolerance)：若学生遇到不懂的地方持续追问、探讨，可判定为“积极应对困难，抗挫折能力强”；若表现急躁或者比较沮丧则判定为“遇到困难易急躁”，在这两个标准之间存在过渡过程。
好奇心 (curiosity)：若学生连续提问、主动探索原理、或询问跨学科内容，可判定为“充满求知欲，喜欢刨根问底”。如果很少询问上述内容，或者喜欢说“只教我怎么记住”这样的话，则好奇心一般。在这两个标准之间存在过度过程。
易错点偏好 (error_preference)： 若学生在一些比较基础的问题上追问，或者多次询问同一个知识点，则可以把此知识概括为易错点。
请尽量根据对话氛围给出一个概括，不要总是保持未知！
如果实在没有任何相关线索，请原样保留原有值。
请直接输出纯净的 JSON 格式，严格包含以下6个字段（值为中文描述）：
knowledge_base, error_preference, learning_progress, interest_direction, frustration_tolerance, curiosity。
不要输出任何除了JSON以外的文字，不要用 ```json 包裹。""")
    
    profile_json = current_profile.model_dump_json(ensure_ascii=False)
    user_content = [{"type": "text", "text": f"现有画像: {profile_json}\n当前对话: {current_message}\n请输出更新后的JSON:"}]
    if image_base64:
        user_content.append({"type": "image_url", "image_url": {"url": image_base64}})
        
    try:
        messages = [sys_msg, HumanMessage(content=user_content)]
        res = (llm | JsonOutputParser()).invoke(messages)
        return StudentProfile(**res)
    except Exception as e:
        with open(os.path.join(os.path.dirname(__file__), '..', 'profiler_error.log'), 'w', encoding='utf-8') as f:
            import traceback
            f.write(traceback.format_exc())
        print(f"[Profiler Agent 警告] API调用失败，可能遇到了并发限流或JSON解析错误: {e}")
        return current_profile

def run_planner_agent(profile: StudentProfile, topic: str, context: str, image_base64: str = None) -> str:
    llm = get_llm(needs_vision=bool(image_base64))
    
    # [Prompt: 学习路径规划师]
    sys_msg = SystemMessage(content="你是一个个性化学习路径规划师。请根据学生的6维画像，为学生定制关于提问话题的专属学习路径。\n极其核心的要求：在你规划的每一个细分知识点/学习节点下方，都必须当场配上 1-2 道针对性的练习题。并且，每一道练习题下方必须立刻附带对应的正确答案与详细解析，绝对不允许只出题不给答案！\n严格排版要求：对于选择题，请务必将 A、B、C、D 每个选项单独作为一行，建议使用无序列表（如 `A. xxx`）格式，绝不能将所有选项挤在同一行！\n【数学公式】：所有数学公式必须使用 `$` (行内) 或 `$$` (独立) 包裹，绝对禁止使用 `\\(` 或 `\\[`。此外，绝对禁止将数学公式放入代码块（如 ``` ）中，必须放在普通文本区，否则无法渲染！")
    
    profile_json = profile.model_dump_json(ensure_ascii=False)
    user_content = [{"type": "text", "text": f"学生画像:\n{profile_json}\n\n知识库参考:\n{context}\n\n提问话题: {topic}\n\n请输出带有密训练习题的专属学习路径："}]
    if image_base64:
        user_content.append({"type": "image_url", "image_url": {"url": image_base64}})
        
    messages = [sys_msg, HumanMessage(content=user_content)]
    return (llm | StrOutputParser()).invoke(messages)


def process_chat_and_generate_stream(req_message: str, current_profile: StudentProfile, image_base64: str = None, chat_history: list = None):
    # 指代消解与提问重写 (Query Rewriting)
    llm = get_llm(needs_vision=False)
    if chat_history and len(chat_history) > 0:
        rewrite_sys = SystemMessage(content="你是一个意图识别与重写专家。你的任务是判断用户的最新一句话是否包含代词（如“这”、“他”）或指代不明（如直接问“为什么是三次”）。\n【规则】：\n1. 若有指代不明，且和历史对话相关，请结合历史将其重写为一个独立、完整的问题。\n2. 若原话已经很完整，或者明显是一个与上文毫无关系的【全新话题】，请【绝对原样输出】，不要强行联系上文！\n3. 严禁回答问题，只能输出重写后的问题。")
        history_text = "\n".join([f"{msg['role']}: {msg['text']}" for msg in chat_history])
        rewrite_prompt = f"【历史记录】：\n{history_text}\n\n【最新提问】：\nuser: {req_message}\n\n请重写最新提问："
        try:
            req_message = (llm | StrOutputParser()).invoke([rewrite_sys, HumanMessage(content=rewrite_prompt)]).strip()
            # 如果大模型自作主张加了引号，把它去掉
            req_message = req_message.strip('"').strip("'")
        except Exception as e:
            pass # 如果重写失败，直接回退使用原消息
            
    yield {"type": "progress", "message": "🧠 正在分析您的发言..."}
    context = retrieve_knowledge(req_message)
    yield {"type": "progress", "message": "📚 资料检索完成，多智能体开始协作..."}

    llm = get_llm(needs_vision=bool(image_base64))
    
    def create_multimodal_content(text_prompt: str):
        content = [{"type": "text", "text": text_prompt}]
        if image_base64:
            content.append({"type": "image_url", "image_url": {"url": image_base64}})
        return content

    def get_reply():
        # [Prompt: 前台导航播报员]
        sys_msg = SystemMessage(content="你是一个无情的“前台导航机器人”。不管用户输入什么问题，你都绝对不能回答他的学术问题，也绝对不能解释任何名词。\n你的唯一任务是引导用户去生成的标签页查看已经由其他智能体生成的资料。\n【强制输出格式】：我已为您生成了关于“<此括号内你应该归纳用户提问的核心词>”的专属学习资源，请在右侧面板查看！")
        # 动态用户提示词，进一步强调其导航身份
        text_prompt = f"用户的输入是：【{req_message}】。请严格遵守导航机器人的身份，只输出上述模板的引导语，绝对不准解释知识点本身！"
        messages = [sys_msg, HumanMessage(content=create_multimodal_content(text_prompt))]
        return (llm | StrOutputParser()).invoke(messages)

    def get_doc():
        # [Prompt: 学科教授 (讲解文档)]
        sys_msg = SystemMessage(content="你是一名资深的学科教授。\n【极其重要的要求】：请直接输出讲解的纯净文本内容（Markdown格式），绝对不要包含任何“当然可以”、“针对你/这位学生”、“我来为你讲解”等聊天式或分析式的开头闲聊，请保持严肃客观的教材口吻，正文直接开始。\n【数学公式】：所有数学公式必须使用 `$` (行内) 或 `$$` (独立) 包裹，绝对禁止使用 `\\(` 或 `\\[`。并且，绝对禁止将数学公式放进代码块（如 ``` ）中，必须放在普通文本区！")
        text_prompt = f"基于该学生的知识基础：{current_profile.knowledge_base}，以及参考内容：\n{context}\n请适当地、详细地讲解关于【{req_message}】的内容。"
        messages = [sys_msg, HumanMessage(content=create_multimodal_content(text_prompt))]
        return (llm | StrOutputParser()).invoke(messages)

    def get_code():
        # [Prompt: 高级工程师 (代码示例)]
        # 注意事项：为了让前端 markdown 的 highlight.js 正常着色，必须约束其使用代码块（```）。同时防止数学公式引擎崩溃，禁止公式入代码块。
        sys_msg = SystemMessage(content="你是一个代码工程师。\n【排版与内容要求】：\n1. 请使用 Markdown 排版，要有明确的层级结构（例如用 ### 标明小标题，正文使用普通文本）。严禁把所有文字都设置为标题格式，严禁在每行文字下划横线（---）！\n2. 对于伪代码或真实代码部分，必须使用 Markdown 代码块（如 ```python）包裹。\n3. 直接输出原理解释和代码，绝对不要包含废话。\n4. 【警告】：如果您要在解释中插入数学公式，绝对禁止将数学公式放入代码块（```）中，必须将其写在代码块之外的普通文本中！")
        text_prompt = f"针对【{req_message}】，给出相关的核心底层逻辑的伪代码或真实代码示例，这部分不需要很多，但是一定要加注释解释。参考资料：\n{context}"
        messages = [sys_msg, HumanMessage(content=create_multimodal_content(text_prompt))]
        return (llm | StrOutputParser()).invoke(messages)

    def get_ext():
        # [Prompt: 拓展阅读智能体]
        sys_msg = SystemMessage(content="你是一个拓展阅读智能体。\n【要求】：直接客观地输出拓展阅读材料，绝对不要有闲聊废话。输出的阅读材料需要包含材料名，类型（例如书籍、论文等），作者以及简介")
        text_prompt = f"结合学生的好奇心：{current_profile.curiosity}。为【{req_message}】推荐并简述前沿拓展阅读材料。参考资料：\n{context}"
        messages = [sys_msg, HumanMessage(content=create_multimodal_content(text_prompt))]
        return (llm | StrOutputParser()).invoke(messages)

    def get_rec():
        # [Prompt: 精准资源推送智能体]
        sys_msg = SystemMessage(content="""你是一个“精准资源推送智能体”。你的任务是深入分析用户提问的底层考点，归纳出核心搜索关键词，并按指定格式输出推荐资源。
【核心规则，必须绝对遵守】：
1. 关键词归纳（非常重要）：请先深入分析用户提问的底层考点。例如用户提问 `++a++` 的语法错误，您应归纳出核心考点为 `C++ 左值和右值` 或 `C++ 运算符优先级`，将其作为关键词。绝不能直接把用户的长句或原话作为关键词！
2. 推荐范围限制：只允许推荐“B站视频”、“知乎文章”和“CSDN博客”。请至少推荐 3 个精选视频和 3 篇深度文章！
3. 输出格式强制要求（防死链）：绝对不要自己拼接完整的 http 链接！您必须使用以下特殊的占位符格式：
   - 格式：`[平台名称|归纳的关键词]`
   - 平台名称只能是：`B站`、`知乎` 或 `CSDN`。
   - 示例：`- [B站|C++左值和右值]`
   - 示例：`- [知乎|C++自增运算符底层原理]`
4. 排版与静音要求：必须使用 Markdown 标题（如 `### B站视频推荐`）和无序列表进行结构化排版，每个资源占一行！绝对禁止输出任何打招呼、解释性的前言或结语，必须直接以 Markdown 标题开头输出！""")
        text_prompt = f"根据学生的可能专业、学习进度（{current_profile.learning_progress}）、好奇心（{current_profile.curiosity}），为【{req_message}】深入归纳核心知识点，并按要求格式推送 B站视频 和 博客文章 的资源占位符。参考资料：\n{context}"
        messages = [sys_msg, HumanMessage(content=create_multimodal_content(text_prompt))]
        raw_output = (llm | StrOutputParser()).invoke(messages)
        
        # 使用正则将大模型生成的占位符 [平台|关键词] 替换为安全的 URL 编码链接
        def replacer(match):
            platform = match.group(1)
            keyword = match.group(2)
            encoded_kw = urllib.parse.quote(keyword)
            if "B站" in platform:
                url = f"https://search.bilibili.com/all?keyword={encoded_kw}"
            elif "知乎" in platform:
                url = f"https://www.zhihu.com/search?type=content&q={encoded_kw}"
            elif "CSDN" in platform:
                url = f"https://so.csdn.net/so/search?q={encoded_kw}"
            else:
                url = f"https://www.bing.com/search?q={encoded_kw}"
            return f"[{keyword}]({url})"
            
        return re.sub(r'\[(B站|知乎|CSDN)\|([^\]]+)\]', replacer, raw_output)

    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
        f_profile = executor.submit(with_retry, run_profiler_agent, current_profile, 3, req_message, current_profile, image_base64)
        f_reply = executor.submit(with_retry, get_reply, "已为您生成学习资源。", 3)
        f_doc = executor.submit(with_retry, get_doc, "", 3)
        f_planner = executor.submit(with_retry, run_planner_agent, "", 3, current_profile, req_message, context, image_base64)
        f_code = executor.submit(with_retry, get_code, "", 3)
        f_ext = executor.submit(with_retry, get_ext, "", 3)
        f_rec = executor.submit(with_retry, get_rec, "", 3)
        
        results = {}
        
        results["profile"] = f_profile.result()
        yield {"type": "progress", "message": "🧠 6 维画像更新完成！"}
        
        results["reply"] = f_reply.result()
        
        results["doc"] = f_doc.result()
        yield {"type": "progress", "message": "📚 专属讲解文档已生成！"}
        time.sleep(1.0)
        
        results["planner"] = f_planner.result()
        yield {"type": "progress", "message": "🗺️ 学习路径与练习已就绪！"}
        time.sleep(1.0)
        
        results["code"] = f_code.result()
        yield {"type": "progress", "message": "💻 代码示例已生成！"}
        time.sleep(1.0)
        
        results["ext"] = f_ext.result()
        yield {"type": "progress", "message": "🔗 拓展阅读材料已就绪！"}
        time.sleep(1.0)
        
        results["rec"] = f_rec.result()
        yield {"type": "progress", "message": "🎯 资源推荐库已打包完毕！"}
        time.sleep(1.0)
            
    yield {"type": "progress", "message": "🚀 所有步骤就绪，资源马上呈现..."}
    
    final_res = {
        "reply": results.get("reply", "已为您生成学习资源。"),
        "updated_profile": results.get("profile").model_dump() if results.get("profile") else current_profile.model_dump(),
        "learning_path": results.get("planner", ""),
        "resources": {
            "explanation_doc": results.get("doc", ""),
            "code_examples": results.get("code", ""),
            "extended_reading": results.get("ext", ""),
            "resource_push": results.get("rec", "")
        }
    }
    
    yield {"type": "result", "data": final_res}


def generate_mindmap_stream(topic: str):
    yield {"type": "progress", "message": "🗺️ 正在深度分析章节核心逻辑..."}
    
    llm = get_llm()
    p2 = ChatPromptTemplate.from_template("你是一个专门输出 Mermaid 语法的机器。请提炼关于【{topic}】的核心逻辑结构，利用你的自带知识生成一份合法的 Mermaid `mindmap` 代码。\n【极其严格的要求】：\n1. 必须且只能输出包含在 ```mermaid 和 ``` 之间的代码！绝不能有任何前言后语（例如“好的”、“这是导图”）。\n2. 必须使用 `mindmap` 类型，必须有且仅有一个中心根节点。\n3. 节点文字中**严禁出现任何特殊符号**（如括号()、引号、冒号、逗号、Markdown星号**等），只能使用纯中文和英文文字！")
    
    yield {"type": "progress", "message": "🗺️ 正在生成思维导图..."}
    mermaid_code = (p2 | llm | StrOutputParser()).invoke({"topic": topic})
    
    yield {"type": "result", "data": {"mind_map_mermaid": mermaid_code}}


def generate_ppt_stream(topic: str, requirements: str, profile):
    yield {"type": "progress", "message": "📊 正在深度分析核心大纲..."}
    
    llm = get_llm(needs_vision=True)
    
    profile_str = f"受众画像：好奇心({profile.curiosity})、知识基础({profile.knowledge_base})、兴趣方向({profile.interest_direction})。请根据画像调整内容（例如好奇心强可增加拓展内容）。"
    
    p_ppt = ChatPromptTemplate.from_template("""你是一位顶尖的商业演示文稿设计师兼资深领域专家。你的任务是围绕主题【{topic}】，生成一个结构丰富、视觉专业、内容充实的幻灯片数据。

【用户补充要求】：{requirements}
【受众画像参考】：{profile_str}

为了达到极高的质量，你生成的数据必须严格遵守以下准则：

1. 拒绝单一结构（版式多样性）：
不要只使用简单的“标题+文本”版式。你在 JSON 中必须通过 `layout_type` 字段混合使用以下版式：
- `standard`: 标准图文/列表版式。
- `quote`: 大字报/金句页（用于强调核心观点，一句话撑满全屏，可附加 `citation` 出处）。
- `cards`: 卡片网格版式（强烈推荐！当遇到“优缺点对比”、“四大条件”时，必须使用此版式，并提供 `cards_data` 数组）。
- `image_text`: 图文并茂版式。右侧动态配图，左侧可以是内容。必须提供 `image_keyword`（英文，用于生成配图，如 "operating system, computer"）。左侧文本可以使用 `content`，或者更推荐使用 `cards_data` 数组来呈现高亮知识点卡片。

2. 可选图表（流程图）：
- 绝对禁止生成毫无意义的饼图（pie）！
- 只有在逻辑极其适合流程展示时，才使用 `graph TD` 语法在 `chart_mermaid` 字段输出流程图。
- 绝对禁止使用复杂图表（如 sequenceDiagram 等）以免渲染崩溃。
- 务必使用转义的换行符 \\n 分行，且节点名有特殊字符务必加双引号！

3. 内容的深度与扩充：
用户给出的提示可能很短，你必须作为领域专家，自动扩充具体的细节、案例、原理解释和步骤，而不是仅仅罗列大纲。标准页正文每页不要少于 3 个具有实质意义的要点。

4. 视觉与配色：
必须自行根据“风格”要求设计 CSS HEX 配色。如果没有特殊要求，默认必须使用白底黑字（例如：背景 #FFFFFF，正文 #333333，强调色自选）。

【数据结构要求】：
必须输出纯 JSON，不能有前言后语或 Markdown 代码块标记：
{{
    "theme": {{
        "background": "<背景色HEX>", 
        "text_color": "<正文颜色HEX>",
        "accent_color": "<强调色HEX>"
    }},
    "title": "幻灯片总标题",
    "subtitle": "幻灯片副标题（一句话概括）",
    "slides": [
        {{
            "layout_type": "quote",
            "title": "核心观点总结",
            "content": ["这里写一句极具震撼力的金句总结"],
            "citation": "—— 计算机科学经典定义"
        }},
        {{
            "layout_type": "image_text",
            "title": "工程实践策略",
            "image_keyword": "engineering trade-off balance",
            "cards_data": [
                {{"icon": "⚖️", "title": "权衡的艺术", "desc": "在复杂的系统中，有时选择忽略是一种基于成本与收益的智慧。"}}
            ]
        }},
        {{
            "layout_type": "cards",
            "title": "方案对比与选择",
            "cards_data": [
                {{"icon": "💡", "title": "方案A", "desc": "高扩展性，适合大规模集群..."}},
                {{"icon": "⚡", "title": "方案B", "desc": "高性能，适合对延迟敏感的场景..."}}
            ]
        }},
        {{
            "layout_type": "standard",
            "title": "详细解析",
            "content": ["详细扩展的段落1...", "详细扩展的段落2..."],
            "chart_mermaid": "graph TD \\n A[\\"节点\\"] --> B"
        }}
    ]
}}""")
    
    yield {"type": "progress", "message": "📊 正在生成结构化幻灯片..."}
    
    ppt_json_str = (p_ppt | llm | StrOutputParser()).invoke({"topic": topic, "requirements": requirements, "profile_str": profile_str})
    
    ppt_json_str = ppt_json_str.strip()
    if ppt_json_str.startswith("```json"):
        ppt_json_str = ppt_json_str[7:]
    if ppt_json_str.startswith("```"):
        ppt_json_str = ppt_json_str[3:]
    if ppt_json_str.endswith("```"):
        ppt_json_str = ppt_json_str[:-3]
        
    ppt_json_str = ppt_json_str.strip()
    
    yield {"type": "result", "data": {"ppt_json": ppt_json_str}}
