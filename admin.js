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
        
        // --- 修改开始 ---
        // 原代码：if (file.fieldname.includes('Image')) 
        // 修改为：先转小写再判断，这样即支持 'imageFile' 也支持 'newImageFile'
        let isImageField = file.fieldname.toLowerCase().includes('image');
        
        let targetDir = isImageField ? 
            path.join(__dirname, IMAGE_DIR) : 
            path.join(__dirname, UPLOAD_DIR, productId);
        // --- 修改结束 ---
        
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// --- 工具：数据读取与解析 ---
function getData() {
    const indexPath = path.join(__dirname, 'index.html');
    const detailPath = path.join(__dirname, 'detail.html');
    
    if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, 'const models = [\n/* === 自动插入点：新产品数组 === */\n];');
    if (!fs.existsSync(detailPath)) fs.writeFileSync(detailPath, 'const parts = {\n/* === 自动插入点：新模型数据 === */\n};');

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

// --- 辅助函数：解析单个产品的部件列表 ---
function parsePartsForId(id, detailContent) {
    const detailRegex = new RegExp(`"${id}":\\s*\\[([\\s\\S]*?)\\]`, 'g');
    const match = detailRegex.exec(detailContent);
    if (!match) return [];

    const parts = [];
    // 正则：宽容匹配 { file: "...", type: "...", ... }
    const partRegex = /\{\s*file:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*([^}]+)\}/g;
    
    let pm;
    while ((pm = partRegex.exec(match[1])) !== null) {
        const file = pm[1];
        const type = pm[2];
        const restString = pm[3]; 

        // 1. 解析 Move
        let axis = 'z';
        let dist = 0;
        const moveMatch = restString.match(/move:\s*\{\s*([xyz])\s*:\s*(-?\d+)/);
        if (moveMatch) {
            axis = moveMatch[1];
            dist = parseInt(moveMatch[2]);
        }

        // 2. 解析 Plate 发光
        let isEmissive = true; 
        if (type === 'plate') {
            if (restString.includes('emissive: false')) isEmissive = false;
        } else {
            isEmissive = false;
        }

        // 3. 解析 Back 材质
        let isTexture = false;
        if (type === 'back') {
            isTexture = true; 
            if (restString.includes('texture: false')) isTexture = false;
        }

        parts.push({ file, type, axis, dist, isEmissive, isTexture });
    }
    return parts;
}

