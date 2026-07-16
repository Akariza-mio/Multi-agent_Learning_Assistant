// 主题初始化逻辑
const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// 初始化 Mermaid
mermaid.initialize({ startOnLoad: false, theme: savedTheme === 'dark' ? 'dark' : 'default' });

// DOM 元素引用
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingTextNode = loadingOverlay.querySelector('p');

const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');

let currentImageBase64 = null;

const mapInput = document.getElementById('map-input');
const mapBtn = document.getElementById('map-btn');

// 会话管理 DOM
const sessionListEl = document.getElementById('session-list');
const newChatBtn = document.getElementById('new-chat-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

// 画像元素
const profEls = {
    knowledge_base: document.getElementById('prof-kb'),
    error_preference: document.getElementById('prof-err'),
    learning_progress: document.getElementById('prof-prog'),
    interest_direction: document.getElementById('prof-int'),
    frustration_tolerance: document.getElementById('prof-frus'),
    curiosity: document.getElementById('prof-cur')
};
const pathContent = document.getElementById('learning-path-content');

// 资源展示元素
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const resEls = {
    doc: document.querySelector('#tab-doc'),
    map: document.querySelector('#tab-map'),
    code: document.querySelector('#tab-code'),
    ext: document.querySelector('#tab-ext'),
    rec: document.querySelector('#tab-rec')
};

// 当前状态存储 (Local Storage 相关)
let sessions = []; // { id, title, updatedAt }
let currentSessionId = null;
let currentSessionData = {
    chatHistory: [],
    learning_path: "",
    resources: null,
    mind_map: ""
};
let globalProfile = null; // 全局唯一画像

// 绑定 Tab 切换事件
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// ============================
// 会话管理逻辑 (Multi-Sessions)
// ============================
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function loadSessions() {
    loadGlobalProfile();

    const saved = localStorage.getItem('agent_sessions');
    if (saved) {
        try {
            sessions = JSON.parse(saved);
            if (!Array.isArray(sessions)) sessions = [];
        } catch (e) {
            sessions = [];
        }
    }
    if (sessions.length === 0) {
        createNewSession(false);
    } else {
        // Load the most recent session
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        switchSession(sessions[0].id);
    }
    renderSessionList();
}

function saveSessionsMeta() {
    localStorage.setItem('agent_sessions', JSON.stringify(sessions));
    renderSessionList();
}

function saveSessionData() {
    if (!currentSessionId) return;
    localStorage.setItem(`session_data_${currentSessionId}`, JSON.stringify(currentSessionData));

    // Update timestamp
    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
        session.updatedAt = Date.now();
        saveSessionsMeta();
    }
}

function createNewSession(switchImmediately = true) {
    const newId = generateUUID();
    const newSession = {
        id: newId,
        title: '新学习对话',
        updatedAt: Date.now()
    };
    sessions.unshift(newSession);

    const initialData = {
        chatHistory: [],
        learning_path: "",
        resources: null,
        mind_map: ""
    };
    localStorage.setItem(`session_data_${newId}`, JSON.stringify(initialData));
    saveSessionsMeta();

    if (switchImmediately) {
        switchSession(newId);
    }
}

