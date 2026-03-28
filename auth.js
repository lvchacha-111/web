(function() {
    // ============================================================
    // 服务器端验证配置
    // ============================================================
    const API_BASE_URL = window.location.origin; // 自动获取当前域名
    const VERIFY_API = `${API_BASE_URL}/api/verify-invite`;
    const CHECK_SESSION_API = `${API_BASE_URL}/api/check-session`;
    
    // ============================================================
    // 1. 注入 CSS (核心：使用 opacity 做呼吸渐变效果)
    // ============================================================
    const style = document.createElement('style');
    style.innerHTML = `
        /* 遮罩层默认存在，但是是透明的，且不挡鼠标点击 */
        #authOverlay { 
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: #000000; 
            z-index: 2147483647; 
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            
            /* 关键动画设置 */
            opacity: 0;             /* 一开始透明 */
            pointer-events: none;   /* 透明时允许鼠标穿透点击下面的模型 */
            transition: opacity 2.5s ease-in-out; /* 2.5秒缓慢变黑 */
        }

        /* 当添加了 .locked 类名时，变成不透明，且阻挡鼠标 */
        #authOverlay.locked {
            opacity: 1;
            pointer-events: auto;
        }

        .auth-box { 
            background: rgba(20, 20, 20, 0.9); 
            padding: 40px; border-radius: 8px; 
            box-shadow: 0 0 80px rgba(243, 156, 18, 0.1); 
            text-align: center; border: 1px solid #333; width: 320px; font-family: sans-serif; 
            
            /* 输入框也做一个延迟动画，等背景黑透了再出来 */
            opacity: 0;
            transform: translateY(20px);
            transition: all 1s ease 2s; /* 延迟2秒再显示输入框 */
        }

        /* 锁屏状态下，输入框显示 */
        #authOverlay.locked .auth-box {
            opacity: 1;
            transform: translateY(0);
        }

        .auth-box h2 { color: #e74c3c; margin-top: 0; letter-spacing: 2px; margin-bottom: 10px; font-size: 26px; }
        .auth-box p { color: #888; font-size: 14px; margin-bottom: 30px; }
        
        .auth-box input { width: 100%; box-sizing: border-box; padding: 15px; margin-bottom: 15px; background: #000; border: 1px solid #444; color: #f39c12; border-radius: 4px; font-size: 18px; outline: none; text-align: center; text-transform: uppercase; letter-spacing: 2px;}
        .auth-box button { width: 100%; background: #f39c12; color: #000; border: none; padding: 15px; border-radius: 4px; font-size: 16px; cursor: pointer; font-weight: bold; transition: 0.2s;}
        .auth-box button:hover { background: #fff; }
        .auth-msg { color: #e74c3c; font-size: 13px; min-height: 20px; margin-top: 10px;}
        
        #toast { position: fixed; top: 30px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #f39c12, #d68910); color: white; padding: 12px 30px; border-radius: 30px; font-weight: bold; font-size: 15px; z-index: 2147483647; opacity: 0; pointer-events: none; transition: opacity 0.5s ease; }
    `;
    document.head.appendChild(style);

    // ============================================================
    // 2. 注入 HTML
    // ============================================================
    const htmlContent = `
        <div id="authOverlay">
            <div class="auth-box">
                <h2 id="lockTitle">🚫 系统锁定</h2>
                <p id="lockDesc">请输入邀请码解锁体验</p>
                <input type="text" id="authCodeInput" placeholder="输入邀请码" autocomplete="off">
                <button id="verifyAuthBtn">解锁 / 续费</button>
                <div class="auth-msg" id="authMsg"></div>
            </div>
        </div>
        <div id="toast"></div>
    `;
    document.body.insertAdjacentHTML('beforeend', htmlContent);

    // ============================================================
    // 3. 逻辑控制
    // ============================================================
    
    // 检查权限 - 需要与服务器通信验证
    async function checkAccess() {
        // 先检查本地是否有缓存的会话信息
        const lastType = localStorage.getItem('last_session_type');
        const lastExpiry = localStorage.getItem('last_session_expiry');
        
        if (lastType === 'lifetime') {
            // 终身会员，但还需要服务器验证
            return await verifyWithServer();
        }
        
        if (lastType && lastExpiry) {
            const expiryTime = parseInt(lastExpiry);
            if (Date.now() < expiryTime) {
                // 本地缓存未过期，但仍需要服务器验证
                return await verifyWithServer();
            }
        }
        
        return false;
    }
    
    // 与服务器验证会话
    async function verifyWithServer() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/check-session`, {
                method: 'GET',
                credentials: 'include' // 包含cookie
            });
            
            if (response.status === 401) {
                // 会话无效，清除本地缓存
                localStorage.removeItem('last_session_type');
                localStorage.removeItem('last_session_expiry');
                return false;
            }
            
            return response.ok;
        } catch (error) {
            console.error('会话验证失败:', error);
            return false;
        }
    }

    // 执行锁屏动作 (淡入淡出核心)
    function toggleLock(isLocked, reasonText = "") {
        const overlay = document.getElementById('authOverlay');
        const title = document.getElementById('lockTitle');
        const desc = document.getElementById('lockDesc');
        
        if (isLocked) {
            // 锁屏：添加 class，触发 CSS 变黑动画
            overlay.classList.add('locked');
            if(reasonText) {
                title.innerText = "您的时间已到"; // 改大标题
                desc.innerHTML = reasonText;     // 改小字
            }
        } else {
            // 解锁：移除 class，变回透明
            overlay.classList.remove('locked');
            // 重置文案供下次使用
            setTimeout(() => {
                title.innerText = "🚫 系统锁定";
                desc.innerText = "请输入邀请码解锁体验";
            }, 3000); 
        }
    }

    // 初始化检查
    (async function initCheck() {
        const hasAccess = await checkAccess();
        if (!hasAccess) {
            // 如果一开始就没权限，瞬间锁屏（不加动画），防止闪屏
            const overlay = document.getElementById('authOverlay');
            overlay.style.transition = 'none'; 
            overlay.classList.add('locked');
            // 恢复动画属性，为了下一次渐变
            setTimeout(() => overlay.style.transition = 'opacity 2.5s ease-in-out', 100);
        }
    })();

    // 定时器：每 30 秒检查一次会话状态
    setInterval(async () => {
        // 只有当没有锁屏的时候才检查
        const overlay = document.getElementById('authOverlay');
        if (!overlay.classList.contains('locked')) {
            const hasAccess = await checkAccess();
            if (!hasAccess) {
                // 时间到！触发缓慢变黑
                localStorage.removeItem('last_session_type');
                localStorage.removeItem('last_session_expiry');
                document.getElementById('authCodeInput').value = ""; 
                
                toggleLock(true, "试用体验结束，屏幕即将关闭。<br>请重新输入邀请码续费。");
            }
        }
    }, 30000); // 30秒检查一次，减少服务器压力

    // 解锁提示
    function showWelcome(text) {
        const toast = document.getElementById('toast');
        toast.innerText = text;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 3000);
    }

    // 验证按钮点击 - 服务器端验证
    document.getElementById('verifyAuthBtn').addEventListener('click', async () => {
        const code = document.getElementById('authCodeInput').value.trim();
        const msg = document.getElementById('authMsg');
        const verifyBtn = document.getElementById('verifyAuthBtn');
        
        if (!code) {
            msg.innerText = "请输入邀请码";
            return;
        }
        
        // 禁用按钮防止重复点击
        verifyBtn.disabled = true;
        verifyBtn.textContent = "验证中...";
        msg.innerText = "";
        
        try {
            // 发送邀请码到服务器验证
            const response = await fetch(VERIFY_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ inviteCode: code }),
                credentials: 'include' // 包含cookie
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                msg.innerText = "";
                toggleLock(false); // 解锁，屏幕慢慢变亮
                showWelcome(data.message);
                
                // 存储服务器返回的会话信息（仅用于显示）
                localStorage.setItem('last_session_type', data.type);
                localStorage.setItem('last_session_expiry', data.expiry);
            } else {
                msg.innerText = data.error || "邀请码无效";
            }
            
        } catch (error) {
            console.error('验证请求失败:', error);
            msg.innerText = "网络错误，请重试";
        } finally {
            // 恢复按钮状态
            verifyBtn.disabled = false;
            verifyBtn.textContent = "解锁 / 续费";
        }
    });
    
    document.getElementById('authCodeInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('verifyAuthBtn').click();
    });

})();