// --- 首页 ---
// --- 首页 ---
app.get('/', (req, res) => {
    const { products, detailContent } = getData();
    
    // 生成现有列表的 HTML (保持不变)
    const listHtml = products.map(p => {
        const parts = parsePartsForId(p.id, detailContent);
        const typeCounters = { front: 0, back: 0, plate: 0, led: 0, fixed: 0 };
        
        const tagsHtml = parts.map(part => {
            const t = part.type;
            if (typeCounters[t] === undefined) typeCounters[t] = 0;
            typeCounters[t]++;
            
            let colorClass = 'tag-gray';
            if(t === 'front') colorClass = 'tag-blue';
            if(t === 'plate') colorClass = 'tag-green';
            if(t === 'back') colorClass = 'tag-red';

            const label = t.charAt(0).toUpperCase() + typeCounters[t];
            return `<div class="file-tag ${colorClass}" title="文件名: ${part.file} (${part.type})">${label}</div>`;
        }).join('');

        return `
        <div class="item-card">
            <div class="info">
                <img src="/${p.image}" class="thumb">
                <div style="flex:1">
                    <div class="id-row"><span class="id-tag">${p.id}</span> <span class="name-text">${p.name}</span></div>
                    <div class="tags-container">${tagsHtml}</div>
                </div>
            </div>
            <div class="btns">
                <button onclick="location.href='/edit/${p.id}'" class="btn-edit">配置模型</button>
                <button onclick="deleteProduct('${p.id}')" class="btn-del">删除</button>
            </div>
        </div>
        `;
    }).join('');

    // --- 核心修改：增加了 CSS 样式和增强的 JS 文件选择逻辑 ---
    res.send(getBaseHtml(`
        <style>
            /* 新增样式：文件上传预览区 */
            .upload-zone { border: 1px dashed #444; padding: 10px; border-radius: 4px; background: #0f0f0f; transition: 0.3s; }
            .upload-zone:hover { border-color: #666; background: #1a1a1a; }
            .file-preview-box { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; min-height: 5px; }
            .file-chip { 
                background: #222; border: 1px solid #444; color: #ccc; 
                padding: 4px 8px; border-radius: 4px; font-size: 11px; 
                display: flex; align-items: center; gap: 6px; 
                animation: fadeIn 0.2s;
            }
            .file-chip span { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .chip-del { 
                color: #e74c3c; cursor: pointer; font-weight: bold; padding: 0 2px;
                transition: 0.2s;
            }
            .chip-del:hover { color: #ff6b6b; transform: scale(1.2); }
            .btn-select-file {
                background: #333; color: #fff; border: 1px solid #555;
                padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;
            }
            .btn-select-file:hover { background: #444; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        </style>

        <div class="box">
            <h2>🚀 上架新产品</h2>
            <form action="/upload" method="post" enctype="multipart/form-data" id="uploadForm">
                <input type="text" name="productId" placeholder="产品编号 ID (唯一)" required>
                <input type="text" name="productName" placeholder="显示名称 Name" required>
                
                <div style="margin: 10px 0;">
                    <label>封面图 (必填):</label>
                    <input type="file" name="imageFile" accept="image/*" required>
                </div>

                <div class="file-grid">
                    ${['front', 'back', 'plate', 'led', 'fixed'].map(type => `
                        <div class="upload-zone" id="zone-${type}">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label style="text-transform: capitalize; font-weight:bold; color:#aaa;">${type}</label>
                                <!-- 隐藏真实的 input，通过按钮触发 -->
                                <input type="file" name="${type}" id="input-${type}" multiple style="display:none" onchange="handleFileSelect('${type}')">
                                <button type="button" class="btn-select-file" onclick="document.getElementById('input-${type}').click()">+ 添加文件</button>
                            </div>
                            <!-- 预览区域 -->
                            <div class="file-preview-box" id="preview-${type}"></div>
                        </div>
                    `).join('')}
                </div>
                
                <br>
                <button type="submit" class="btn-main">执行一键上架</button>
            </form>
        </div>
        
        <div class="box"><h3>📦 现有资产列表</h3>${listHtml || '<p>暂无产品</p>'}</div>

        <script>
            // === 前端逻辑：管理文件列表 ===
            // 存储每个分类的文件数据 (使用 DataTransfer 模拟 FileList)
            const fileStores = {
                front: new DataTransfer(),
                back: new DataTransfer(),
                plate: new DataTransfer(),
                led: new DataTransfer(),
                fixed: new DataTransfer()
            };

            function handleFileSelect(type) {
                const input = document.getElementById('input-' + type);
                const files = input.files;
                
                // 将新选的文件追加到我们的存储中
                for (let i = 0; i < files.length; i++) {
                    // (可选) 这里可以加排重逻辑，防止同名文件重复添加
                    fileStores[type].items.add(files[i]);
                }

                // 更新视图和真实的 Input
                updateInputAndPreview(type);
            }

            function removeFile(type, index) {
                // DataTransfer 的 items 列表没有直接 remove(index) 方法，需要重建
                const newDt = new DataTransfer();
                const oldFiles = fileStores[type].files;

                for (let i = 0; i < oldFiles.length; i++) {
                    if (i !== index) {
                        newDt.items.add(oldFiles[i]);
                    }
                }
                
                fileStores[type] = newDt;
                updateInputAndPreview(type);
            }

            function updateInputAndPreview(type) {
                const input = document.getElementById('input-' + type);
                const previewBox = document.getElementById('preview-' + type);
                
                // 1. 将 input 的 files 属性替换为我们内存中的列表
                // 这样提交表单时，就会提交所有仍在列表中的文件
                input.files = fileStores[type].files;

                // 2. 重新渲染小方块
                previewBox.innerHTML = '';
                const files = fileStores[type].files;

                if (files.length === 0) {
                    previewBox.innerHTML = '<span style="font-size:10px; color:#444; padding:4px;">未选择文件</span>';
                    return;
                }

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const chip = document.createElement('div');
                    chip.className = 'file-chip';
                    chip.innerHTML = \`
                        <span>\${file.name}</span>
                        <span class="chip-del" onclick="removeFile('\${type}', \${i})">×</span>
                    \`;
                    previewBox.appendChild(chip);
                }
            }
            
            // 初始化显示状态
            ['front', 'back', 'plate', 'led', 'fixed'].forEach(t => updateInputAndPreview(t));
        </script>
    `));
});