function switchSession(id) {
    currentSessionId = id;
    const savedData = localStorage.getItem(`session_data_${id}`);
    if (savedData) {
        currentSessionData = JSON.parse(savedData);
    } else {
        currentSessionData = { chatHistory: [], learning_path: "", resources: null, mind_map: "", ppt_json: null };
    }

    // Reset UI
    chatBox.innerHTML = `
        <div class="message ai-message">
            <div class="avatar">🤖</div>
            <div class="bubble">你好！我是您的多智能体学习辅导老师。请问您今天想复习或学习哪部分知识？</div>
        </div>
    `;

    // Restore Chat
    currentSessionData.chatHistory.forEach(msg => {
        appendMessage(msg.role, msg.text, msg.imageUrl, true);
    });

    // Restore Learning Path
    if (currentSessionData.learning_path) {
        pathContent.innerHTML = marked.parse(currentSessionData.learning_path);
    } else {
        pathContent.innerHTML = '<div class="empty-state">💬 请在对话框中告诉我您的需求，我将为您生成专属学习路径。</div>';
    }

    // Restore Resources
    if (currentSessionData.resources) {
        hideEmptyStates();
        resEls.doc.innerHTML = marked.parse(currentSessionData.resources.explanation_doc || '生成失败');
        resEls.code.innerHTML = marked.parse(currentSessionData.resources.code_examples || '生成失败');
        resEls.ext.innerHTML = marked.parse(currentSessionData.resources.extended_reading || '生成失败');
        resEls.rec.innerHTML = marked.parse(currentSessionData.resources.resource_push || '生成失败');
    } else {
        resEls.doc.innerHTML = '<div class="empty-state">等待生成...</div>';
        resEls.code.innerHTML = '<div class="empty-state">等待生成...</div>';
        resEls.ext.innerHTML = '<div class="empty-state">等待生成...</div>';
        resEls.rec.innerHTML = '<div class="empty-state">等待生成...</div>';
    }

    // Restore MindMap
    if (currentSessionData.mind_map) {
        renderMapResultUI(currentSessionData.mind_map);
    } else {
        const mermaidContainer = document.getElementById('mermaid-container');
        if (mermaidContainer) {
            mermaidContainer.innerHTML = '';
        }
        const mapEmpty = resEls.map.querySelector('.empty-state');
        if (mapEmpty) mapEmpty.style.display = 'block';
    }

    // Restore PPT
    if (currentSessionData.ppt_json) {
        currentPptJson = currentSessionData.ppt_json;
        renderPPTResultUI(currentPptJson);
    } else {
        const pptEmpty = document.getElementById('ppt-empty-state');
        const pptCont = document.getElementById('ppt-container');
        const pptDown = document.getElementById('ppt-download-btn');
        if(pptEmpty) pptEmpty.style.display = 'block';
        if(pptCont) pptCont.style.display = 'none';
        if(pptDown) pptDown.style.display = 'none';
        currentPptJson = null;
    }

    renderSessionList();
}

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    localStorage.removeItem(`session_data_${id}`);
    saveSessionsMeta();
    if (sessions.length === 0) {
        createNewSession(true);
    } else if (currentSessionId === id) {
        switchSession(sessions[0].id);
    } else {
        renderSessionList();
    }
}

