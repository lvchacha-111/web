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
        const productId = req.body.newId || req.body.productId || req.params.id;
        let targetDir = (file.fieldname.includes('Image')) ? path.join(__dirname, IMAGE_DIR) : path.join(__dirname, UPLOAD_DIR, productId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

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

// 辅助工具：从字符串 "{ x: 10, z: 20 }" 中提取数值
function parseMove(str) {
    const res = { x: 0, y: 0, z: 0 };
    if (!str || str.trim() === "null") return res;
    const xM = str.match(/x:\s*(-?\d+)/);
    const yM = str.match(/y:\s*(-?\d+)/);
    const zM = str.match(/z:\s*(-?\d+)/);
    if (xM) res.x = parseInt(xM[1]);
    if (yM) res.y = parseInt(yM[1]);
    if (zM) res.z = parseInt(zM[1]);
    return res;
}

app.get('/', (req, res) => {
    const { products } = getData();
    const listHtml = products.map(p => `
        <div class="item-card">
            <div class="info"><img src="/${p.image}" class="thumb"><div><div class="id-tag">${p.id}</div><div class="name-text">${p.name}</div></div></div>
            <div class="btns"><button onclick="location.href='/edit/${p.id}'" class="btn-edit">编辑配置</button><button onclick="deleteProduct('${p.id}')" class="btn-del">删除</button></div>
        </div>
    `).join('');
    res.send(getBaseHtml(`
        <div class="box">
            <h2>🚀 上架新产品</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="text" name="productId" placeholder="产品编号 ID" required>
                <input type="text" name="productName" placeholder="显示名称 Name" required>
                <label>封面图:</label><input type="file" name="imageFile" required>
                <div class="file-grid">
                    <div><label>Front:</label><input type="file" name="front" required></div>
                    <div><label>Back:</label><input type="file" name="back" required></div>
                    <div><label>Plate:</label><input type="file" name="plate" required></div>
                    <div><label>LED:</label><input type="file" name="led" required></div>
                    <div><label>Fixed:</label><input type="file" name="fixed" required></div>
                </div>
                <button type="submit" class="btn-main">一键录入系统</button>
            </form>
        </div>
        <div class="box"><h3>📦 模型库资产</h3>${listHtml || '<p>空</p>'}</div>
    `));
});

app.get('/edit/:id', (req, res) => {
    const id = req.params.id;
    const { products, detailContent } = getData();
    const product = products.find(p => p.id === id);
    if (!product) return res.status(404).send('未找到');

    const detailRegex = new RegExp(`"${id}":\\s*\\[([\\s\\S]*?)\\]`, 'g');
    const match = detailRegex.exec(detailContent);
    const parts = [];
    const partRegex = /\{\s*file:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*move:\s*([^}]+|null)\s*\}/g;
    let pm;
    while ((pm = partRegex.exec(match[1])) !== null) {
        const moveObj = parseMove(pm[3]);
        parts.push({ file: pm[1], type: pm[2], move: moveObj });
    }

    res.send(getBaseHtml(`
        <div class="box">
            <h2>⚙️ 配置中心: ${id}</h2>
            <form action="/update/${id}" method="post" enctype="multipart/form-data">
                <div class="img-edit-box">
                    <img src="/${product.image}">
                    <div style="flex:1"><label>换封面:</label><input type="file" name="newImageFile"><input type="hidden" name="oldImage" value="${product.image}"></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label>ID:</label><input type="text" name="newId" value="${product.id}" required></div>
                    <div><label>Name:</label><input type="text" name="newName" value="${product.name}" required></div>
                </div>
                <h3 style="margin-top:20px; color:#f39c12">解体位移方向控制 (X, Y, Z)</h3>
                ${parts.map((part, i) => `
                    <div class="part-row">
                        <div style="flex:1">
                            <span class="part-type">${part.type.toUpperCase()}</span><br>
                            <span class="file-name-display">📄 ${part.file}</span>
                            <input type="file" name="replace_file_${i}" style="font-size:10px; border:none; background:transparent; display:block; margin-top:5px">
                            <input type="hidden" name="old_file_${i}" value="${part.file}">
                            <input type="hidden" name="type_${i}" value="${part.type}">
                        </div>
                        <div class="axis-group">
                            <div>X: <input type="number" name="move_x_${i}" value="${part.move.x}"></div>
                            <div>Y: <input type="number" name="move_y_${i}" value="${part.move.y}"></div>
                            <div>Z: <input type="number" name="move_z_${i}" value="${part.move.z}"></div>
                        </div>
                    </div>
                `).join('')}
                <button type="submit" class="btn-main" style="margin-top:20px">保存所有 3D 空间配置</button>
                <button type="button" onclick="location.href='/'" class="btn-sec">取消</button>
            </form>
        </div>
    `));
});

