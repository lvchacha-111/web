const Fontmin = require('fontmin');
const fs = require('fs');

// 1. 读取常用字
if (!fs.existsSync('chars.txt')) {
    console.error('错误：找不到 chars.txt 文件！');
    process.exit();
}
const textContent = fs.readFileSync('chars.txt', 'utf8');

// 2. 配置任务
const fontmin = new Fontmin()
    .src('STXINGKA.TTF')             // 源文件
    .dest('build_fonts/')          // 输出目录
    .use(Fontmin.glyph({
        text: textContent,
        hinting: false
    }));

// 3. 执行
console.log('正在拼命瘦身中，请稍后...');
fontmin.run(function (err, files) {
    if (err) {
        console.error('出错了：', err);
        return;
    }
    console.log('🎉 瘦身大功告成！');
    console.log('请查看 build_fonts 文件夹里的 simhei.ttf');
});