// --- 编辑页 ---
// --- 编辑页 ---
app.get('/edit/:id', (req, res) => {
    const id = req.params.id;
    const { products, detailContent } = getData();
    const product = products.find(p => p.id === id);
    if (!product) return res.status(404).send('未找到产品');

    const allParts = parsePartsForId(id, detailContent);
    const groups = { front: [], back: [], plate: [], led: [], fixed: [] };
    allParts.forEach(p => {
        if (groups[p.type]) groups[p.type].push(p);
    });

    const renderGroup = (type, list) => {
        const count = list.length;
        const colorMap = { front: '#3498db', back: '#e74c3c', plate: '#2ecc71', led: '#f1c40f', fixed: '#95a5a6' };
        const color = colorMap[type] || '#ccc';
        
        return `
        <details class="group-details" ${count > 0 ? 'open' : ''}>
            <summary class="group-summary" style="border-left: 4px solid ${color}">
                <span style="font-weight:bold; color:${color}">${type.toUpperCase()}</span>
                <span class="badge" style="background:${color}">${count}</span>
                <span class="summary-tip">${count > 0 ? '点击收起/展开编辑' : '暂无文件'}</span>
            </summary>
            
            <div class="group-content">
                <!-- 1. 现有文件列表 (保持不变) -->
                ${list.map((p, i) => `
                    <div class="part-row">
                        <div class="part-info">
                            <span class="idx-label" style="background:${color}">${i+1}</span>
                            <div style="overflow:hidden;">
                                <div class="file-name" title="${p.file}">${p.file}</div>
                                <input type="hidden" name="old_${type}_${i}" value="${p.file}">
                                <div style="display:flex; align-items:center; gap:5px; margin-top:2px;">
                                    <span style="font-size:10px; color:#555;">替换:</span>
                                    <input type="file" name="replace_${type}_${i}" class="mini-file-input">
                                </div>
                            </div>
                        </div>
                        
                        <div class="part-controls">
                            <div class="control-row">
                                ${type === 'plate' ? `
                                    <label class="emissive-toggle" title="是否发光"><input type="checkbox" name="emissive_${type}_${i}" ${p.isEmissive ? 'checked' : ''}> 💡</label>
                                ` : ''}
                                ${type === 'back' ? `
                                    <label class="texture-toggle" title="是否启用特殊材质"><input type="checkbox" name="texture_${type}_${i}" ${p.isTexture ? 'checked' : ''}> 🎨</label>
                                ` : ''}
                                <label class="delete-toggle" title="勾选后保存，将彻底删除此文件"><input type="checkbox" name="delete_${type}_${i}"> 🗑️</label>
                            </div>

                            <div class="move-group">
                                <select name="axis_${type}_${i}">
                                    <option value="x" ${p.axis==='x'?'selected':''}>X</option>
                                    <option value="y" ${p.axis==='y'?'selected':''}>Y</option>
                                    <option value="z" ${p.axis==='z'?'selected':''}>Z</option>
                                </select>
                                <input type="number" name="dist_${type}_${i}" value="${p.dist}" style="font-weight:bold; color:#f39c12">
                            </div>
                        </div>
                    </div>
                `).join('')}
                
                <!-- 2. 新增文件区域 (核心修改部分) -->
                <div class="append-section" style="border-top:1px dashed #333; margin-top:10px; padding-top:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <label style="font-size:12px; color:#aaa;">➕ 追加到 ${type}: </label>
                        <button type="button" class="btn-select-mini" onclick="document.getElementById('append-input-${type}').click()">选择文件...</button>
                        <!-- 隐藏的真实 input -->
                        <input type="file" id="append-input-${type}" name="append_${type}" multiple style="display:none" onchange="handleAppendSelect('${type}')">
                    </div>
                    <!-- 预览容器 -->
                    <div class="append-preview-box" id="append-preview-${type}"></div>
                </div>
            </div>
        </details>
        `;
    };

    res.send(getBaseHtml(`
        <style>
            /* 复用之前的 Chip 样式，微调以适应编辑页 */
            .append-section { background: #0c0c0c; padding: 8px; border-radius: 4px; }
            .btn-select-mini { background: #222; border: 1px solid #444; color: #bbb; font-size: 10px; padding: 3px 8px; border-radius: 3px; cursor: pointer; }
            .btn-select-mini:hover { background: #333; color: #fff; }
            .append-preview-box { display: flex; flex-wrap: wrap; gap: 5px; min-height: 5px; }
            .mini-chip { 
                background: #1e1e1e; border: 1px solid #333; color: #aaa; 
                padding: 2px 6px; border-radius: 3px; font-size: 10px; 
                display: flex; align-items: center; gap: 5px;
            }
            .mini-chip-del { color: #c0392b; cursor: pointer; font-weight: bold; }
            .mini-chip-del:hover { color: #e74c3c; }
        </style>

        <div class="box" style="max-width: 700px;">
            <h2>⚙️ 配置中心: ${id}</h2>
            <form action="/update/${id}" method="post" enctype="multipart/form-data">
                <div class="img-edit-box">
                    <img src="/${product.image}">
                    <div style="flex:1">
                        <label>更换封面:</label>
                        <input type="file" name="newImageFile">
                        <input type="hidden" name="oldImage" value="${product.image}">
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <input type="text" name="newId" value="${product.id}" required style="width:50%" placeholder="ID">
                            <input type="text" name="newName" value="${product.name}" required style="width:50%" placeholder="Name">
                        </div>
                    </div>
                </div>

                <h3 style="margin: 20px 0 10px; color:#f39c12; border-bottom:1px solid #333; padding-bottom:5px;">📂 部件分组管理</h3>
                
                ${['front', 'back', 'plate', 'led', 'fixed'].map(t => renderGroup(t, groups[t])).join('')}
                
                <div class="sticky-footer">
                    <button type="submit" class="btn-main">💾 保存所有配置</button>
                    <button type="button" onclick="location.href='/'" class="btn-sec">取消</button>
                </div>
            </form>
        </div>

        <script>
            // === 核心逻辑：编辑页面的多文件追加管理 ===
            const appendStores = {
                front: new DataTransfer(),
                back: new DataTransfer(),
                plate: new DataTransfer(),
                led: new DataTransfer(),
                fixed: new DataTransfer()
            };

            function handleAppendSelect(type) {
                const input = document.getElementById('append-input-' + type);
                const files = input.files;
                
                // 将新文件追加到内存列表
                for (let i = 0; i < files.length; i++) {
                    appendStores[type].items.add(files[i]);
                }
                updateAppendUI(type);
            }

            function removeAppendFile(type, index) {
                const newDt = new DataTransfer();
                const oldFiles = appendStores[type].files;
                
                for (let i = 0; i < oldFiles.length; i++) {
                    if (i !== index) newDt.items.add(oldFiles[i]);
                }
                
                appendStores[type] = newDt;
                updateAppendUI(type);
            }

            function updateAppendUI(type) {
                const input = document.getElementById('append-input-' + type);
                const box = document.getElementById('append-preview-' + type);
                
                // 1. 同步回真实 Input
                input.files = appendStores[type].files;

                // 2. 渲染 UI
                box.innerHTML = '';
                const files = appendStores[type].files;
                
                if (files.length === 0) {
                    // 空状态不显示任何东西，或者可以显示提示
                    return;
                }

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const chip = document.createElement('div');
                    chip.className = 'mini-chip';
                    chip.innerHTML = \`
                        <span style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${file.name}</span>
                        <span class="mini-chip-del" onclick="removeAppendFile('\${type}', \${i})">×</span>
                    \`;
                    box.appendChild(chip);
                }
            }
        </script>
    `));
});

