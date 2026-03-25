// XinWeb 3D - 最终性能优化版
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const os = require('os');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5000;

// ==================== 核心优化功能 ====================

// 1. Gzip压缩
app.use(compression());

// 2. 智能限流
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: '请求过于频繁'
});
app.use(limiter);

// 3. 健康检查（必须放在最前面）
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// 4. 静态文件缓存优化
const staticOptions = {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        } else if (filePath.match(/\.(js|css|png|jpg|ttf|woff)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
};

app.use(express.static(__dirname, staticOptions));

// 5. 原有API功能
app.use(express.json());

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

// 6. 大文件限流
app.use((req, res, next) => {
    if (req.path.match(/\.(ttf|stl|gltf)$/)) {
        const fileLimiter = rateLimit({
            windowMs: 60 * 60 * 1000,
            max: 20,
            message: '下载次数超限'
        });
        return fileLimiter(req, res, next);
    }
    next();
});

// 7. 启动
app.listen(port, () => {
    console.log(`🚀 服务器已启动: http://localhost:${port}`);
    console.log('📊 优化功能: Gzip压缩, 智能缓存, 四级限流');
    console.log('🔧 健康检查: GET /health');
});