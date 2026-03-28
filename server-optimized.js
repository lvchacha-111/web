// XinWeb 3D - 性能优化版
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const os = require('os');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5000;
const UPLOAD_DIR = 'uploads';

// ==================== 1. 性能优化中间件 ====================

// 1.1 Gzip压缩
app.use(compression());

// 1.2 全局限流
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: '请求过于频繁，请稍后再试'
});
app.use(globalLimiter);

// 1.3 API限流
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'API调用过于频繁'
});
app.use(/^\/api\//, apiLimiter);

// ==================== 2. 健康检查接口（必须放在最前面） ====================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/status', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        server: {
            uptime: Math.floor(process.uptime()),
            nodeVersion: process.version
        },
        memory: {
            rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
        }
    });
});

// 1.4 基础中间件
app.use(express.json());
app.use(cookieParser());
    const memory = process.memoryUsage();
    res.json({
        server: {
            uptime: Math.floor(process.uptime()),
            nodeVersion: process.version
        },
        memory: {
            rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
        }
    });
});

// ==================== 3. 静态文件服务（带缓存优化） ====================

const staticOptions = {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.match(/\.(html|htm)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=300');
        } else if (filePath.match(/\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
};

app.use(express.static(path.join(__dirname), staticOptions));

// ==================== 4. 原有API功能 ====================

// 确保上传目录存在
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

// ==================== 5. 大文件下载限流 ====================

app.use((req, res, next) => {
    const largeFiles = ['.ttf', '.stl', '.bin', '.gltf', '.glb'];
    const isLargeFile = largeFiles.some(ext => req.path.endsWith(ext));
    
    if (isLargeFile) {
        const fileLimiter = rateLimit({
            windowMs: 60 * 60 * 1000,
            max: 20,
            message: '大文件下载次数超限'
        });
        return fileLimiter(req, res, next);
    }
    
    next();
});

// ==================== 6. 内存监控 ====================

setInterval(() => {
    const memory = process.memoryUsage();
    const heapUsedMB = Math.round(memory.heapUsed / 1024 / 1024);
    
    if (heapUsedMB > 500) {
        console.warn(`[内存警告] 堆内存使用: ${heapUsedMB}MB`);
    }
}, 5 * 60 * 1000);

// ==================== 7. 启动服务器 ====================

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
    console.log('🚀 3D Web 服务器已启动（性能优化版）！');
    console.log(`📍 本机访问：http://localhost:${port}`);
    console.log(`🌐 局域网访问：http://${getIPAddress()}:${port}`);
    console.log('------------------------------------------');
    console.log('📊 性能优化已启用：');
    console.log('  • Gzip压缩：已启用');
    console.log('  • 静态缓存：智能缓存策略');
    console.log('  • 全局限流：1000请求/15分钟/IP');
    console.log('  • API限流：100请求/15分钟/IP');
    console.log('  • 大文件限流：20次/小时/IP');
    console.log('  • 内存监控：每5分钟检查');
    console.log('------------------------------------------');
    console.log('🔧 监控接口：');
    console.log('  • 健康检查：GET http://localhost:5000/health');
    console.log('  • 性能状态：GET http://localhost:5000/api/status');
    console.log('  • 清理接口：POST http://localhost:5000/api/cleanup');
    console.log('------------------------------------------');
});