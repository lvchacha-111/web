const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'images')));

const UPLOAD_DIR = 'stl'; 
const IMAGE_DIR = 'images'; 

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const productId = req.body.productId || req.params.id;
        let targetDir = (file.fieldname.includes('Image')) ? path.join(__dirname, IMAGE_DIR) : path.join(__dirname, UPLOAD_DIR, productId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// --- 工具：读取数据 ---
function getData() {
    const indexPath = path.join(__dirname, 'index.html');
    const detailPath = path.join(__dirname, 'detail.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const detailContent = fs.readFileSync(detailPath, 'utf8');

    const products = [];
    const indexRegex = /\{ id: "([^"]+)", name: "([^"]+)", image: "([^"]+)" \}/g;
    let m;
    while ((m = indexRegex.exec(indexContent)) !== null) {
        products.push({ id: m[1], name: m[2], image: m[3] });
    }
    return { products, indexContent, detailContent };
}

// --- 路由：首页 ---
app.get('/', (req, res) => {
    const { products } = getData();
    const listHtml = products.map(p => `
        <div class="item-card">
            <div class="info"><img src="/${p.image}" class="thumb"><div><div class="id-tag">${p.id}</div><div class="name-text">${p.name}</div></div></div>
            <div class="btns">
                <button onclick="location.href='/edit/${p.id}'" class="btn-edit">配置参数/换图</button>
                <button onclick="deleteProduct('${p.id}')" class="btn-del">删除</button>
            </div>
        </div>
    `).join('');

    res.send(getBaseHtml(`
        <div class="box">
            <h2>🚀 上架新产品</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="text" name="productId" placeholder="产品 ID (如: YJ-M005)" required>
                <input type="text" name="productName" placeholder="显示名称" required>
                <label>封面图:</label><input type="file" name="imageFile" required>
                <div class="file-grid">
                    <div><label>Front:</label><input type="file" name="front" required></div>
                    <div><label>Back:</label><input type="file" name="back" required></div>
                    <div><label>Plate:</label><input type="file" name="plate" required></div>
                    <div><label>LED:</label><input type="file" name="led" required></div>
                    <div><label>Fixed:</label><input type="file" name="fixed" required></div>
                </div>
                <button type="submit" class="btn-main">一键同步代码</button>
            </form>
        </div>
        <div class="box"><h3>📦 模型资产库</h3>${listHtml || '<p>无产品</p>'}</div>
    `));
});

// --- 路由：编辑页 ---
app.get('/edit/:id', (req, res) => {
    const id = req.params.id;
    const { products, detailContent } = getData();
    const product = products.find(p => p.id === id);
    if (!product) return res.status(404).send('未找到产品');

    // 改进的正则：匹配 "ID": [ ... ] 块
    const detailRegex = new RegExp(`"${id}":\\s*\\[([\\s\\S]*?)\\]`, 'g');
    const match = detailRegex.exec(detailContent);
    if (!match) return res.status(404).send('未找到模型配置');

    const parts = [];
    // 改进的正则：更宽松地匹配每一个部件对象
    const partRegex = /\{\s*file:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*move:\s*([^}]+|null)\s*\}/g;
    let pm;
    while ((pm = partRegex.exec(match[1])) !== null) {
        // 从 { z: 20 } 中提取数字 20
        let moveVal = pm[3].trim();
        let displayVal = "0";
        if (moveVal !== "null") {
            const numMatch = moveVal.match(/-?\d+/);
            displayVal = numMatch ? numMatch[0] : "0";
        }
        parts.push({ file: pm[1], type: pm[2], originalMove: moveVal, displayVal: displayVal });
    }

    res.send(getBaseHtml(`
        <div class="box">
            <h2>⚙️ 配置中心: ${id}</h2>
            <form action="/update/${id}" method="post" enctype="multipart/form-data">
                <div style="display:flex; align-items:center; gap:20px; background:#111; padding:15px; border-radius:8px; margin-bottom:20px;">
                    <img src="/${product.image}" style="width:80px; height:80px; border-radius:6px; object-fit:cover;">
                    <div><label>更换封面:</label><input type="file" name="newImageFile"><input type="hidden" name="oldImage" value="${product.image}"></div>
                </div>
                <label>修改名称:</label><input type="text" name="newName" value="${product.name}">
                
                <h3 style="margin-top:20px; color:#f39c12">解体距离 (Z轴位移)</h3>
                <p style="font-size:11px; color:#666">输入正负数字即可（0 代表不移动）</p>
                ${parts.map((part, i) => `
                    <div class="part-row">
                        <div><span class="part-type">${part.type.toUpperCase()}</span><br><small style="color:#444">${part.file}</small></div>
                        <div>距离: <input type="number" name="move_${i}" value="${part.displayVal}" style="width:80px; background:#000; color:#f39c12; border:1px solid #333; padding:5px; border-radius:4px;"></div>
                        <input type="hidden" name="file_${i}" value="${part.file}">
                        <input type="hidden" name="type_${i}" value="${part.type}">
                    </div>
                `).join('')}
                <button type="submit" class="btn-main" style="margin-top:20px">保存所有修改</button>
                <button type="button" onclick="location.href='/'" class="btn-sec">取消返回</button>
            </form>
        </div>
    `));
});

