const fs = require('fs');
const path = require('path');

// 使用 xinweb-hk
const files = ['index.html', 'detail.html', 'freewriting.html'];

files.forEach(filename => {
    const filepath = path.join(__dirname, filename);
    let content = fs.readFileSync(filepath, 'utf8');
    
    // 替换为 xinweb-hk
    content = content.replace(/const ASSET_BASE_URL = '[^']+';/g, "const ASSET_BASE_URL = 'https://xinweb-hk.oss-cn-hongkong.aliyuncs.com/';");
    
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`已将 ${filename} 改为 xinweb-hk`);
});

console.log('已完成！现在使用 xinweb-hk。');
console.log('注意：需要确保 xinweb-hk Bucket存在且有CORS配置。');