// 快速测试限流功能
console.log('⚡ 快速测试限流功能...\n');

const http = require('http');

// 快速发送30个请求
let success = 0;
let blocked = 0;
let completed = 0;
const total = 30;

console.log(`发送 ${total} 个快速请求测试限流...\n`);

for (let i = 0; i < total; i++) {
    setTimeout(() => {
        const req = http.request('http://localhost:5000/health', res => {
            if (res.statusCode === 200) {
                success++;
            } else if (res.statusCode === 429) {
                blocked++;
                console.log(`  请求 ${i+1}: 被限流 ✅`);
            }
            
            completed++;
            
            // 所有请求完成后显示结果
            if (completed === total) {
                console.log('\n🎯 测试完成！');
                console.log(`   成功: ${success} 个`);
                console.log(`   被限流: ${blocked} 个`);
                console.log(`   成功率: ${Math.round(success/total*100)}%`);
                
                if (blocked > 0) {
                    console.log('\n✅ 限流功能正常！');
                    console.log('   防打垮生效：快速请求被自动阻止');
                } else {
                    console.log('\n⚠️  限流未触发');
                    console.log('   可能需要更快的请求速度');
                }
            }
        });
        
        req.on('error', () => {
            completed++;
        });
        
        req.end();
    }, i * 10); // 每10ms发送一个，模拟快速请求
}

// 3秒后显示进度
setTimeout(() => {
    if (completed < total) {
        console.log(`\n进度: ${completed}/${total} 个请求完成`);
    }
}, 3000);