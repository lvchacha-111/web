const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

const UPLOAD_DIR = 'stl'; 
const IMAGE_DIR = 'images'; 

// 初始化文件夹
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const productId = req.body.productId;
        let targetDir = (file.fieldname === 'imageFile') ? 
            path.join(__dirname, IMAGE_DIR) : 
            path.join(__dirname, UPLOAD_DIR, productId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: function (req, file, cb) { cb(null, file.originalname); }
});
const upload = multer({ storage: storage });

// --- 核心：扫描 index.html 里的所有产品 ---
function getCurrentProducts() {
    const indexPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(indexPath)) return [];
    const content = fs.readFileSync(indexPath, 'utf8');
    
    // 1. 找到 products 数组的中括号内部内容
    const arrayMatch = content.match(/const\s+products\s*=\s*\[([\s\S]*?)\]/);
    if (!arrayMatch) return [];
    const arrayContent = arrayMatch[1];

    // 2. 识别每一组 { ... }
    const objectRegex = /\{([\s\S]*?)\}/g;
    const products = [];
    let match;
    while ((match = objectRegex.exec(arrayContent)) !== null) {
        const block = match[1];
        const idM = block.match(/id:\s*["']([^"']+)["']/);
        const nameM = block.match(/name:\s*["']([^"']+)["']/);
        if (idM) {
            products.push({ id: idM[1], name: nameM ? nameM[1] : idM[1] });
        }
    }
    return products;
}

// 主页面渲染
app.get('/', (req, res) => {
    const products = getCurrentProducts();
    const listHtml = products.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#111; padding:12px; margin-bottom:8px; border-radius:6px; border:1px solid #333;">
            <span><b>${p.id}</b> - ${p.name}</span>
            <button onclick="deleteProduct('${p.id}')" style="background:#ff4757; color:white; border:none; padding:6px 15px; border-radius:4px; cursor:pointer; font-size:12px;">删除</button>
        </div>
    `).join('');

    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>亿角 3D 管理后台</title>
        <style>
            body { font-family: sans-serif; background: #121212; color: #eee; padding: 40px; display: flex; flex-direction: column; align-items: center; }
            .box { width: 100%; max-width: 500px; background: #1e1e1e; padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); margin-bottom: 20px; border: 1px solid #333; }
            input { width: 100%; padding: 12px; margin: 8px 0; background: #000; border: 1px solid #444; color: #f39c12; border-radius: 6px; box-sizing: border-box; }
            button { width: 100%; padding: 15px; background: #f39c12; color: #000; border: none; font-weight: bold; border-radius: 6px; cursor: pointer; }
        </style>
        <script>
            function deleteProduct(id) {
                if(confirm('确定删除 [' + id + '] 吗？这将同时清理文件和代码。')) {
                    fetch('/delete/' + id, { method: 'DELETE' })
                    .then(res => res.text())
                    .then(msg => { alert(msg); location.reload(); });
                }
            }
        </script>
    </head>
    <body>
        <div class="box">
            <h2 style="color:#f39c12; text-align:center; margin-top:0;">🚀 上架新产品</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="text" name="productId" placeholder="产品 ID (如: YJ-M002X)" required>
                <input type="text" name="productName" placeholder="产品名称" required>
                <p style="font-size:12px; color:#666;">封面图:</p><input type="file" name="imageFile" accept="image/*" required>
                <p style="font-size:12px; color:#666;">5个模型文件:</p>
                <input type="file" name="front" required><input type="file" name="back" required>
                <input type="file" name="plate" required><input type="file" name="led" required><input type="file" name="fixed" required>
                <button type="submit">一键执行同步</button>
            </form>
        </div>
        <div class="box">
            <h3 style="color:#888; border-bottom:1px solid #333; padding-bottom:10px;">📦 已有产品管理</h3>
            <div>${listHtml || '<p style="color:#444">暂无数据</p>'}</div>
        </div>
    </body>
    </html>
    `);
});

// 上架接口
app.post('/upload', upload.fields([
    { name: 'imageFile', maxCount: 1 },
    { name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 },
    { name: 'plate', maxCount: 1 }, { name: 'led', maxCount: 1 }, { name: 'fixed', maxCount: 1 }
]), (req, res) => {
    const { productId, productName } = req.body;
    const files = req.files;
    const indexEntry = `{ id: "${productId}", name: "${productName}", image: "images/${files.imageFile[0].originalname}" },`;
    const detailEntry = `
        "${productId}": [
            { file: "${files.front[0].originalname}",  type: "front", move: { z: 20 } }, 
            { file: "${files.plate[0].originalname}",  type: "plate", move: { z: 10 } },
            { file: "${files.led[0].originalname}",    type: "led",  move: null },
            { file: "${files.fixed[0].originalname}",  type: "fixed",  move: null }, 
            { file: "${files.back[0].originalname}",   type: "back",  move: { z: -20 } },
        ],`;
    
    // 写入 index.html
    let indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    indexContent = indexContent.replace('/* === 自动插入点：新产品数组 === */', `/* === 自动插入点：新产品数组 === */\n            ${indexEntry}`);
    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);

    // 写入 detail.html
    let detailContent = fs.readFileSync(path.join(__dirname, 'detail.html'), 'utf8');
    detailContent = detailContent.replace('/* === 自动插入点：新模型数据 === */', `/* === 自动插入点：新模型数据 === */\n        ${detailEntry}`);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);
    
    res.redirect('/');
});

// 删除接口
app.delete('/delete/:id', (req, res) => {
    const id = req.params.id;
    try {
        // 1. 删 index 代码
        let indexContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const indexRegex = new RegExp(`\\{[^}]*id:\\s*["']${id}["'][^}]*\\},?\\n?`, 'g');
        fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent.replace(indexRegex, ''));

        // 2. 删 detail 代码
        let detailContent = fs.readFileSync(path.join(__dirname, 'detail.html'), 'utf8');
        const detailRegex = new RegExp(`["']${id}["']:\\s*\\[[\\s\\S]*?\\],?\\n?`, 'g');
        fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent.replace(detailRegex, ''));

        // 3. 删文件夹
        const modelDir = path.join(__dirname, UPLOAD_DIR, id);
        if (fs.existsSync(modelDir)) fs.rmSync(modelDir, { recursive: true, force: true });

        res.send('成功抹除产品 ' + id);
    } catch (err) { res.status(500).send('删除失败'); }
});

app.listen(3000, () => console.log('管理后台：http://localhost:3000'));