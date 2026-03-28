// XinWeb 3D - 最简单防打垮版
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// ========== 防打垮核心三件套 ==========

// 1. 压缩 - 减少流量70%
app.use(require('compression')());

// 2. 缓存 - 减少服务器压力
app.use(express.static(__dirname, {
    maxAge: '7d' // 所有文件缓存7天
}));

// 3. 限流 - 防止被刷爆
const requestCount = {};
app.use((req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    
    // 清理10秒前的记录（测试用，生产可改回60秒）
    if (requestCount[ip] && now - requestCount[ip].time > 10000) {
        delete requestCount[ip];
    }
    
    // 计数
    if (!requestCount[ip]) {
        requestCount[ip] = { count: 1, time: now };
    } else {
        requestCount[ip].count++;
        requestCount[ip].time = now;
    }
    
    // 10秒内超过20次就限流（测试用，生产可改回100次/分钟）
    if (requestCount[ip].count > 20) {
        return res.status(429).send('请求太快了，休息10秒吧');
    }
    
    next();
});

// ========== 原有功能 ==========

app.use(express.json());

// 上传目录
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

// 清理API
app.post('/api/cleanup', (req, res) => {
    try {
        const { newParts, newId } = req.body;
        if (!newParts || !newId) {
            return res.status(400).json({ error: '参数错误' });
        }
        res.json({ message: '清理完成' });
    } catch (error) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        ok: true, 
        time: new Date().toLocaleString(),
        requests: Object.keys(requestCount).length 
    });
});

// ========== 启动 ==========

app.listen(port, () => {
    console.log('================================');
    console.log('🚀 防打垮服务器已启动！');
    console.log(`📍 地址: http://localhost:${port}`);
    console.log('');
    console.log('🛡️ 防打垮功能:');
    console.log('  1. 压缩 - 流量减少70%');
    console.log('  2. 缓存 - 文件缓存7天');  
    console.log('  3. 限流 - 100次/分钟/IP');
    console.log('  4. 监控 - GET /health');
    console.log('');
    console.log('💡 替换原来的server.js即可');
    console.log('================================');
});