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
        // 优先使用新输入的 ID，如果没有（比如上架时）则使用旧 ID
        const productId = req.body.newId || req.body.productId || req.params.id;
        let targetDir = (file.fieldname.includes('Image')) ? 
            path.join(__dirname, IMAGE_DIR) : 
            path.join(__dirname, UPLOAD_DIR, productId);
        
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// --- 工具：读取全站数据 ---
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

// --- 首页：列表展示 ---
app.get('/', (req, res) => {
    const { products } = getData();
    const listHtml = products.map(p => `
        <div class="item-card">
            <div class="info"><img src="/${p.image}" class="thumb"><div><div class="id-tag">${p.id}</div><div class="name-text">${p.name}</div></div></div>
            <div class="btns">
                <button onclick="location.href='/edit/${p.id}'" class="btn-edit">编辑 ID/名称/模型</button>
                <button onclick="deleteProduct('${p.id}')" class="btn-del">删除</button>
            </div>
        </div>
    `).join('');
    res.send(getBaseHtml(`
        <div class="box">
            <h2>🚀 上架新产品</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="text" name="productId" placeholder="产品编号 ID (唯一)" required>
                <input type="text" name="productName" placeholder="显示名称 Name" required>
                <label>封面图:</label><input type="file" name="imageFile" required>
                <div class="file-grid">
                    <div><label>Front:</label><input type="file" name="front" required></div>
                    <div><label>Back:</label><input type="file" name="back" required></div>
                    <div><label>Plate:</label><input type="file" name="plate" required></div>
                    <div><label>LED:</label><input type="file" name="led" required></div>
                    <div><label>Fixed:</label><input type="file" name="fixed" required></div>
                </div>
                <button type="submit" class="btn-main">执行一键上架</button>
            </form>
        </div>
        <div class="box"><h3>📦 现有资产列表</h3>${listHtml || '<p>暂无产品</p>'}</div>
    `));
});

// --- 编辑页：支持 ID 和 Name 的修改 ---
app.get('/edit/:id', (req, res) => {
    const id = req.params.id;
    const { products, detailContent } = getData();
    const product = products.find(p => p.id === id);
    if (!product) return res.status(404).send('未找到产品');

    const detailRegex = new RegExp(`"${id}":\\s*\\[([\\s\\S]*?)\\]`, 'g');
    const match = detailRegex.exec(detailContent);
    const parts = [];
    const partRegex = /\{\s*file:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*move:\s*([^}]+|null)\s*\}/g;
    let pm;
    while ((pm = partRegex.exec(match[1])) !== null) {
        let moveVal = pm[3].trim();
        let displayVal = moveVal === "null" ? "0" : (moveVal.match(/-?\d+/) ? moveVal.match(/-?\d+/)[0] : "0");
        parts.push({ file: pm[1], type: pm[2], displayVal });
    }

    res.send(getBaseHtml(`
        <div class="box">
            <h2>⚙️ 配置中心: ${id}</h2>
            <form action="/update/${id}" method="post" enctype="multipart/form-data">
                <div class="img-edit-box">
                    <img src="/${product.image}">
                    <div style="flex:1">
                        <label>更换封面图:</label>
                        <input type="file" name="newImageFile">
                        <input type="hidden" name="oldImage" value="${product.image}">
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label>产品编号 (ID):</label><input type="text" name="newId" value="${product.id}" required></div>
                    <div><label>显示名称 (Name):</label><input type="text" name="newName" value="${product.name}" required></div>
                </div>
                
                <h3 style="margin-top:20px; color:#f39c12">部件管理与位移</h3>
                ${parts.map((part, i) => `
                    <div class="part-row">
                        <div style="flex:1">
                            <span class="part-type">${part.type.toUpperCase()}</span><br>
                            <span class="file-name-display">📄 ${part.file}</span>
                            <input type="file" name="replace_file_${i}" style="font-size:10px; border:none; background:transparent; padding:0; margin-top:5px">
                            <input type="hidden" name="old_file_${i}" value="${part.file}">
                            <input type="hidden" name="type_${i}" value="${part.type}">
                        </div>
                        <div style="text-align:right">
                            <span style="font-size:11px; color:#555">Z轴位移:</span><br>
                            <input type="number" name="move_${i}" value="${part.displayVal}" style="width:60px; margin-top:5px">
                        </div>
                    </div>
                `).join('')}
                
                <button type="submit" class="btn-main" style="margin-top:20px">保存所有修改 (同步 ID/名称/模型)</button>
                <button type="button" onclick="location.href='/'" class="btn-sec">取消返回</button>
            </form>
        </div>
    `));
});

