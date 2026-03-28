// 服务器端验证系统测试脚本
const http = require('http');

const BASE_URL = 'http://localhost:5000';
const TEST_CODES = {
    valid: 'YJ-LIFE-2024VIP',
    invalid: 'INVALID-CODE',
    expired: 'YJ-2M-2024TEST' // 2分钟试用
};

async function testAuthSystem() {
    console.log('🔐 测试服务器端验证系统\n');
    
    // 测试1: 验证有效邀请码
    console.log('1. 测试有效邀请码验证...');
    const verifyResult = await makeRequest('/api/verify-invite', 'POST', {
        inviteCode: TEST_CODES.valid
    });
    
    if (verifyResult.success) {
        console.log('✅ 有效邀请码验证成功');
        console.log(`   类型: ${verifyResult.type}`);
        console.log(`   消息: ${verifyResult.message}`);
        
        // 获取cookie用于后续测试
        const cookies = verifyResult.headers?.['set-cookie'];
        if (cookies) {
            console.log('✅ 会话cookie已设置');
            
            // 测试2: 检查会话状态
            console.log('\n2. 测试会话检查...');
            const sessionResult = await makeRequest('/api/check-session', 'GET', null, cookies);
            
            if (sessionResult.success) {
                console.log('✅ 会话检查成功');
                console.log(`   剩余时间: ${sessionResult.remaining}`);
            } else {
                console.log('❌ 会话检查失败');
            }
            
            // 测试3: 访问受保护内容
            console.log('\n3. 测试受保护内容访问...');
            const protectedResult = await makeRequest('/api/protected-content', 'GET', null, cookies);
            
            if (protectedResult.success) {
                console.log('✅ 受保护内容访问成功');
                console.log(`   消息: ${protectedResult.message}`);
            } else {
                console.log('❌ 受保护内容访问失败');
            }
            
            // 测试4: 无效邀请码
            console.log('\n4. 测试无效邀请码...');
            const invalidResult = await makeRequest('/api/verify-invite', 'POST', {
                inviteCode: TEST_CODES.invalid
            });
            
            if (!invalidResult.success && invalidResult.error) {
                console.log('✅ 无效邀请码正确拒绝');
                console.log(`   错误: ${invalidResult.error}`);
            } else {
                console.log('❌ 无效邀请码未正确拒绝');
            }
            
            // 测试5: 登出
            console.log('\n5. 测试登出功能...');
            const logoutResult = await makeRequest('/api/logout', 'POST', null, cookies);
            
            if (logoutResult.success) {
                console.log('✅ 登出成功');
                
                // 测试6: 登出后检查会话
                console.log('\n6. 测试登出后会话检查...');
                const afterLogoutResult = await makeRequest('/api/check-session', 'GET', null, cookies);
                
                if (afterLogoutResult.error === '需要登录访问' || afterLogoutResult.status === 401) {
                    console.log('✅ 登出后会话正确失效');
                } else {
                    console.log('❌ 登出后会话未失效');
                }
            }
        }
    } else {
        console.log('❌ 有效邀请码验证失败');
    }
    
    console.log('\n🎯 测试完成！');
}

async function makeRequest(path, method, data = null, cookies = null) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (cookies) {
            options.headers.Cookie = cookies;
        }
        
        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    result.status = res.statusCode;
                    result.headers = res.headers;
                    resolve(result);
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        raw: responseData,
                        error: '解析响应失败'
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            resolve({ error: error.message });
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// 先启动服务器，然后运行测试
console.log('⚠️  请先启动服务器: node server.js');
console.log('⚠️  然后在另一个终端运行: node test-auth.js');
console.log('\n或者按回车键自动测试（需要服务器已运行）...');

// 简单等待输入
process.stdin.once('data', () => {
    testAuthSystem().catch(console.error);
});