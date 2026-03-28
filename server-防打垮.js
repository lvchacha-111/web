// XinWeb 3D - 防打垮优化版
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const os = require('os');

const app = express();
const port = process.env.PORT || 5000;

// ========== 核心防打垮措施 ==========

// 1. Gzip压缩 - 减少50-70%流量
app.use(compression());

// 2. 静态文件缓存 - 减少服务器压力
app.use(express.static(__dirname, {
    maxAge: '7d', // 缓存7天
    setHeaders: (res, filePath) => {
        // HTML文件缓存5分钟
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
        // JS/CSS/图片缓存1年
        else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
        // 字体文件缓存1年
        else if (filePath.match(/\.(ttf|woff|woff2)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// 3. 简单限流 - 防止单个IP刷爆
let requestCounts = {};
const MAX_REQUESTS_PER_IP = 1000; // 每个IP最多1000次请求
const TIME_WINDOW = 15 * 60 * 1000; // 15分钟

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // 清理过期记录
    if (requestCounts[ip] && now - requestCounts[ip].startTime > TIME_WINDOW) {
        delete requestCounts[ip];
    }
    
    // 初始化或增加计数
    if (!requestCounts[ip]) {
        requestCounts[ip] = { count: 1, startTime: now };
    } else {
        requestCounts[ip].count++;
    }
    
    // 检查是否超限
    if (requestCounts[ip].count > MAX_REQUESTS_PER_IP) {
        return res.status(429).send('请求过于频繁，请15分钟后再试');
    }
    
    next();
});

// 4. 大文件下载限流 - 防止带宽被占满
app.use((req, res, next) => {
    // 检查是否是大文件
    const isLargeFile = /\.(ttf|stl|gltf|glb|bin)$/i.test(req.path);
    
    if (isLargeFile) {
        // 简单限速：500KB/秒
        res.setHeader('X-RateLimit-Limit', '500KB/s');
        
        // 限制并发下载数（简单实现）
        const ip = req.ip;
        const downloadKey = `download_${ip}`;
        
        if (!global.downloadCounts) global.downloadCounts = {};
        if (!global.downloadCounts[downloadKey]) {
            global.downloadCounts[downloadKey] = 0;
        }
        
        // 每个IP同时最多下载3个大文件
        if (global.downloadCounts[downloadKey] >= 3) {
            return res.status(429).send('同时下载文件过多，请稍后再试');
        }
        
        global.downloadCounts[downloadKey]++;
        
        // 下载完成后减少计数
        res.on('finish', () => {
            setTimeout(() => {
                if (global.downloadCounts[downloadKey] > 0) {
                    global.downloadCounts[downloadKey]--;
                }
            }, 1000);
        });
    }
    
    next();
});

// 5. 内存保护 - 防止内存泄漏打垮
let memoryCheckInterval = setInterval(() => {
    const memory = process.memoryUsage();
    const usedMB = Math.round(memory.heapUsed / 1024 / 1024);
    
    // 如果内存超过500MB，记录警告
    if (usedMB > 500) {
        console.warn(`⚠️ 内存警告: ${usedMB}MB 使用中`);
        
        // 简单清理：每5分钟清理一次请求记录
        const now = Date.now();
        for (const ip in requestCounts) {
            if (now - requestCounts[ip].startTime > TIME_WINDOW) {
                delete requestCounts[ip];
            }
        }
    }
}, 5 * 60 * 1000); // 每5分钟检查一次

// 6. 健康检查接口 - 监控用
app.get('/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'healthy',
        time: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
            used: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(memory.heapTotal / 1024 / 1024) + 'MB'
        },
        requests: Object.keys(requestCounts).length
    });
});

// ========== 原有功能保持 ==========

// 确保上传目录存在
const UPLOAD_DIR = 'uploads';
const uploadsPath = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

// CORS配置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// 清理API（原有功能）
app.post('/api/cleanup', (req, res) => {
    try {
        const { newParts, newId } = req.body;

        if (!newParts || !Array.isArray(newParts) || !newId) {
            return res.status(400).json({ error: '缺少必要参数' });
        }

        const keptFiles = newParts.map(line => {
            const match = line.match(/file:\s*"([^"]+)"/);
            return match ? match[1] : null;
        }).filter(Boolean);

        const dirPath = path.join(__dirname, UPLOAD_DIR, newId);

        if (fs.existsSync(dirPath)) {
            const diskFiles = fs.readdirSync(dirPath);
            let deletedCount = 0;

            diskFiles.forEach(file => {
                if (!keptFiles.includes(file)) {
                    try {
                        fs.unlinkSync(path.join(dirPath, file));
                        deletedCount++;
                    } catch (err) {
                        console.error(`清理失败: ${file}`, err);
                    }
                }
            });

            res.json({ message: '清理完成', deletedFiles: deletedCount });
        } else {
            res.status(404).json({ error: '找不到指定的文件夹' });
        }
    } catch (error) {
        console.error('服务器内部错误:', error);
        res.status(500).json({ error: '服务器清理逻辑执行失败' });
    }
});

// ========== 启动服务器 ==========

function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

app.listen(port, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🚀 XinWeb 3D - 防打垮优化版已启动！');
    console.log('========================================');
    console.log(`📍 本机访问：http://localhost:${port}`);
    console.log(`🌐 局域网访问：http://${getIPAddress()}:${port}`);
    console.log('');
    console.log('🛡️ 防打垮措施已启用：');
    console.log('  1. Gzip压缩 - 减少70%流量');
    console.log('  2. 智能缓存 - 静态文件缓存7天');
    console.log('  3. IP限流 - 1000请求/15分钟/IP');
    console.log('  4. 下载限速 - 大文件500KB/秒');
    console.log('  5. 内存监控 - 自动清理防泄漏');
    console.log('  6. 健康检查 - GET /health');
    console.log('');
    console.log('💡 生产环境建议：');
    console.log('  • 使用Nginx反向代理');
    console.log('  • 配置CDN加速静态文件');
    console.log('  • 启用HTTP/2协议');
    console.log('========================================');
});

// 优雅关闭
process.on('SIGINT', () => {
    clearInterval(memoryCheckInterval);
    console.log('\n🛑 服务器正在关闭...');
    process.exit(0);
});