function renderSessionList() {
    if (!sessionListEl) return;
    sessionListEl.innerHTML = '';
    sessions.forEach(session => {
        const li = document.createElement('li');
        li.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = session.title;
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";

        const delBtn = document.createElement('span');
        delBtn.textContent = '🗑️';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '12px';
        delBtn.style.marginLeft = '8px';
        delBtn.title = "删除对话";

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除对话“${session.title}”吗？`)) {
                deleteSession(session.id);
            }
        });

        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";

        li.appendChild(titleSpan);
        li.appendChild(delBtn);

        li.title = session.title;
        li.addEventListener('click', () => switchSession(session.id));
        sessionListEl.appendChild(li);
    });
}

function renameCurrentSession(newTitle) {
    const session = sessions.find(s => s.id === currentSessionId);
    if (session && session.title === '新学习对话') {
        session.title = newTitle.length > 15 ? newTitle.substring(0, 15) + '...' : newTitle;
        saveSessionsMeta();
    }
}

// 绑定新建按钮
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => createNewSession(true));
}

// 追加聊天消息
function appendMessage(role, text, imageUrl = null, isRestore = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '🧑‍🎓' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (imageUrl) {
        bubble.style.display = 'flex';
        bubble.style.flexDirection = 'column';
        bubble.style.gap = '8px';
        bubble.innerHTML = `<img src="${imageUrl}" style="max-width: 200px; border-radius: 8px; border: 1px solid var(--glass-border);">`;
        if (text) {
            const span = document.createElement('span');
            span.textContent = text;
            bubble.appendChild(span);
        }
    } else {
        bubble.innerHTML = marked.parse(text); // 解析 Markdown
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    // 如果不是从缓存恢复的，则保存到内存并写入 localStorage
    if (!isRestore) {
        currentSessionData.chatHistory.push({ role, text, imageUrl });
        saveSessionData();
    }
}

function hideEmptyStates() {
    document.querySelectorAll('.empty-state').forEach(el => el.style.display = 'none');
}

function loadGlobalProfile() {
    const saved = localStorage.getItem('agent_global_profile');
    if (saved) {
        try {
            globalProfile = JSON.parse(saved);
        } catch (e) {
            globalProfile = null;
        }
    }
    updateProfileUI(globalProfile);
}

function updateProfileUI(profile) {
    globalProfile = profile;
    if (profile) {
        localStorage.setItem('agent_global_profile', JSON.stringify(profile));
        profEls.knowledge_base.textContent = profile.knowledge_base;
        profEls.error_preference.textContent = profile.error_preference;
        profEls.learning_progress.textContent = profile.learning_progress;
        profEls.interest_direction.textContent = profile.interest_direction;
        profEls.frustration_tolerance.textContent = profile.frustration_tolerance;
        profEls.curiosity.textContent = profile.curiosity;
    } else {
        // Reset defaults
        Object.values(profEls).forEach(el => el.textContent = '未知');
    }
}

// ============================
// 1. 图片上传处理
// ============================
imageUpload.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            currentImageBase64 = event.target.result;
            imagePreview.src = currentImageBase64;
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

removeImageBtn.addEventListener('click', function () {
    currentImageBase64 = null;
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
    imageUpload.value = '';
});

// ============================
// 2. 聊天与常规资源流式处理
// ============================
async function sendChatRequest() {
    const text = chatInput.value.trim();
    if (!text && !currentImageBase64) return;

    if (currentImageBase64) {
        appendMessage('user', text, currentImageBase64);
    } else {
        appendMessage('user', text);
    }

    // 自动重命名会话
    renameCurrentSession(text || '图片解析');

    chatInput.value = '';
    loadingOverlay.style.display = 'flex';
    loadingTextNode.textContent = '多智能体开始启动...';

    // 缓存当前的图片数据并在 UI 上清理
    const imageToSend = currentImageBase64;
    removeImageBtn.click(); // 清空预览

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text || "请解释图片内容",
                session_id: currentSessionId || "default_session",
                current_profile: globalProfile || null,
                image_base64: imageToSend || null,
                chat_history: currentSessionData.chatHistory.slice(-7, -1).map(msg => ({ role: msg.role, text: msg.text }))
            })
        });

        if (!response.ok) throw new Error('API请求失败');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop(); // 保留不完整的部分

            for (const part of parts) {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.type === 'progress') {
                            loadingTextNode.textContent = data.message;
                        } else if (data.type === 'result') {
                            renderChatResult(data.data);
                        }
                    } catch (e) {
                        console.error('JSON Parse err:', e, jsonStr);
                    }
                }
            }
        }
    } catch (error) {
        appendMessage('ai', `❌ 抱歉，处理您的请求时发生了错误：${error.message}`);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function renderChatResult(data) {
    appendMessage('ai', data.reply);

    // 更新画像
    updateProfileUI(data.updated_profile);

    // 清理大模型可能输出的多余 Markdown 栅栏
    const cleanMD = (str) => {
        if (!str) return '生成失败';
        let s = str.trim();
        // 匹配整个回复被包裹在 ```xxx ... ``` 中的情况
        const match = s.match(/^```([a-zA-Z]*)\s*([\s\S]*?)```$/);
        if (match) {
            const lang = match[1].toLowerCase();
            if (lang === 'markdown' || lang === 'md' || lang === '') {
                return match[2].trim();
            }
        }
        return s;
    };

    // 更新路径规划
    if (data.learning_path) {
        currentSessionData.learning_path = cleanMD(data.learning_path);
        pathContent.innerHTML = marked.parse(currentSessionData.learning_path);
    }

    // 更新多模态资源
    if (data.resources) {
        currentSessionData.resources = data.resources;
        hideEmptyStates();
        resEls.doc.innerHTML = marked.parse(cleanMD(data.resources.explanation_doc));
        resEls.code.innerHTML = marked.parse(cleanMD(data.resources.code_examples));
        resEls.ext.innerHTML = marked.parse(cleanMD(data.resources.extended_reading));
        resEls.rec.innerHTML = marked.parse(cleanMD(data.resources.resource_push));
    }

    // 触发保存并渲染数学公式
    saveSessionData();
    if (window.MathJax) {
        MathJax.typesetPromise().catch((err) => console.log('MathJax error: ', err));
    }
    saveSessionData();
}

// ============================
// 3. 思维导图独立流式处理
// ============================
async function sendMapRequest() {
    const text = mapInput.value.trim();
    if (!text) return;

    loadingOverlay.style.display = 'flex';
    loadingTextNode.textContent = '🗺️ 制图智能体准备就绪...';

    try {
        const response = await fetch('/api/mindmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: text })
        });

        if (!response.ok) throw new Error('API请求失败');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.type === 'progress') {
                            loadingTextNode.textContent = data.message;
                        } else if (data.type === 'result') {
                            const mapCode = data.data.mind_map_mermaid;
                            currentSessionData.mind_map = mapCode;
                            saveSessionData();
                            renderMapResultUI(mapCode);
                        }
                    } catch (e) {
                        console.error('JSON Parse err:', e);
                    }
                }
            }
        }
    } catch (err) {
        alert('生成导图失败：' + err.message);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function renderMapResultUI(mermaidStr) {
    if (!mermaidStr) return;

    const mapEmpty = resEls.map.querySelector('.empty-state');
    if (mapEmpty) mapEmpty.style.display = 'none';

    let match = mermaidStr.match(/```mermaid([\s\S]*?)```/i);
    let mermaidCode = match ? match[1].trim() : mermaidStr.replace(/```mermaid/gi, '').replace(/```/g, '').trim();

    // 保证有容器存在
    if (!document.getElementById('mermaid-container')) {
        resEls.map.innerHTML = '<div id="mermaid-container"></div>';
    }

    const container = document.getElementById('mermaid-container');
    container.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;

    try {
        if (mermaid.run) {
            mermaid.run({ querySelector: '.mermaid' });
        } else {
            mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        }
    } catch (e) {
        container.innerHTML = `<p style="color:#ff6b6b;">语法复杂渲染失败，请看原始代码：</p><pre style="white-space:pre-wrap;">${mermaidCode}</pre>`;
    }
}

// ============================
// 3.5 PPT 生成与渲染逻辑
// ============================
const pptInput = document.getElementById('ppt-input');
const pptReqInput = document.getElementById('ppt-req-input');
const pptBtn = document.getElementById('ppt-btn');
const pptDownloadBtn = document.getElementById('ppt-download-btn');
const pptEmptyState = document.getElementById('ppt-empty-state');
const pptContainer = document.getElementById('ppt-container');
let currentPptJson = null;

async function sendPptRequest() {
    if (!pptInput || !pptReqInput) return;
    const text = pptInput.value.trim();
    const reqText = pptReqInput.value.trim();
    
    if (!text || !reqText) {
        alert("请将【PPT 核心主题】与【具体要求】都填写完整后再生成！");
        return;
    }

    pptEmptyState.style.display = 'none';
    pptContainer.style.display = 'none';
    pptDownloadBtn.style.display = 'none';
    currentPptJson = null;

    loadingOverlay.style.display = 'flex';
    const loadingTextNode = loadingOverlay.querySelector('p');
    loadingTextNode.textContent = '🚀 正在结合您的学习画像初始化 PPT 引擎...';

    try {
        const response = await fetch('/api/generate_ppt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                topic: text,
                requirements: reqText,
                current_profile: currentSessionData.user_profile
            })
        });

        if (!response.ok) throw new Error('API请求失败');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.type === 'progress') {
                            loadingTextNode.textContent = data.message;
                        } else if (data.type === 'result') {
                            let rawJsonStr = data.data.ppt_json;
                            currentPptJson = JSON.parse(rawJsonStr);
                            currentSessionData.ppt_json = currentPptJson;
                            saveSessionData();
                            renderPPTResultUI(currentPptJson);
                        }
                    } catch (e) {
                        console.error('JSON Parse err:', e);
                    }
                }
            }
        }
    } catch (err) {
        alert('生成 PPT 失败：' + err.message);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function renderPPTResultUI(pptData) {
    if (!pptData || !pptContainer) return;
    
    pptEmptyState.style.display = 'none';
    pptContainer.style.display = 'block';
    pptDownloadBtn.style.display = 'inline-block';
    pptContainer.style.maxWidth = '100%';
    pptContainer.style.width = '100%';
    
    // Theme extraction with fallbacks
    const tBg = (pptData.theme && pptData.theme.background) ? pptData.theme.background : '#ffffff';
    const tText = (pptData.theme && pptData.theme.text_color) ? pptData.theme.text_color : '#34495e';
    const tAccent = (pptData.theme && pptData.theme.accent_color) ? pptData.theme.accent_color : '#3498db';

    let html = `<div style="border: 2px solid ${tAccent}; border-radius: 12px; overflow: hidden; background: ${tBg}; color: ${tText}; box-shadow: 0 10px 20px rgba(0,0,0,0.3); margin: 20px auto; position: relative; width: 100%; min-width: 800px;">`;
    
    // 幻灯片容器（经典 16:9 Hack）
    html += `<div id="ppt-slides-wrapper" style="position: relative; width: 100%; padding-bottom: 56.25%; background: ${tBg};">`;
    
    // 内层绝对定位充满容器，用于承载所有 Slide
    html += `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">`;
    
    // 封面页 (index 0)
    html += `
        <div class="ppt-slide" style="position: absolute; top:0; left:0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, ${tBg} 0%, rgba(0,0,0,0.1) 100%); padding: 8%; box-sizing: border-box;">
            <h1 style="font-size: 54px; color: ${tText}; margin-bottom: 20px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.1); letter-spacing: 2px;">${pptData.title || 'AI 生成演示文稿'}</h1>
            ${pptData.subtitle ? `<p style="font-size: 24px; color: ${tAccent}; opacity: 0.9; margin-bottom: 30px; font-weight: 500;">${pptData.subtitle}</p>` : ''}
        </div>
    `;
    
    // 注入 Mermaid 的缩放约束样式
    html += `<style>.ppt-slide .mermaid-container svg { max-width: 100%; max-height: 100%; height: auto; }</style>`;
    
    // 内容页
    if (pptData.slides && pptData.slides.length > 0) {
        pptData.slides.forEach((slide, index) => {
            if (slide.layout_type === 'quote') {
                let citationHtml = slide.citation ? `<div style="margin-top: 30px; font-size: 20px; color: ${tAccent}; font-style: italic;">${slide.citation}</div>` : '';
                html += `
                    <div class="ppt-slide" style="position: absolute; top:0; left:0; width: 100%; height: 100%; display: none; padding: 40px; box-sizing: border-box; background: ${tBg}; flex-direction: column; justify-content: center; align-items: center; overflow: hidden; text-align: center;">
                        <h2 style="font-size: 24px; color: ${tText}; margin-bottom: 50px; letter-spacing: 2px; text-transform: uppercase; border-left: 6px solid ${tAccent}; padding-left: 15px; align-self: flex-start;">${slide.title}</h2>
                        <div style="position: relative; font-size: 38px; font-weight: bold; color: ${tText}; line-height: 1.6; max-width: 85%; padding: 0 40px;">
                            <span style="position: absolute; top: -30px; left: -20px; font-size: 80px; color: ${tAccent}; opacity: 0.2; font-family: serif;">"</span>
                            ${(slide.content || []).join('<br>')}
                            <span style="position: absolute; bottom: -50px; right: -20px; font-size: 80px; color: ${tAccent}; opacity: 0.2; font-family: serif;">"</span>
                        </div>
                        ${citationHtml}
                    </div>
                `;
            } else if (slide.layout_type === 'cards' && slide.cards_data) {
                let cardsHtml = slide.cards_data.map(card => `
                    <div style="flex: 1; min-width: 200px; background: rgba(255,255,255,0.8); border-radius: 12px; padding: 30px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.04); display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s;">
                        <div style="font-size: 48px; margin-bottom: 20px;">${card.icon || '📌'}</div>
                        <h3 style="font-size: 22px; color: ${tText}; margin-top: 0; margin-bottom: 15px; font-weight: bold;">${card.title}</h3>
                        <p style="font-size: 16px; color: #666; line-height: 1.6; margin: 0;">${card.desc}</p>
                    </div>
                `).join('');
                
                html += `
                    <div class="ppt-slide" style="position: absolute; top:0; left:0; width: 100%; height: 100%; display: none; padding: 40px; box-sizing: border-box; background: ${tBg}; flex-direction: column; overflow: hidden;">
                        <h2 style="font-size: 28px; color: ${tText}; margin-bottom: 30px; border-left: 6px solid ${tAccent}; padding-left: 15px; flex-shrink: 0; font-weight: bold; align-self: flex-start;">${slide.title}</h2>
                        <div style="display: flex; flex-direction: row; gap: 24px; flex-grow: 1; flex-wrap: wrap; align-items: stretch; justify-content: center; padding: 20px 0;">
                            ${cardsHtml}
                        </div>
                    </div>
                `;
            } else if (slide.layout_type === 'image_text') {
                let leftContentHtml = '';
                if (slide.cards_data && slide.cards_data.length > 0) {
                    leftContentHtml = slide.cards_data.map(card => `
                        <div style="background: rgba(255,255,255,0.7); border-radius: 10px; padding: 20px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-left: 4px solid ${tAccent};">
                            <div style="font-size: 18px; font-weight: bold; color: ${tText}; margin-bottom: 8px;">${card.icon || ''} ${card.title}</div>
                            <div style="font-size: 14px; color: #555; line-height: 1.5;">${card.desc}</div>
                        </div>
                    `).join('');
                } else {
                    leftContentHtml = `<ul style="font-size: 20px; line-height: 1.8; color: ${tText}; padding-left: 20px; flex: 1; overflow-y: auto;">
                        ${(slide.content || []).map(item => `<li style="margin-bottom: 10px;">${item}</li>`).join('')}
                    </ul>`;
                }

                let rawKeyword = slide.image_keyword || 'technology';
                let seed = encodeURIComponent(rawKeyword + index);
                let imageUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`;
                
                
                html += `
                    <div class="ppt-slide" style="position: absolute; top:0; left:0; width: 100%; height: 100%; display: none; padding: 40px; box-sizing: border-box; background: ${tBg}; flex-direction: column; overflow: hidden;">
                        <h2 style="font-size: 28px; color: ${tText}; margin-bottom: 20px; border-left: 6px solid ${tAccent}; padding-left: 15px; flex-shrink: 0; font-weight: bold; align-self: flex-start;">${slide.title}</h2>
                        <div style="display: flex; flex-direction: row; gap: 30px; flex-grow: 1; overflow: hidden; padding: 10px 0;">
                            <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; justify-content: center;">
                                ${leftContentHtml}
                            </div>
                            <div style="flex: 1; display: flex; justify-content: center; align-items: center; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.1);">
                                <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23f0f0f0\\'/><text x=\\'50%\\' y=\\'50%\\' font-size=\\'20\\' fill=\\'%23999\\' text-anchor=\\'middle\\'>Failed to load</text></svg>'" />
                            </div>
                        </div>
                    </div>
                `;
            } else {
                let bodyHtml = '';
                
                let listHtml = `<ul style="font-size: 20px; line-height: 1.8; color: ${tText}; padding-left: 20px; flex: 1; overflow-y: auto;">
                    ${(slide.content || []).map(item => `<li style="margin-bottom: 10px;">${item}</li>`).join('')}
                </ul>`;

                if (slide.chart_mermaid) {
                    // 深度清理所有可能的转义残留 (匹配 \n 或 \\n)
                    let cleanMermaid = slide.chart_mermaid.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    let escapedMermaid = cleanMermaid.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    let chartId = 'mermaid-chart-' + Date.now() + '-' + index;
                    let chartHtml = `<div class="mermaid-container" id="${chartId}" data-mermaid-code="${escapedMermaid}" style="flex: 1; min-width: 0; background: rgba(0,0,0,0.02); border-radius: 8px; display: flex; justify-content: center; align-items: center; overflow: hidden; padding: 10px; border: 1px dashed #bdc3c7;">
                        <span style="color: #7f8c8d; font-size: 14px;">图表渲染中...</span>
                    </div>`;
                    
                    bodyHtml = `<div style="display: flex; flex-direction: row; gap: 20px; flex-grow: 1; overflow: hidden; margin-top: 10px;">
                        ${listHtml}
                        ${chartHtml}
                    </div>`;
                } else {
                    bodyHtml = `<div style="flex-grow: 1; overflow-y: auto; display: flex; margin-top: 10px;">
                        ${listHtml}
                    </div>`;
                }
                
                html += `
                    <div class="ppt-slide" style="position: absolute; top:0; left:0; width: 100%; height: 100%; display: none; padding: 40px; box-sizing: border-box; background: ${tBg}; flex-direction: column; overflow: hidden;">
                        <h2 style="font-size: 28px; color: ${tText}; margin-bottom: 20px; border-left: 6px solid ${tAccent}; padding-left: 15px; flex-shrink: 0; font-weight: bold;">${slide.title}</h2>
                        ${bodyHtml}
                    </div>
                `;
            }
        });
    }
    
    html += `</div></div>`; // 闭合绝对定位内层和 ppt-slides-wrapper
    
    // 底部控制面板 (上一页 / 下一页)
    let total = 1 + (pptData.slides ? pptData.slides.length : 0);
    html += `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 12px 20px; border-top: 1px solid #eaeaea;">
            <button id="ppt-prev-btn" style="padding: 8px 16px; background: #ecf0f1; border: 1px solid #bdc3c7; border-radius: 6px; cursor: pointer; color: #2c3e50; font-weight: bold; transition: all 0.2s;" disabled>上一页</button>
            <span id="ppt-page-indicator" style="font-size: 15px; color: #7f8c8d; font-weight: 600; letter-spacing: 1px;">1 / ${total}</span>
            <button id="ppt-next-btn" style="padding: 8px 16px; background: var(--accent); border: none; border-radius: 6px; cursor: pointer; color: white; font-weight: bold; transition: all 0.2s;">下一页</button>
        </div>
    </div>`;
    
    pptContainer.innerHTML = html;
    
    // 绑定翻页交互逻辑
    const slides = pptContainer.querySelectorAll('.ppt-slide');
    const prevBtn = document.getElementById('ppt-prev-btn');
    const nextBtn = document.getElementById('ppt-next-btn');
    const indicator = document.getElementById('ppt-page-indicator');
    let currentSlide = 0;
    const totalSlides = slides.length;
    
    function updateSlides() {
        slides.forEach((slide, idx) => {
            if (idx === currentSlide) {
                slide.style.display = 'flex';
            } else {
                slide.style.display = 'none';
            }
        });
        
        if (prevBtn) {
            prevBtn.disabled = (currentSlide === 0);
            prevBtn.style.opacity = (currentSlide === 0) ? '0.5' : '1';
            prevBtn.style.cursor = (currentSlide === 0) ? 'not-allowed' : 'pointer';
        }
        
        if (nextBtn) {
            nextBtn.disabled = (currentSlide === totalSlides - 1);
            if (currentSlide === totalSlides - 1) {
                nextBtn.style.background = '#ecf0f1';
                nextBtn.style.color = '#2c3e50';
                nextBtn.style.border = '1px solid #bdc3c7';
                nextBtn.style.opacity = '0.5';
                nextBtn.style.cursor = 'not-allowed';
            } else {
                nextBtn.style.background = 'var(--accent)';
                nextBtn.style.color = 'white';
                nextBtn.style.border = 'none';
                nextBtn.style.opacity = '1';
                nextBtn.style.cursor = 'pointer';
            }
        }
        
        if (indicator) {
            indicator.textContent = `${currentSlide + 1} / ${totalSlides}`;
        }
    }
    
    updateSlides(); // 初始化按钮状态
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentSlide > 0) {
                currentSlide--;
                updateSlides();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentSlide < totalSlides - 1) {
                currentSlide++;
                updateSlides();
            }
        });
    }

    // Initialize mermaid asynchronously with error handling
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        const containers = pptContainer.querySelectorAll('.mermaid-container');
        
        containers.forEach(async (container) => {
            const code = container.getAttribute('data-mermaid-code');
            const id = container.getAttribute('id') + '-svg';
            try {
                const { svg } = await mermaid.render(id, code);
                container.innerHTML = svg;
                container.style.border = 'none';
                container.style.background = 'transparent';
            } catch (e) {
                console.error("Mermaid render failed for chart", id, e);
                // Graceful fallback for syntax errors
                container.innerHTML = `<div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #fff3f3; border: 1px solid #ffcdd2; border-radius: 8px; padding: 20px; box-sizing: border-box;">
                    <span style="color: #e74c3c; font-weight: bold; margin-bottom: 10px;">⚠️ 图表语法错误 (已降级展示)</span>
                    <pre style="width: 100%; font-size: 12px; color: #c0392b; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; text-align: left; background: rgba(255,255,255,0.5); padding: 10px; border-radius: 4px;">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>`;
            }
        });
    }
}

function downloadPPT() {
    if (!currentPptJson) {
        alert("请先生成 PPT！");
        return;
    }
    
    // PptxGenJS 会自动在全局暴露出 PptxGenJS 构造函数
    let pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    
    let bgColor = (currentPptJson.theme && currentPptJson.theme.background) ? currentPptJson.theme.background.replace('#', '') : "FFFFFF";
    let textColor = (currentPptJson.theme && currentPptJson.theme.text_color) ? currentPptJson.theme.text_color.replace('#', '') : "34495E";
    let accentColor = (currentPptJson.theme && currentPptJson.theme.accent_color) ? currentPptJson.theme.accent_color.replace('#', '') : "2980B9";

    // 封面
    let slideTitle = pptx.addSlide();
    slideTitle.background = { color: bgColor };
    slideTitle.addText(currentPptJson.title || "AI 演示文稿", { x: 1, y: currentPptJson.subtitle ? 2.0 : 2.5, w: 8, h: 1.5, fontSize: 48, bold: true, color: accentColor, align: "center" });
    if (currentPptJson.subtitle) {
        slideTitle.addText(currentPptJson.subtitle, { x: 1, y: 3.2, w: 8, h: 0.8, fontSize: 24, color: textColor, align: "center", bold: true });
    }
    
    // 内容页
    if (currentPptJson.slides) {
        currentPptJson.slides.forEach(slideData => {
            let slide = pptx.addSlide();
            slide.background = { color: bgColor };
            
            if (slideData.layout_type === 'quote') {
                slide.addText(slideData.title, { x: 0.5, y: 0.8, w: 9, h: 0.6, fontSize: 20, bold: true, color: accentColor, align: "left" });
                let quoteText = (slideData.content || []).join('\n');
                slide.addText(`"${quoteText}"`, { x: 1, y: 1.8, w: 8, h: 2.5, fontSize: 32, bold: true, color: textColor, align: "center" });
                if (slideData.citation) {
                    slide.addText(slideData.citation, { x: 1, y: 4.5, w: 8, h: 0.8, fontSize: 18, color: accentColor, align: "right", italic: true });
                }
            } else if (slideData.layout_type === 'image_text') {
                // 标题左侧边框模拟
                slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.5, w: 0.1, h: 0.6, fill: { color: accentColor } });
                slide.addText(slideData.title, { x: 0.7, y: 0.5, w: 8.8, h: 0.6, fontSize: 32, bold: true, color: textColor });
                
                // 左侧内容或卡片
                if (slideData.cards_data && slideData.cards_data.length > 0) {
                    let cardY = 1.6;
                    let cardH = 1.0;
                    slideData.cards_data.forEach(card => {
                        slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: cardY, w: 4, h: cardH, fill: { color: "F8F9FA" }, line: { color: accentColor, width: 2 } });
                        slide.addText(`${card.icon || ''} ${card.title}`, { x: 0.6, y: cardY + 0.1, w: 3.8, h: 0.3, fontSize: 14, bold: true, color: textColor });
                        slide.addText(card.desc, { x: 0.6, y: cardY + 0.4, w: 3.8, h: 0.5, fontSize: 11, color: "666666", valign: "top" });
                        cardY += cardH + 0.2;
                    });
                } else {
                    let bullets = (slideData.content || []).map(txt => ({ text: txt }));
                    slide.addText(bullets, { x: 0.5, y: 1.5, w: 4, h: 3.5, fontSize: 20, color: textColor, bullet: true, lineSpacing: 25 });
                }

                // 右侧动态配图 (使用极简抽象几何图形，绝对稳定且专业)
                let rawKeyword = slideData.image_keyword || 'technology';
                let seed = encodeURIComponent(rawKeyword + Math.floor(Math.random()*1000));
                let imageUrl = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`;
                try {
                    slide.addImage({ x: 5.0, y: 1.5, w: 4.5, h: 3.5, path: imageUrl });
                } catch(e) { console.error("Export image failed:", e); }
            } else if (slideData.layout_type === 'cards' && slideData.cards_data) {
                // 标题左侧边框模拟
                slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.5, w: 0.1, h: 0.6, fill: { color: accentColor } });
                slide.addText(slideData.title, { x: 0.7, y: 0.5, w: 8.8, h: 0.6, fontSize: 32, bold: true, color: textColor });
                
                let cardCount = slideData.cards_data.length;
                let startX = 0.5;
                let cardY = 1.8;
                let cardH = 3.2;
                let gapX = 0.4;
                let cardW = (9 - (cardCount - 1) * gapX) / cardCount;
                
                slideData.cards_data.forEach((card, i) => {
                    let cX = startX + i * (cardW + gapX);
                    // 背景卡片
                    slide.addShape(pptx.ShapeType.rect, { x: cX, y: cardY, w: cardW, h: cardH, fill: { color: "F8F9FA" }, line: { color: "EAEAEA", width: 1 } });
                    // 图标
                    slide.addText(card.icon || "📌", { x: cX, y: cardY + 0.2, w: cardW, h: 0.6, fontSize: 36, align: "center" });
                    // 卡片标题
                    slide.addText(card.title, { x: cX + 0.1, y: cardY + 1.0, w: cardW - 0.2, h: 0.4, fontSize: 16, bold: true, color: textColor, align: "center" });
                    // 卡片正文
                    slide.addText(card.desc, { x: cX + 0.1, y: cardY + 1.5, w: cardW - 0.2, h: 1.5, fontSize: 12, color: "666666", align: "center", valign: "top" });
                });
            } else {
                // 标准版式标题左侧边框模拟
                slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.5, w: 0.1, h: 0.6, fill: { color: accentColor } });
                slide.addText(slideData.title, { x: 0.7, y: 0.5, w: 8.8, h: 0.6, fontSize: 32, bold: true, color: textColor });
                // 列表
                let bullets = (slideData.content || []).map(txt => ({ text: txt }));
                slide.addText(bullets, { x: 0.5, y: 1.8, w: 9, h: 3.5, fontSize: 24, color: textColor, bullet: true, lineSpacing: 35 });
                
                // 说明图表不支持导出
                if (slideData.chart_mermaid) {
                     slide.addText("[注：网页端生成的 Mermaid 图表暂无法直接导出至 PPTX]", { x: 0.5, y: 5.5, w: 9, h: 0.5, fontSize: 12, color: "7F8C8D", italic: true });
                }
            }
        });
    }
    
    pptx.writeFile({ fileName: `${currentPptJson.title || 'AI_Presentation'}.pptx` });
}

// ============================
// 4. 事件绑定 & 初始化
// ============================

// 主题切换绑定
if (themeToggleBtn) {
    themeToggleBtn.innerHTML = savedTheme === 'dark' ? '☀️' : '🌙';
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeToggleBtn.innerHTML = '🌙';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggleBtn.innerHTML = '☀️';
        }
    });
}

sendBtn.addEventListener('click', sendChatRequest);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatRequest();
});

if (mapBtn) {
    mapBtn.addEventListener('click', sendMapRequest);
}
if (mapInput) {
    mapInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMapRequest();
    });
}
if (pptBtn) {
    pptBtn.addEventListener('click', sendPptRequest);
}
if (pptInput) {
    pptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendPptRequest();
    });
}
if (pptDownloadBtn) {
    pptDownloadBtn.addEventListener('click', downloadPPT);
}

// 页面加载完成后加载会话
window.addEventListener('DOMContentLoaded', () => {
    loadSessions();
});
