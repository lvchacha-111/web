const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // 引入云端驱动

const app = express();

// --- 1. 连接你的云端指挥部 ---
const SUPABASE_URL = 'https://hfiwagyothcdhlcfivsu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6tnK0XbTCTGw5pSmnK3o-A_2a7TlS0O';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, './')));

const UPLOAD_DIR = 'stl';
const IMAGE_DIR = 'images';

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

// --- 2. 路由：从云端读取所有产品 ---
app.get('/admin', async (req, res) => {
    // 从云端 products 表拿数据
    const { data: products, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    
    const listHtml = (products || []).map(p => `
        <div class="item-card">
            <div class="info"><img src="/${p.image_url}" class="thumb"><div><div class="id-tag">${p.id}</div><div class="name-text">${p.name}</div></div></div>
            <div class="btns">
                <button onclick="location.href='/edit/${p.id}'" class="btn-edit">云端配置</button>
                <button onclick="deleteProduct('${p.id}')" class="btn-del">彻底删除</button>
            </div>
        </div>
    `).join('');

    res.send(getBaseHtml(`
        <div class="box">
            <h2>☁️ 云端产品上架 (SaaS 模式)</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="text" name="productId" placeholder="产品 ID" required>
                <input type="text" name="productName" placeholder="显示名称" required>
                <label>封面图:</label><input type="file" name="imageFile" required>
                <div class="file-grid">
                    <div>Front:<input type="file" name="front" required></div>
                    <div>Back:<input type="file" name="back" required></div>
                    <div>Plate:<input type="file" name="plate" required></div>
                    <div>LED:<input type="file" name="led" required></div>
                    <div>Fixed:<input type="file" name="fixed" required></div>
                </div>
                <button type="submit" class="btn-main">同步至云端数据库</button>
            </form>
        </div>
        <div class="box"><h3>🌐 实时云端资产列表</h3>${listHtml || '<p>云端目前没有数据</p>'}</div>
    `));
});

// --- 3. 上架接口：同时写入云端两个表 ---
app.post('/upload', upload.fields([{name:'imageFile'},{name:'front'},{name:'back'},{name:'plate'},{name:'led'},{name:'fixed'}]), async (req, res) => {
    const { productId, productName } = req.body;
    const files = req.files;

    // A. 写入 products 表
    await supabase.from('products').insert([
        { id: productId, name: productName, image_url: `images/${files.imageFile[0].originalname}` }
    ]);

    // B. 写入 model_details 表
    const defaultConfig = [
        { file: files.front[0].originalname, type: "front", move: { z: 20 } },
        { file: files.plate[0].originalname, type: "plate", move: { z: 10 } },
        { file: files.led[0].originalname, type: "led", move: null },
        { file: files.fixed[0].originalname, type: "fixed", move: null },
        { file: files.back[0].originalname, type: "back", move: { z: -20 } }
    ];
    await supabase.from('model_details').insert([{ id: productId, config: defaultConfig }]);

    res.redirect('/admin');
});

// --- 4. 编辑页：从云端提取详情 ---
app.get('/edit/:id', async (req, res) => {
    const id = req.params.id;
    const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
    const { data: details } = await supabase.from('model_details').select('*').eq('id', id).single();

    if (!product || !details) return res.status(404).send('未找到云端数据');

    const partsHtml = details.config.map((part, i) => {
        return `
            <div class="part-row">
                <div style="flex:1">
                    <span class="part-type">${part.type.toUpperCase()}</span><br>
                    <span style="font-size:10px; color:#555">📄 ${part.file}</span>
                </div>
                <div class="axis-group">
                    X:<input type="number" name="move_x_${i}" value="${part.move?.x || 0}">
                    Y:<input type="number" name="move_y_${i}" value="${part.move?.y || 0}">
                    Z:<input type="number" name="move_z_${i}" value="${part.move?.z || 0}">
                </div>
                <input type="hidden" name="file_${i}" value="${part.file}">
                <input type="hidden" name="type_${i}" value="${part.type}">
            </div>
        `;
    }).join('');

    res.send(getBaseHtml(`
        <div class="box">
            <h2>⚙️ 云端配置修改: ${id}</h2>
            <form action="/update/${id}" method="post">
                <label>产品名称:</label><input type="text" name="newName" value="${product.name}" required>
                <h3 style="margin-top:20px; color:#f39c12">实时修改云端三维位移</h3>
                ${partsHtml}
                <button type="submit" class="btn-main" style="margin-top:20px">保存修改至云端</button>
                <button type="button" onclick="location.href='/admin'" class="btn-sec">取消返回</button>
            </form>
        </div>
    `));
});

// --- 5. 更新接口：推送到云端 ---
app.post('/update/:id', async (req, res) => {
    const id = req.params.id;
    const { newName } = req.body;

    // A. 更新基础信息
    await supabase.from('products').update({ name: newName }).eq('id', id);

    // B. 构建新配置并更新
    let newConfig = [];
    for (let i = 0; i < 10; i++) {
        if (req.body[`type_${i}`]) {
            const x = parseInt(req.body[`move_x_${i}`]);
            const y = parseInt(req.body[`move_y_${i}`]);
            const z = parseInt(req.body[`move_z_${i}`]);
            newConfig.push({
                file: req.body[`file_${i}`],
                type: req.body[`type_${i}`],
                move: (x===0 && y===0 && z===0) ? null : { x, y, z }
            });
        }
    }
    await supabase.from('model_details').update({ config: newConfig }).eq('id', id);

    res.send('<script>alert("云端同步成功！所有终端已更新。"); location.href="/admin";</script>');
});

// --- 6. 删除接口：清理云端 ---
app.delete('/delete/:id', async (req, res) => {
    const id = req.params.id;
    await supabase.from('products').delete().eq('id', id); // 级联删除会自动删掉 model_details
    res.send('Success');
});

function getBaseHtml(content) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>亿角云端后台</title><style>
    body { background: #0a0a0a; color: #ccc; font-family: sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .box { background: #141414; padding: 20px; border-radius: 8px; width: 100%; max-width: 580px; margin-bottom: 20px; border: 1px solid #222; }
    h2 { color: #f39c12; text-align: center; }
    input[type=text], input[type=number] { padding: 8px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; }
    input[type=text] { width: 100%; box-sizing: border-box; }
    input[type=number] { width: 50px; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; font-size:16px; }
    .item-card { background: #000; border: 1px solid #222; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 50px; height: 50px; border-radius: 4px; object-fit: cover; margin-right: 12px; }
    .part-row { background: #080808; padding: 10px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; border-left: 3px solid #f39c12; }
    .axis-group { font-size: 11px; color: #666; }
    .part-type { font-weight: bold; color: #f39c12; font-size: 13px; }
    .btn-edit { background: #333; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px; }
    .btn-del { background: #411; color: #f55; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-sec { background: transparent; color: #444; border: 1px solid #333; padding: 10px; border-radius: 4px; margin-top: 10px; cursor: pointer; width: 100%; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-top: 10px; color: #555; }
    </style><script>function deleteProduct(id){if(confirm('注意：这将永久删除云端数据！'))fetch('/delete/'+id,{method:'DELETE'}).then(()=>location.reload());}</script>
    </head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('✅ 云端指挥中心已启动: http://localhost:3000/admin'));