app.post('/update/:id', upload.any(), (req, res) => {
    const oldId = req.params.id;
    const { newId, newName, oldImage } = req.body;
    let { indexContent, detailContent } = getData();

    if (oldId !== newId) {
        const oldP = path.join(__dirname, UPLOAD_DIR, oldId);
        const newP = path.join(__dirname, UPLOAD_DIR, newId);
        if (fs.existsSync(oldP) && !fs.existsSync(newP)) fs.renameSync(oldP, newP);
    }

    let finalImg = oldImage;
    const newImg = req.files.find(f => f.fieldname === 'newImageFile');
    if (newImg) finalImg = `images/${newImg.originalname}`;

    const indexRegex = new RegExp(`\\{ id: "${oldId}", name: "[^"]+", image: "[^"]+" \\}`, 'g');
    indexContent = indexContent.replace(indexRegex, `{ id: "${newId}", name: "${newName}", image: "${finalImg}" }`);

    let newParts = [];
    for (let i = 0; i < 10; i++) {
        if (req.body[`type_${i}`]) {
            const type = req.body[`type_${i}`];
            const oldFile = req.body[`old_file_${i}`];
            const upFile = req.files.find(f => f.fieldname === `replace_file_${i}`);
            const fileName = upFile ? upFile.originalname : oldFile;
            
            const x = parseInt(req.body[`move_x_${i}`]);
            const y = parseInt(req.body[`move_y_${i}`]);
            const z = parseInt(req.body[`move_z_${i}`]);
            
            let moveStr = "null";
            if (x !== 0 || y !== 0 || z !== 0) {
                let parts = [];
                if (x !== 0) parts.push(`x: ${x}`);
                if (y !== 0) parts.push(`y: ${y}`);
                if (z !== 0) parts.push(`z: ${z}`);
                moveStr = `{ ${parts.join(', ')} }`;
            }
            newParts.push(`            { file: "${fileName}",  type: "${type}", move: ${moveStr} }`);
        }
    }

    const detailRegex = new RegExp(`"${oldId}":\\s*\\[[\\s\\S]*?\\]`, 'g');
    detailContent = detailContent.replace(detailRegex, `"${newId}": [\n${newParts.join(',\n')}\n        ]`);

    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);
    res.send('<script>alert("全站 3D 参数已同步！"); location.href="/";</script>');
});

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
    .box { background: #141414; padding: 20px; border-radius: 8px; width: 100%; max-width: 580px; margin-bottom: 20px; border: 1px solid #222; }
    h2 { color: #f39c12; text-align: center; }
    input[type=text], input[type=number] { padding: 8px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; }
    input[type=number] { width: 50px; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; font-size:16px; }
    .item-card { background: #000; border: 1px solid #222; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 12px; }
    .part-row { background: #080808; padding: 12px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #f39c12; }
    .axis-group { display: flex; gap: 8px; font-size: 11px; color: #666; }
    .axis-group div { display: flex; align-items: center; gap: 4px; }
    .part-type { font-weight: bold; color: #f39c12; font-size: 13px; }
    .file-name-display { font-size: 10px; color: #444; }
    .img-edit-box { display: flex; align-items: center; gap: 15px; background: #080808; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
    .img-edit-box img { width: 70px; height: 70px; border-radius: 6px; object-fit: cover; }
    .btn-edit { background: #222; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; }
    .btn-del { background: #311; color: #f55; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-top: 10px; color: #555; }
    </style><script>function deleteProduct(id){if(confirm('确定删除 '+id+'?'))fetch('/delete/'+id,{method:'DELETE'}).then(()=>location.reload());}</script>
    </head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('✅ 管理者模式http://localhost:3000'));