// --- 路由：更新数据 ---
app.post('/update/:id', upload.single('newImageFile'), (req, res) => {
    const id = req.params.id;
    const { newName, oldImage } = req.body;
    let { indexContent, detailContent } = getData();

    let finalImg = req.file ? `images/${req.file.originalname}` : oldImage;
    indexContent = indexContent.replace(new RegExp(`\\{ id: "${id}", name: "[^"]+", image: "[^"]+" \\}`, 'g'), `{ id: "${id}", name: "${newName}", image: "${finalImg}" }`);

    // 构建新的部件数组内容
    let newParts = [];
    for (let i = 0; i < 10; i++) { // 假设最多10个部件
        if (req.body[`type_${i}`]) {
            const fileName = req.body[`file_${i}`];
            const typeName = req.body[`type_${i}`];
            const dist = parseInt(req.body[`move_${i}`]);
            const moveStr = (dist === 0) ? "null" : `{ z: ${dist} }`;
            newParts.push(`            { file: "${fileName}",  type: "${typeName}", move: ${moveStr} }`);
        }
    }

    const detailBlockRegex = new RegExp(`"${id}":\\s*\\[[\\s\\S]*?\\]`, 'g');
    detailContent = detailContent.replace(detailBlockRegex, `"${id}": [\n${newParts.join(',\n')}\n        ]`);

    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);
    res.send('<script>alert("配置已同步！"); location.href="/";</script>');
});

// 上架和删除逻辑保持不变...
app.post('/upload', upload.fields([{name:'imageFile'},{name:'front'},{name:'back'},{name:'plate'},{name:'led'},{name:'fixed'}]), (req, res) => {
    const { productId, productName } = req.body;
    const files = req.files;
    const entry = `{ id: "${productId}", name: "${productName}", image: "images/${files.imageFile[0].originalname}" }`;
    const detailEntry = `"${productId}": [
            { file: "${files.front[0].originalname}",  type: "front", move: { z: 20 } },
            { file: "${files.plate[0].originalname}",  type: "plate", move: { z: 10 } },
            { file: "${files.led[0].originalname}",    type: "led",  move: null },
            { file: "${files.fixed[0].originalname}",  type: "fixed",  move: null },
            { file: "${files.back[0].originalname}",   type: "back",  move: { z: -20 } }
        ],`;
    let { indexContent, detailContent } = getData();
    indexContent = indexContent.replace('/* === 自动插入点：新产品数组 === */', `/* === 自动插入点：新产品数组 === */\n            ${entry},`);
    detailContent = detailContent.replace('/* === 自动插入点：新模型数据 === */', `${detailEntry}\n        /* === 自动插入点：新模型数据 === */`);
    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);
    res.redirect('/');
});

app.delete('/delete/:id', (req, res) => {
    const id = req.params.id;
    let { indexContent, detailContent } = getData();
    indexContent = indexContent.replace(new RegExp(`\\{ id: "${id}",[^}]*\\},?\\n?`, 'g'), '');
    detailContent = detailContent.replace(new RegExp(`"${id}":\\s*\\[[\\s\\S]*?\\],?\\n?`, 'g'), '');
    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);
    const dir = path.join(__dirname, UPLOAD_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    res.send('Done');
});

function getBaseHtml(content) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>3D 指挥中心</title><style>
    body { background: #0a0a0a; color: #ccc; font-family: sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .box { background: #141414; padding: 20px; border-radius: 8px; width: 100%; max-width: 500px; margin-bottom: 20px; border: 1px solid #222; }
    h2 { color: #f39c12; text-align: center; margin-bottom: 20px; }
    input[type=text], input[type=number] { padding: 10px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; }
    input[type=text] { width: 100%; box-sizing: border-box; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; }
    .item-card { background: #000; border: 1px solid #222; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 12px; }
    .part-row { background: #080808; padding: 10px; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #f39c12; }
    .part-type { font-weight: bold; color: #f39c12; font-size: 14px; }
    .id-tag { font-size: 10px; color: #666; font-family: monospace; }
    .btn-edit { background: #222; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; }
    .btn-del { background: #311; color: #f55; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-top: 10px; color: #555; }
    </style><script>function deleteProduct(id){if(confirm('确定删除 '+id+'?'))fetch('/delete/'+id,{method:'DELETE'}).then(()=>location.reload());}</script>
    </head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('✅ 3D指挥中心运行中: http://localhost:3000'));