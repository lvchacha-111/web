const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// --- 1. 连接云端大脑 (Supabase 配置) ---
const SUPABASE_URL = 'https://hfiwagyothcdhlcfivsu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6tnK0XbTCTGw5pSmnK3o-A_2a7TlS0O';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET_NAME = 'yijiao-assets';

// --- 2. 中间件设置 ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 使用内存存储，直接转发云端，不产生本地垃圾文件
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 3. 核心辅助工具：文件上传至 Supabase Storage ---
async function uploadToSupabase(fileBuffer, filePath, mimeType) {
    const finalType = filePath.endsWith('.glb') || filePath.endsWith('.stl') ? 'application/octet-stream' : mimeType;
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, fileBuffer, {
        contentType: finalType,
        upsert: true
    });
    if (error) throw error;
    // 获取公开访问链接
    const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return publicUrlData.publicUrl;
}

// --- 4. 管理路由 ---

// A. 管理首页：包含客户切换逻辑
app.get('/admin', async (req, res) => {
    try {
        // 获取当前操作的客户 ID，默认为 0001
        const cid = req.query.cid || '0001';

        // 只从云端查该客户的模型
        const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('client_id', cid)
            .order('created_at', { ascending: false });

        // 客户切换 HTML 结构
        const clientSelector = `
            <div style="background:#222; padding:15px; border-radius:10px; margin-bottom:20px; border:2px solid #f39c12; display:flex; align-items:center; gap:20px;">
                <b style="color:#f39c12">当前操控频道：</b>
                <select onchange="location.href='/admin?cid='+this.value" style="background:#000; color:#fff; border:1px solid #444; padding:8px 12px; border-radius:5px; font-weight:bold; cursor:pointer;">
                    <option value="0001" ${cid==='0001'?'selected':''}>客户 0001 (A公司)</option>
                    <option value="0002" ${cid==='0002'?'selected':''}>客户 0002 (B公司)</option>
                    <option value="0003" ${cid==='0003'?'selected':''}>客户 0003 (C公司)</option>
                    <option value="0004" ${cid==='0004'?'selected':''}>客户 0004 (内部测试)</option>
                </select>
                <span style="font-size:12px; color:#666">切换客户后，你的操作仅对该客户生效</span>
            </div>
        `;

        const listHtml = (products || []).map(p => `
            <div class="item-card">
                <div class="info"><img src="${p.image_url}" class="thumb"><div><div class="id-tag">${p.id}</div><div class="name-text">${p.name}</div></div></div>
                <div class="btns">
                    <button onclick="location.href='/config-page/${encodeURIComponent(p.id)}?cid=${cid}'" class="btn-edit">配置参数</button>
                    <button onclick="deleteProduct('${p.id}', '${cid}')" class="btn-del">销毁</button>
                </div>
            </div>
        `).join('');

        res.send(getBaseHtml(`
            <div class="box">
                ${clientSelector}
                <h2>🚀 远程上架新模型</h2>
                <form action="/upload" method="post" enctype="multipart/form-data">
                    <input type="hidden" name="client_id" value="${cid}">
                    <input type="text" name="productId" placeholder="产品 ID (禁止空格)" required oninput="this.value=this.value.replace(/\\s+/g,'')">
                    <input type="text" name="productName" placeholder="显示名称" required>
                    <label>封面图 (Image):</label><input type="file" name="imageFile" required>
                    <div class="file-grid">
                        <div>Front:<input type="file" name="front" required></div>
                        <div>Back:<input type="file" name="back" required></div>
                        <div>Plate:<input type="file" name="plate" required></div>
                        <div>LED:<input type="file" name="led" required></div>
                        <div>Fixed:<input type="file" name="fixed" required></div>
                    </div>
                    <button type="submit" class="btn-main">一键发射到该客户网页</button>
                </form>
            </div>
            <div class="box"><h3>📦 客户 [${cid}] 的资产库</h3>${listHtml || '<p style="color:#444">该客户名下暂无产品</p>'}</div>
        `));
    } catch (e) { res.status(500).send(e.message); }
});

// B. 配置详情页
app.get('/config-page/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const cid = req.query.cid || '0001';
        const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
        const { data: details } = await supabase.from('model_details').select('*').eq('id', id).single();

        if (!product) return res.status(404).send('该 ID 不存在');

        const partsHtml = details.config.map((part, i) => `
            <div class="part-row">
                <div style="flex:1"><b style="color:#f39c12">${part.type.toUpperCase()}</b><br><small style="color:#444">${part.file.split('/').pop()}</small></div>
                <div class="axis-group">
                    X:<input type="number" name="move_x_${i}" value="${part.move?.x || 0}">
                    Y:<input type="number" name="move_y_${i}" value="${part.move?.y || 0}">
                    Z:<input type="number" name="move_z_${i}" value="${part.move?.z || 0}">
                </div>
                <input type="hidden" name="file_${i}" value="${part.file}"><input type="hidden" name="type_${i}" value="${part.type}">
            </div>
        `).join('');

        res.send(getBaseHtml(`
            <div class="box">
                <h2>⚙️ 配置修改: ${id}</h2>
                <form action="/update/${encodeURIComponent(id)}" method="post">
                    <input type="hidden" name="cid" value="${cid}">
                    <label>修改显示名称:</label><input type="text" name="newName" value="${product.name}" required>
                    <h3 style="margin-top:20px; color:#f39c12">三轴位移调试 (X, Y, Z)</h3>
                    ${partsHtml}
                    <button type="submit" class="btn-main" style="margin-top:20px">保存云端修改</button>
                    <button type="button" onclick="location.href='/admin?cid=${cid}'" class="btn-sec">返回</button>
                </form>
            </div>
        `));
    } catch (e) { res.status(500).send(e.message); }
});

