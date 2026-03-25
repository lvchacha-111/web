require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises; // 异步文件处理，性能更好
const fsSync = require('fs');      // 用于启动时检查目录
const compression = require('compression');
const os = require('os');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5000;
const UPLOAD_DIR = 'uploads';

// --- 1. 性能与安全配置 ---

// 1.1 开启 Gzip 压缩（显著提升 3D 模型加载速度）
app.use(compression());

// 1.2 基础解析中间件
app.use(express.json());

// 1.3 跨域处理 (CORS) - 允许所有来源
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 1.4 全局限流（防止恶意刷流量，保护服务器不挂掉）
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 2000, // 每个IP最多2000个请求
    message: { error: '请求过于频繁' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// --- 2. 静态资源服务 (重点优化缓存) ---

const staticOptions = {
    maxAge: '7d', // 默认缓存7天
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        // 针对 3D 资源（模型、贴图、字体）设置强缓存，减少重复下载
        if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2|glb|gltf|stl|bin)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 缓存1年
        }
    }
};

// 允许直接访问当前目录下所有文件
app.use(express.static(path.join(__dirname), staticOptions));

// --- 3. 业务接口 ---

// 3.1 健康检查/性能状态
app.get('/api/status', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'online',
        uptime: Math.floor(process.uptime()) + 's',
        memory: {
            rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
        },
        nodeVersion: process.version
    });
});

// 3.2 清理冗余文件的接口 (修复了安全隐患和性能问题)
app.post('/api/cleanup', async (req, res) => {
    try {
        const { newParts, newId } = req.body;

        // 安全校验：防止通过 ".." 路径攻击删除系统文件
        if (!newId || typeof newId !== 'string' || newId.includes('.') || newId.includes('/') || newId.includes('\\')) {
            return res.status(400).json({ error: '无效的文件夹ID' });
        }

        if (!Array.isArray(newParts)) {
            return res.status(400).json({ error: 'newParts 格式错误' });
        }

        // 提取需要保留的文件名
        const keptFiles = newParts.map(line => {
            const match = line.match(/file:\s*"([^"]+)"/);
            return match ? match[1] : null;
        }).filter(Boolean);

        const dirPath = path.join(__dirname, UPLOAD_DIR, newId);

        try {
            await fs.access(dirPath);
            const diskFiles = await fs.readdir(dirPath);
            let deletedCount = 0;

            // 异步删除不再需要的文件
            for (const file of diskFiles) {
                if (!keptFiles.includes(file)) {
                    await fs.unlink(path.join(dirPath, file));
                    deletedCount++;
                }
            }
            res.json({ success: true, message: `清理完成，删除了 ${deletedCount} 个文件` });
        } catch (err) {
            res.status(404).json({ error: '找不到指定的资源文件夹' });
        }
    } catch (error) {
        console.error('清理失败:', error);
        res.status(500).json({ error: '服务器内部清理逻辑错误' });
    }
});

// --- 4. 启动服务器 ---

// 确保上传目录存在
const uploadsPath = path.join(__dirname, UPLOAD_DIR);
if (!fsSync.existsSync(uploadsPath)) {
    fsSync.mkdirSync(uploadsPath, { recursive: true });
}

app.listen(port, '0.0.0.0', () => {
    console.log(`
    🚀 3D展示服务器 (纯净公开版) 已启动！
    ------------------------------------------
    本机访问：http://localhost:${port}
    局域网访问：http://${getIPAddress()}:${port}
    
    性能模式：Gzip压缩 + 强缓存 (已开启)
    安全限制：无验证，所有人可看
    ------------------------------------------
    `);
});

// 获取本机IP地址的工具函数
function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) return alias.address;
        }
    }
    return 'localhost';
}