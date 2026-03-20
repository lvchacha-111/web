const express = require('express');
const path = require('path');
const compression = require('compression'); // <-- 必须加上这一行！
const app = express();
const port = 5000;
app.use(compression());
// 允许所有静态文件访问
app.use(express.static(path.join(__dirname)));

// 添加 CORS 头（如果从不同端口加载资源）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 3D Web 服务器已启动！');
  console.log(`📍 本机访问：http://localhost:${port}`);
  console.log(`🌐 局域网访问：http://${getIPAddress()}:${port}`);
});
const keptFiles = newParts.map(line => {
    const match = line.match(/file:\s*"([^"]+)"/);
    return match ? match[1] : null;
}).filter(Boolean);

// 2. 读取硬盘文件夹里所有的文件
const dirPath = path.join(__dirname, UPLOAD_DIR, newId);
if (fs.existsSync(dirPath)) {
    const diskFiles = fs.readdirSync(dirPath);
    
    // 3. 找出那些“在硬盘里但不在配置单里”的文件，并删掉
    diskFiles.forEach(file => {
        if (!keptFiles.includes(file)) {
            try {
                fs.unlinkSync(path.join(dirPath, file));
                console.log(`已清理冗余文件: ${file}`);
            } catch (err) {
                console.error(`清理失败: ${file}`, err);
            }
        }
    });
}
// 获取本机IP地址的函数
function getIPAddress() {
  const interfaces = require('os').networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}