// --- 更新逻辑 ---
app.post('/update/:id', upload.any(), (req, res) => {
    const oldId = req.params.id;
    const { newId, newName, oldImage } = req.body;
    let { indexContent, detailContent } = getData();

    if (oldId !== newId) {
        const oldPath = path.join(__dirname, UPLOAD_DIR, oldId);
        const newPath = path.join(__dirname, UPLOAD_DIR, newId);
        if (fs.existsSync(oldPath)) {
            if (fs.existsSync(newPath)) return res.status(400).send('错误：新 ID 已经存在');
            fs.renameSync(oldPath, newPath);
        }
    }

    let finalImg = oldImage;
    const newImg = req.files.find(f => f.fieldname === 'newImageFile');
    if (newImg) finalImg = `images/${newImg.originalname}`;
    
    const indexRegex = new RegExp(`\\{ id: "${oldId}", name: "[^"]+", image: "[^"]+" \\}`, 'g');
    indexContent = indexContent.replace(indexRegex, `{ id: "${newId}", name: "${newName}", image: "${finalImg}" }`);

    let newParts = [];
    const types = ['front', 'back', 'plate', 'led', 'fixed'];

    types.forEach(type => {
        // A. 处理已有文件
        for (let i = 0; i < 50; i++) {
            const oldFileKey = `old_${type}_${i}`;
            if (!req.body[oldFileKey]) continue; 

            const oldFile = req.body[oldFileKey];
            const isDelete = req.body[`delete_${type}_${i}`] === 'on';
            if (isDelete) {
                try {
                    const filePath = path.join(__dirname, UPLOAD_DIR, newId, oldFile);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch (e) {
                    console.error("删除文件失败:", e);
                }
                continue; 
            }

            const axis = req.body[`axis_${type}_${i}`];
            const dist = parseInt(req.body[`dist_${type}_${i}`]);
            const isEmissive = req.body[`emissive_${type}_${i}`] === 'on';
            const isTexture = req.body[`texture_${type}_${i}`] === 'on';
            
            const replaceFile = req.files.find(f => f.fieldname === `replace_${type}_${i}`);
            const fileName = replaceFile ? replaceFile.originalname : oldFile;

            const moveStr = (dist === 0 || isNaN(dist)) ? "null" : `{ ${axis}: ${dist} }`;
            
            let extraProps = "";
            if (type === 'plate') extraProps += `, emissive: ${isEmissive ? 'true' : 'false'}`;
            if (type === 'back') extraProps += `, texture: ${isTexture ? 'true' : 'false'}`;

            newParts.push(`            { file: "${fileName}",  type: "${type}", move: ${moveStr}${extraProps} }`);
        }

        // B. 处理追加的文件
        const appendFiles = req.files.filter(f => f.fieldname === `append_${type}`);
        if (appendFiles && appendFiles.length > 0) {
            let defaultMove = "null";
            if (type === 'front') defaultMove = "{ z: 20 }";
            if (type === 'back') defaultMove = "{ z: -20 }";
            if (type === 'plate') defaultMove = "{ z: 10 }";

            appendFiles.forEach(f => {
                let extraProps = "";
                if (type === 'plate') extraProps = `, emissive: true`; 
                if (type === 'back') extraProps = `, texture: true`;   

                newParts.push(`            { file: "${f.originalname}",  type: "${type}", move: ${defaultMove}${extraProps} }`);
            });
        }
    });

    const detailRegex = new RegExp(`"${oldId}":\\s*\\[[\\s\\S]*?\\]`, 'g');
    const newDetailBlock = `"${newId}": [\n${newParts.join(',\n')}\n        ]`;
    detailContent = detailContent.replace(detailRegex, newDetailBlock);

    fs.writeFileSync(path.join(__dirname, 'index.html'), indexContent);
    fs.writeFileSync(path.join(__dirname, 'detail.html'), detailContent);

    res.send(`<script>alert("配置更新成功！"); location.href="/";</script>`);
});

// --- 上架逻辑 ---
app.post('/upload', upload.fields([{name:'imageFile'},{name:'front'},{name:'back'},{name:'plate'},{name:'led'},{name:'fixed'}]), (req, res) => {
    const { productId, productName } = req.body;
    const files = req.files || {};
    const imagePath = files.imageFile ? `images/${files.imageFile[0].originalname}` : "images/default.jpg";
    const entry = `{ id: "${productId}", name: "${productName}", image: "${imagePath}" }`;
    
    let partEntries = [];
    const processFiles = (fileArray, type, defaultMove, extraProps = "") => {
        if (fileArray && fileArray.length > 0) {
            fileArray.forEach(f => {
                partEntries.push(`            { file: "${f.originalname}",  type: "${type}", move: ${defaultMove}${extraProps} }`);
            });
        }
    };

    processFiles(files.front, 'front', '{ z: 20 }');
    processFiles(files.plate, 'plate', '{ z: 10 }', ', emissive: true'); 
    processFiles(files.led, 'led', 'null');
    processFiles(files.fixed, 'fixed', 'null');
    processFiles(files.back, 'back', '{ z: -20 }', ', texture: true'); 

    const detailEntry = `"${productId}": [\n${partEntries.join(',\n')}\n        ],`;
    
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
    body { background: #0a0a0a; color: #ccc; font-family: 'Segoe UI', sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .box { background: #141414; padding: 25px; border-radius: 8px; width: 100%; max-width: 600px; margin-bottom: 20px; border: 1px solid #222; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
    h2 { color: #f39c12; text-align: center; margin-bottom: 25px; margin-top:0; }
    input[type=text], input[type=number], select { padding: 8px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; }
    input[type=text] { width: 100%; margin: 8px 0; box-sizing: border-box; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; font-size:15px; transition:0.2s; }
    .btn-main:hover { background: #ffb74d; }
    .btn-sec { background: transparent; color: #888; border: 1px solid #444; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-top:10px; }
    .btn-sec:hover { border-color: #666; color:#ccc; }
    .btn-edit { background: #222; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 5px; }
    .btn-del { background: #300; color: #f55; border: 1px solid #500; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
    .item-card { background: #080808; border: 1px solid #222; padding: 15px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 60px; height: 60px; border-radius: 4px; object-fit: cover; margin-right: 15px; border:1px solid #333; }
    .info { display: flex; align-items: center; flex: 1; }
    .id-row { margin-bottom: 6px; }
    .id-tag { font-size: 11px; color: #000; background: #f39c12; padding: 2px 6px; border-radius: 3px; font-weight:bold; margin-right:8px; }
    .name-text { font-size: 14px; color: #fff; font-weight: 500; }
    .tags-container { display: flex; gap: 4px; flex-wrap: wrap; }
    .file-tag { font-size: 10px; padding: 2px 5px; border-radius: 2px; color: #fff; cursor: help; min-width:14px; text-align:center; }
    .tag-blue { background: #2980b9; } .tag-green { background: #27ae60; } .tag-red { background: #c0392b; } .tag-gray { background: #7f8c8d; }
    .group-details { background: #080808; margin-bottom: 10px; border-radius: 4px; overflow: hidden; border: 1px solid #222; }
    .group-summary { padding: 12px 15px; cursor: pointer; background: #111; list-style: none; display: flex; align-items: center; user-select: none; }
    .group-summary::-webkit-details-marker { display: none; } 
    .group-summary:hover { background: #161616; }
    .badge { color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; min-width:15px; text-align:center; }
    .summary-tip { margin-left: auto; font-size: 11px; color: #555; }
    .group-content { padding: 10px; border-top: 1px solid #222; }
    .part-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #222; }
    .part-row:last-child { border-bottom: none; }
    .part-info { display: flex; align-items: flex-start; flex: 1; overflow: hidden; margin-right: 10px; }
    .idx-label { font-size: 10px; color: #fff; padding: 2px 5px; border-radius: 3px; margin-right: 8px; margin-top:2px; }
    .file-name { font-size: 12px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; margin-bottom:4px; }
    .mini-file-input { font-size: 10px; color: #555; width: 100%; }
    .part-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
    .control-row { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
    .move-group { display: flex; gap: 4px; align-items: center; }
    .move-group select { width: 45px; padding: 3px; font-size: 11px; height: 24px; }
    .move-group input[type=number] { width: 50px; padding: 3px; font-size: 11px; height: 24px; }
    .emissive-toggle { font-size: 11px; color: #2ecc71; display: flex; align-items: center; gap: 3px; cursor: pointer; }
    .texture-toggle { font-size: 11px; color: #3498db; display: flex; align-items: center; gap: 3px; cursor: pointer; }
    .delete-toggle { font-size: 11px; color: #e74c3c; display: flex; align-items: center; gap: 3px; cursor: pointer; }
    .append-row { margin-top: 10px; background: #111; padding: 8px; border-radius: 4px; border: 1px dashed #333; display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
    .append-row input { font-size: 11px; }
    .img-edit-box { display: flex; gap: 15px; margin-bottom: 20px; align-items: center; }
    .img-edit-box img { width: 80px; height: 80px; border-radius: 6px; object-fit: cover; border: 1px solid #333; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; margin-top: 10px; }
    .sticky-footer { position: sticky; bottom: 0; background: #141414; padding-top: 15px; padding-bottom: 5px; border-top: 1px solid #222; margin-top: 20px; z-index: 10; }
    </style>
    <script>function deleteProduct(id){if(confirm('确定删除 '+id+'?'))fetch('/delete/'+id,{method:'DELETE'}).then(()=>location.reload());}</script>
    </head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('✅ 系统UI升级：编辑页现在直观显示并预填当前位移距离 http://localhost:3000'));