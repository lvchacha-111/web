// 性能测试脚本
const http = require('http');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:5000';
const CONCURRENT_REQUESTS = 50; // 并发请求数
const TOTAL_REQUESTS = 200; // 总请求数

async function testPerformance() {
    console.log('🚀 开始性能测试...\n');
    
    // 测试1: 健康检查
    console.log('1. 测试健康检查接口...');
    const healthStart = Date.now();
    const healthRes = await makeRequest('/health', 'GET');
    const healthTime = Date.now() - healthStart;
    
    console.log(`   响应时间: ${healthTime}ms`);
    console.log(`   状态: ${healthRes.status}`);
    
    // 测试2: 静态文件（首页）
    console.log('\n2. 测试首页加载...');
    const homeStart = Date.now();
    const homeRes = await makeRequest('/', 'GET');
    const homeTime = Date.now() - homeStart;
    
    console.log(`   响应时间: ${homeTime}ms`);
    console.log(`   状态: ${homeRes.status}`);
    console.log(`   大小: ${homeRes.raw?.length || 0} bytes`);
    
    // 测试3: 并发请求测试
    console.log('\n3. 并发请求测试...');
    console.log(`   并发数: ${CONCURRENT_REQUESTS}`);
    console.log(`   总请求数: ${TOTAL_REQUESTS}`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        promises.push(makeRequest('/health', 'GET').catch(err => ({ error: err.message })));
        
        // 控制并发数
        if (promises.length >= CONCURRENT_REQUESTS) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }
    
    // 等待剩余请求
    if (promises.length > 0) {
        await Promise.all(promises);
    }
    
    const totalTime = Date.now() - startTime;
    const requestsPerSecond = TOTAL_REQUESTS / (totalTime / 1000);
    
    console.log(`   总时间: ${totalTime}ms`);
    console.log(`   每秒请求: ${requestsPerSecond.toFixed(2)}`);
    
    // 测试4: 限流测试
    console.log('\n4. 测试限流功能...');
    console.log('   快速发送10个请求测试限流...');
    
    const rapidRequests = [];
    for (let i = 0; i < 10; i++) {
        rapidRequests.push(makeRequest('/api/status', 'GET'));
    }
    
    const results = await Promise.allSettled(rapidRequests);
    const success = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
    const limited = results.filter(r => r.status === 'fulfilled' && r.value.status === 429).length;
    
    console.log(`   成功: ${success} 个`);
    console.log(`   被限流: ${limited} 个`);
    
    // 测试5: 内存状态
    console.log('\n5. 检查内存状态...');
    const statusRes = await makeRequest('/api/status', 'GET');
    
    if (statusRes.success) {
        console.log(`   运行时间: ${statusRes.server.uptime} 秒`);
        console.log(`   内存使用: ${statusRes.memory.heapUsed}`);
        console.log(`   活跃会话: ${statusRes.sessions.active} 个`);
    }
    
    console.log('\n🎯 性能测试完成！');
    console.log('\n📊 总结:');
    console.log(`   • 单次请求: ${healthTime}ms`);
    console.log(`   • 并发能力: ${requestsPerSecond.toFixed(2)} 请求/秒`);
    console.log(`   • 限流保护: ${limited > 0 ? '✅ 有效' : '⚠️ 未触发'}`);
    console.log(`   • 内存状态: ${statusRes.memory?.heapUsed || '未知'}`);
    
    // 建议
    console.log('\n💡 优化建议:');
    if (requestsPerSecond < 100) {
        console.log('   ⚠️  并发性能较低，考虑优化代码或升级服务器');
    } else if (requestsPerSecond < 500) {
        console.log('   ✅ 并发性能良好，适合中小流量');
    } else {
        console.log('   🎉 并发性能优秀，可承载较大流量');
    }
}

async function makeRequest(path, method) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'User-Agent': 'Performance-Test/1.0'
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    result.status = res.statusCode;
                    resolve(result);
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        raw: data,
                        headers: res.headers
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            resolve({ error: error.message, status: 0 });
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve({ error: '请求超时', status: 0 });
        });
        
        req.end();
    });
}

// 检查服务器是否运行
function checkServerRunning() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 5000,
            path: '/health',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        
        req.end();
    });
}

// 主函数
async function main() {
    console.log('🔍 检查服务器状态...');
    
    const isRunning = await checkServerRunning();
    
    if (!isRunning) {
        console.log('❌ 服务器未运行，正在启动...');
        
        // 启动服务器
        const serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname,
            stdio: 'pipe'
        });
        
        serverProcess.stdout.on('data', (data) => {
            console.log(data.toString().trim());
        });
        
        serverProcess.stderr.on('data', (data) => {
            console.error('服务器错误:', data.toString());
        });
        
        // 等待服务器启动
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('✅ 服务器已启动，开始测试...\n');
        
        // 运行测试
        await testPerformance();
        
        // 测试完成后关闭服务器
        serverProcess.kill();
        console.log('\n🛑 测试完成，服务器已停止');
    } else {
        console.log('✅ 服务器正在运行，开始测试...\n');
        await testPerformance();
    }
}

// 运行测试
main().catch(console.error);