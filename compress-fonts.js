// 字体文件压缩脚本
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

// 需要压缩的字体文件
const FONTS_TO_COMPRESS = [
    { input: 'simhei.ttf', output: 'simhei-compressed.woff2', type: 'woff2' },
    { input: 'STXINGKA.TTF', output: 'stxingka-compressed.woff2', type: 'woff2' }
];

async function compressFonts() {
    console.log('🎯 开始压缩字体文件...\n');
    
    let totalSaved = 0;
    let originalTotal = 0;
    
    for (const font of FONTS_TO_COMPRESS) {
        const inputPath = path.join(__dirname, font.input);
        const outputPath = path.join(__dirname, font.output);
        
        // 检查输入文件是否存在
        if (!fs.existsSync(inputPath)) {
            console.log(`❌ 文件不存在: ${font.input}`);
            continue;
        }
        
        const originalSize = fs.statSync(inputPath).size;
        originalTotal += originalSize;
        
        console.log(`处理: ${font.input}`);
        console.log(`  原始大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        
        try {
            if (font.type === 'woff2') {
                // 使用 fonttools 压缩为 woff2
                // 需要先安装: pip install fonttools brotli
                console.log('  压缩为 WOFF2 格式...');
                
                // 检查是否安装了 fonttools
                try {
                    await execPromise('pyftsubset --version');
                } catch (e) {
                    console.log('  ⚠️  未安装 fonttools，跳过压缩');
                    console.log('  安装命令: pip install fonttools brotli');
                    continue;
                }
                
                // 提取常用字符集（减少文件大小）
                const commonChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:!?\'"()- ';
                
                // 构建命令
                const cmd = `pyftsubset "${inputPath}" --output-file="${outputPath}" --flavor=woff2 --text="${commonChars}"`;
                
                await execPromise(cmd);
                
                const compressedSize = fs.statSync(outputPath).size;
                const saved = originalSize - compressedSize;
                totalSaved += saved;
                
                console.log(`  压缩后: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  节省: ${(saved / 1024 / 1024).toFixed(2)} MB (${((saved / originalSize) * 100).toFixed(1)}%)`);
                
                // 更新HTML中的引用（可选）
                updateFontReferences(font.input, font.output);
                
            } else {
                console.log(`  ⚠️  不支持的格式: ${font.type}`);
            }
            
        } catch (error) {
            console.log(`  ❌ 压缩失败: ${error.message}`);
        }
        
        console.log('');
    }
    
    // 总结
    console.log('📊 压缩总结:');
    console.log(`  原始总大小: ${(originalTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  总共节省: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  节省比例: ${((totalSaved / originalTotal) * 100).toFixed(1)}%`);
    
    if (totalSaved > 0) {
        console.log('\n💡 建议:');
        console.log('  1. 更新HTML文件中的字体引用');
        console.log('  2. 考虑使用CDN加速字体加载');
        console.log('  3. 启用HTTP/2进一步提升性能');
    }
}

function updateFontReferences(oldFont, newFont) {
    console.log(`  更新字体引用: ${oldFont} -> ${newFont}`);
    
    // 这里可以添加更新HTML/CSS中字体引用的逻辑
    // 由于不同项目结构不同，这里只提供示例
    
    const htmlFiles = ['index.html', 'detail.html', 'freewriting.html'];
    
    for (const file of htmlFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            try {
                let content = fs.readFileSync(filePath, 'utf8');
                const oldRef = `"${oldFont}"`;
                const newRef = `"${newFont}"`;
                
                if (content.includes(oldRef)) {
                    content = content.replace(new RegExp(oldRef, 'g'), newRef);
                    fs.writeFileSync(filePath, content, 'utf8');
                    console.log(`    ✓ 更新了 ${file}`);
                }
            } catch (error) {
                console.log(`    ✗ 更新 ${file} 失败: ${error.message}`);
            }
        }
    }
}

// 替代方案：如果无法安装fonttools，使用简单优化
function simpleFontOptimization() {
    console.log('🔧 使用简单优化方案...\n');
    
    const fonts = [
        { file: 'simhei.ttf', size: fs.statSync(path.join(__dirname, 'simhei.ttf')).size },
        { file: 'STXINGKA.TTF', size: fs.statSync(path.join(__dirname, 'STXINGKA.TTF')).size }
    ];
    
    console.log('当前字体文件大小:');
    fonts.forEach(font => {
        console.log(`  ${font.file}: ${(font.size / 1024 / 1024).toFixed(2)} MB`);
    });
    
    console.log('\n💡 优化建议:');
    console.log('  1. 考虑使用系统字体替代（如微软雅黑）');
    console.log('  2. 只加载需要的字符集');
    console.log('  3. 使用字体CDN（如Google Fonts）');
    console.log('  4. 启用字体显示交换（font-display: swap）');
    
    // 创建优化建议文件
    const suggestions = `
字体优化建议：

1. 立即可做的：
   - 在CSS中添加：font-display: swap;
   - 使用预加载：<link rel="preload" href="fonts/simhei.ttf" as="font">

2. 中期优化：
   - 转换为WOFF2格式（节省50-70%大小）
   - 只包含中文字符（如果只显示中文）

3. 长期方案：
   - 使用CDN加速
   - 考虑系统字体替代

当前字体总大小：${(fonts.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
目标：减少到 1-2 MB 以内
`;
    
    fs.writeFileSync(path.join(__dirname, 'font-optimization-suggestions.txt'), suggestions);
    console.log('\n📝 详细建议已保存到: font-optimization-suggestions.txt');
}

// 主函数
async function main() {
    console.log('========================================');
    console.log('        XinWeb 字体优化工具');
    console.log('========================================\n');
    
    try {
        await compressFonts();
    } catch (error) {
        console.log('压缩失败，使用简单优化方案...\n');
        simpleFontOptimization();
    }
    
    console.log('\n✅ 优化完成！');
}

// 运行
main().catch(console.error);