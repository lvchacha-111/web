const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const os = require('os');

const app = express();
const port = 5000;
const UPLOAD_DIR = 'uploads';

// --- 1. 中间件配置 ---
app.use(compression());
app.use(express.json()); // 支持解析 JSON 格式的请求体
app.use(express.static(path.join(__dirname))); // 允许访问静态文件

// 确保上传根目录存在，不存在则创建一个
const uploadsPath = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath);
}

// --- 2. CORS 跨域处理 ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// --- 3. 清理冗余文件的接口 (把原本报错的代码放在这里) ---
// 你可以从前端发送 POST 请求到 http://localhost:5000/api/cleanup
app.post('/api/cleanup', (req, res) => {
    try {
        const { newParts, newId } = req.body;

        // 验证必要参数
        if (!newParts || !Array.isArray(newParts) || !newId) {
            return res.status(400).json({ error: '缺少必要参数 newParts (数组) 或 newId (字符串)' });
        }

        // 1. 提取配置文件中需要保留的文件名
        const keptFiles = newParts.map(line => {
            const match = line.match(/file:\s*"([^"]+)"/);
            return match ? match[1] : null;
        }).filter(Boolean);

        // 2. 确定对应 ID 的文件夹路径
        const dirPath = path.join(__dirname, UPLOAD_DIR, newId);

        if (fs.existsSync(dirPath)) {
            const diskFiles = fs.readdirSync(dirPath);
            let deletedCount = 0;

            // 3. 找出并删除不在 keptFiles 列表中的文件
            diskFiles.forEach(file => {
                if (!keptFiles.includes(file)) {
                    try {
                        fs.unlinkSync(path.join(dirPath, file));
                        console.log(`已清理冗余文件: ${file}`);
                        deletedCount++;
                    } catch (err) {
                        console.error(`清理失败: ${file}`, err);
                    }
                }
            });

            res.json({ message: '清理完成', deletedFiles: deletedCount });
        } else {
            res.status(404).json({ error: '找不到指定的文件夹: ' + newId });
        }
    } catch (error) {
        console.error('服务器内部错误:', error);
        res.status(500).json({ error: '服务器清理逻辑执行失败' });
    }
});

// --- 4. 启动服务器 ---
app.listen(port, '0.0.0.0', () => {
    console.log('🚀 3D Web 服务器已启动！');
    console.log(`📍 本机访问：http://localhost:${port}`);
    console.log(`🌐 局域网访问：http://${getIPAddress()}:${port}`);
    console.log('------------------------------------------');
    console.log('清理接口地址：POST http://localhost:5000/api/cleanup');
});

// --- 5. 辅助工具函数 ---

// 获取本机IP地址
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