// --- 更新逻辑：支持 ID 重命名和文件夹同步 ---
app.post('/update/:id', upload.any(), (req, res) => {
    const oldId = req.params.id;
    const { newId, newName, oldImage } = req.body;
    let { indexContent, detailContent } = getData();

    // 1. 处理文件夹重命名 (如果 ID 变了)
    if (oldId !== newId) {
        const oldPath = path.join(__dirname, UPLOAD_DIR, oldId);
        const newPath = path.join(__dirname, UPLOAD_DIR, newId);
        if (fs.existsSync(oldPath)) {
            // 如果新文件夹已存在，先合并再删除旧的，或者直接重命名
            if (fs.existsSync(newPath)) {
                // 简单的防呆处理：如果新 ID 已经存在且不是自己，提示错误
                return res.status(400).send('错误：新 ID 已经存在，请换一个 ID');
            }
            fs.renameSync(oldPath, newPath);
        }
    }

    // 2. 更新图片
    let finalImg = oldImage;
    const newImg = req.files.find(f => f.fieldname === 'newImageFile');
    if (newImg) finalImg = `images/${newImg.originalname}`;

    // 3. 全局替换 index.html 里的旧 ID 和名称
    const indexRegex = new RegExp(`\\{ id: "${oldId}", name: "[^"]+", image: "[^"]+" \\}`, 'g');
    indexContent = indexContent.replace(indexRegex, `{ id: "${newId}", name: "${newName}", image: "${finalImg}" }`);

    // 4. 构建新的部件数组并替换 detail.html
    let newParts = [];
    for (let i = 0; i < 10; i++) {
        if (req.body[`type_${i}`]) {
            const type = req.body[`type_${i}`];
            const oldFile = req.body[`old_file_${i}`];
            const dist = parseInt(req.body[`move_${i}`]);
            const upFile = req.files.find(f => f.fieldname === `replace_file_${i}`);
            const fileName = upFile ? upFile.originalname : oldFile;
            const moveStr = (dist === 0) ? "null" : `{ z: ${dist} }`;
            newParts.push(`            { file: "${fileName}",  type: "${type}", move: ${moveStr} }`);
        }
    }

    const detailRegex = new RegExp(`"${oldId}":\\s*\\[[\\s\\S]*?\\]`, 'g');
    const newDetailBlock = `"${newId}": [\n${newParts.join(',\n')}\n        ]`;
    detailContent = detailContent.replace(detailRegex, newDetailBlock);

    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);

    res.send(`<script>alert("成功更新 ID [${newId}] 及其配置！"); location.href="/";</script>`);
});

// --- 基础功能：上架 & 删除 ---
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
    res.send('Delete Success');
});

function getBaseHtml(content) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>3D 管理控制台</title><style>
    body { background: #0a0a0a; color: #ccc; font-family: sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .box { background: #141414; padding: 20px; border-radius: 8px; width: 100%; max-width: 550px; margin-bottom: 20px; border: 1px solid #222; }
    h2 { color: #f39c12; text-align: center; margin-bottom: 20px; }
    input[type=text], input[type=number] { padding: 10px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; box-sizing: border-box; }
    input[type=text] { width: 100%; margin: 8px 0; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; font-size:16px; }
    .btn-main:hover { background: #fff; }
    .item-card { background: #000; border: 1px solid #222; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 12px; border:1px solid #222; }
    .img-edit-box { display: flex; align-items: center; gap: 15px; background: #080808; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
    .img-edit-box img { width: 80px; height: 80px; border-radius: 6px; object-fit: cover; border: 1px solid #333; }
    .part-row { background: #080808; padding: 12px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; border-left: 3px solid #f39c12; }
    .part-type { font-weight: bold; color: #f39c12; font-size: 13px; }
    .file-name-display { font-size: 10px; color: #444; font-family: monospace; }
    .id-tag { font-size: 10px; color: #f39c12; background: #000; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
    .btn-edit { background: #333; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; }
    .btn-del { background: #411; color: #f55; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-sec { background: transparent; color: #444; border: 1px solid #333; padding: 10px; border-radius: 4px; margin-top: 10px; cursor: pointer; width: 100%; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-top: 10px; color: #555; }
    </style><script>function deleteProduct(id){if(confirm('确定删除 '+id+'?'))fetch('/delete/'+id,{method:'DELETE'}).then(()=>location.reload());}</script>
    </head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('✅ 指挥中心已升级：支持 ID 重命名与全站同步'));