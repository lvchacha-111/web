// 验证防打垮效果
console.log('🔍 验证防打垮优化效果...\n');

// 简单测试函数
function test(url) {
    return new Promise(resolve => {
        const http = require('http');
        const start = Date.now();
        
        const req = http.request(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    time: Date.now() - start,
                    status: res.statusCode,
                    headers: res.headers,
                    size: data.length
                });
            });
        });
        
        req.on('error', () => resolve({ error: true }));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve({ timeout: true });
        });
        
        req.end();
    });
}

async function runTests() {
    console.log('1. 测试健康检查...');
    const health = await test('http://localhost:5000/health');
    if (health.status === 200) {
        console.log('   ✅ 健康检查正常');
        console.log(`   响应时间: ${health.time}ms`);
    }
    
    console.log('\n2. 测试首页加载...');
    const home = await test('http://localhost:5000/');
    if (home.status === 200) {
        console.log('   ✅ 首页加载正常');
        console.log(`   响应时间: ${home.time}ms`);
        
        // 检查压缩
        if (home.headers['content-encoding'] === 'gzip') {
            console.log('   ✅ Gzip压缩已启用');
        }
        
        // 检查缓存
        if (home.headers['cache-control']) {
            console.log(`   ✅ 缓存头: ${home.headers['cache-control']}`);
        }
    }
    
    console.log('\n3. 测试限流功能...');
    console.log('   快速发送10个请求测试...');
    const requests = [];
    for (let i = 0; i < 10; i++) {
        requests.push(test('http://localhost:5000/health'));
    }
    
    const results = await Promise.all(requests);
    const success = results.filter(r => r.status === 200).length;
    const blocked = results.filter(r => r.status === 429).length;
    
    console.log(`   成功: ${success} 个`);
    console.log(`   被限流: ${blocked} 个`);
    
    if (blocked > 0) {
        console.log('   ✅ 限流功能正常（阻止了过快请求）');
    } else {
        console.log('   ⚠️  限流未触发（请求不够快）');
    }
    
    console.log('\n4. 测试大文件缓存...');
    const font = await test('http://localhost:5000/simhei.ttf');
    if (font.status === 200) {
        console.log(`   字体文件大小: ${Math.round(font.size / 1024 / 1024 * 100) / 100} MB`);
        if (font.headers['cache-control'] && font.headers['cache-control'].includes('max-age')) {
            console.log('   ✅ 大文件缓存已设置');
        }
    }
    
    console.log('\n🎯 验证完成！');
    console.log('\n📊 防打垮效果总结:');
    console.log('  • 健康监控: ✅ 正常');
    console.log('  • 流量压缩: ' + (home.headers['content-encoding'] === 'gzip' ? '✅ 已启用' : '⚠️ 未检测到'));
    console.log('  • 缓存优化: ' + (home.headers['cache-control'] ? '✅ 已设置' : '⚠️ 未设置'));
    console.log('  • 限流保护: ' + (blocked > 0 ? '✅ 已生效' : '⚠️ 未触发'));
    
    console.log('\n💡 生产环境建议:');
    console.log('  1. 使用此server.js替换原文件');
    console.log('  2. 阿里云配置Nginx反向代理');
    console.log('  3. 启用HTTPS/SSL证书');
    console.log('  4. 监控/health接口状态');
}

// 检查服务器是否运行
test('http://localhost:5000/health').then(result => {
    if (result.status === 200) {
        runTests();
    } else {
        console.log('❌ 服务器未运行，请先启动:');
        console.log('   node server-简单防打垮.js');
        console.log('\n或运行: node server.js (如果已替换)');
    }
});