// C. 上架处理接口
app.post('/upload', upload.fields([{name:'imageFile'},{name:'front'},{name:'back'},{name:'plate'},{name:'led'},{name:'fixed'}]), async (req, res) => {
    try {
        const productId = req.body.productId.trim();
        const productName = req.body.productName.trim();
        const cid = req.body.client_id;
        const files = req.files;

        // 1. 上传图片
        const imgUrl = await uploadToSupabase(files.imageFile[0].buffer, `images/${productId}_cover.jpg`, files.imageFile[0].mimetype);

        // 2. 上传模型并生成默认配置
        let configArr = [];
        const parts = ['front', 'back', 'plate', 'led', 'fixed'];
        for (let type of parts) {
            const f = files[type][0];
            const url = await uploadToSupabase(f.buffer, `stl/${productId}/${f.originalname}`, 'application/octet-stream');
            let z = (type==='front'?20 : type==='plate'?10 : type==='back'?-20 : 0);
            configArr.push({ file: url, type: type, move: z===0?null:{x:0,y:0,z:z} });
        }

        // 3. 存入数据库
        await supabase.from('products').insert([{ id: productId, name: productName, image_url: imgUrl, client_id: cid }]);
        await supabase.from('model_details').insert([{ id: productId, config: configArr }]);
        
        res.redirect('/admin?cid=' + cid);
    } catch (e) { res.status(500).send("上传失败: " + e.message); }
});

// D. 更新处理接口
app.post('/update/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { newName, cid } = req.body;
        await supabase.from('products').update({ name: newName }).eq('id', id);
        
        let newConfig = [];
        for (let i = 0; i < 10; i++) {
            if (req.body[`type_${i}`]) {
                const x=parseInt(req.body[`move_x_${i}`]), y=parseInt(req.body[`move_y_${i}`]), z=parseInt(req.body[`move_z_${i}`]);
                newConfig.push({ file: req.body[`file_${i}`], type: req.body[`type_${i}`], move: (x===0&&y===0&&z===0)?null:{x,y,z} });
            }
        }
        await supabase.from('model_details').update({ config: newConfig }).eq('id', id);
        res.redirect('/admin?cid=' + cid);
    } catch (e) { res.status(500).send(e.message); }
});

// E. 销毁处理接口 (连带清理云端网盘)
app.delete('/delete/:id', async (req, res) => {
    const id = req.params.id;
    try {
        // 1. 获取网盘内的模型文件列表
        const { data: files } = await supabase.storage.from(BUCKET_NAME).list(`stl/${id}`);
        if (files && files.length > 0) {
            const paths = files.map(f => `stl/${id}/${f.name}`);
            await supabase.storage.from(BUCKET_NAME).remove(paths);
        }
        // 2. 删掉数据库记录 (级联删除会自动删详情表)
        await supabase.from('products').delete().eq('id', id);
        res.send('ok');
    } catch (e) { res.status(500).send(e.message); }
});

// --- 5. 静态服务 (兜底) ---
app.use(express.static(path.join(__dirname, './')));

// --- 6. UI 基础模板 ---
function getBaseHtml(content) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>亿角总控中心</title><style>
    body { background: #0a0a0a; color: #ccc; font-family: sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .box { background: #141414; padding: 20px; border-radius: 8px; width: 100%; max-width: 600px; margin-bottom: 20px; border: 1px solid #222; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h2 { color: #f39c12; text-align: center; margin-top: 0; }
    input[type=text], input[type=number] { padding: 10px; background: #000; border: 1px solid #333; color: #f39c12; border-radius: 4px; margin: 5px 0; outline: none; }
    input[type=text] { width: 100%; box-sizing: border-box; }
    input[type=number] { width: 65px; }
    .btn-main { background: #f39c12; color: #000; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; font-size: 16px; }
    .item-card { background: #000; border: 1px solid #222; padding: 15px; border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .thumb { width: 60px; height: 60px; border-radius: 6px; object-fit: cover; margin-right: 15px; border: 1px solid #333; }
    .part-row { background: #080808; padding: 12px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; border-left: 4px solid #f39c12; }
    .axis-group { font-size: 12px; color: #666; display: flex; gap: 5px; }
    .id-tag { font-size: 10px; background: #333; padding: 2px 5px; border-radius: 3px; color: #f39c12; font-family: monospace; }
    .btn-edit { background: #333; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-del { background: #411; color: #f55; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; margin-left: 5px; font-size: 12px; }
    .btn-sec { background: transparent; color: #444; border: 1px solid #333; padding: 10px; border-radius: 4px; margin-top: 10px; cursor: pointer; }
    .file-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; margin: 15px 0; color: #555; }
    </style><script>
        function deleteProduct(id, cid){
            if(confirm('确定从云端永久销毁 ['+id+'] 吗？不可撤销！')) {
                fetch('/delete/'+id, {method:'DELETE'}).then(()=>location.href='/admin?cid='+cid);
            }
        }
    </script></head><body>${content}</body></html>`;
}

app.listen(3000, () => console.log('🚀 亿角多租户云端总控已启动: http://localhost:2999/admin'));