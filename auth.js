(function() {
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
    
    // 检查权限
    function checkAccess() {
        const status = localStorage.getItem('yj_vip_status');
        if (status === 'lifetime') return true; 
        
        if (status === 'temporary') {
            const expiry = localStorage.getItem('yj_vip_expiry');
            if (expiry && new Date().getTime() < parseInt(expiry)) {
                return true; 
            }
        }
        return false; 
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
    if (!checkAccess()) {
        // 如果一开始就没权限，瞬间锁屏（不加动画），防止闪屏
        const overlay = document.getElementById('authOverlay');
        overlay.style.transition = 'none'; 
        overlay.classList.add('locked');
        // 恢复动画属性，为了下一次渐变
        setTimeout(() => overlay.style.transition = 'opacity 2.5s ease-in-out', 100);
    }

    // 定时器：每 1 秒检查一次
    setInterval(() => {
        // 只有当没有锁屏的时候才检查
        if (!document.getElementById('authOverlay').classList.contains('locked')) {
            if (!checkAccess()) {
                // 时间到！触发缓慢变黑
                localStorage.removeItem('yj_vip_status');
                localStorage.removeItem('yj_vip_expiry');
                document.getElementById('authCodeInput').value = ""; 
                
                toggleLock(true, "试用体验结束，屏幕即将关闭。<br>请重新输入邀请码续费。");
            }
        }
    }, 1000);

    // 解锁提示
    function showWelcome(text) {
        const toast = document.getElementById('toast');
        toast.innerText = text;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 3000);
    }

    // 验证按钮点击
    document.getElementById('verifyAuthBtn').addEventListener('click', () => {
        const code = document.getElementById('authCodeInput').value.trim().toUpperCase(); 
        const msg = document.getElementById('authMsg');
        const now = new Date().getTime();
        let isValid = false;
        let welcomeMsg = "";

        if (code.length >= 10) { 
            if (code.startsWith('YJ-LIFE-')) {
                localStorage.setItem('yj_vip_status', 'lifetime');
                welcomeMsg = "👑 尊贵的买断会员，欢迎回来！";
                isValid = true;
            } 
            else if (code.startsWith('YJ-30D-')) {
                localStorage.setItem('yj_vip_status', 'temporary');
                localStorage.setItem('yj_vip_expiry', now + (30 * 24 * 60 * 60 * 1000));
                welcomeMsg = "💎 包月权限已激活！";
                isValid = true;
            }
            else if (code.startsWith('YJ-1D-')) {
                localStorage.setItem('yj_vip_status', 'temporary');
                localStorage.setItem('yj_vip_expiry', now + (24 * 60 * 60 * 1000));
                welcomeMsg = "✨ 日租权限已激活！";
                isValid = true;
            }
            else if (code.startsWith('YJ-2M-')) {
                localStorage.setItem('yj_vip_status', 'temporary');
                localStorage.setItem('yj_vip_expiry', now + (10* 1000)); // 2分钟
                welcomeMsg = "⏱️ 试用通道开启！";
                isValid = true;
            }
        }

        if (isValid) {
            msg.innerText = "";
            toggleLock(false); // 解锁，屏幕慢慢变亮
            showWelcome(welcomeMsg);
        } else {
            msg.innerText = "邀请码无效";
        }
    });
    
    document.getElementById('authCodeInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('verifyAuthBtn').click();
    });

})();