#!/usr/bin/env node
/**
 * 检查代码中的敏感信息
 */

const fs = require('fs');
const path = require('path');

// 敏感关键词（正则表达式）
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*["'][^"']+["']/gi,
  /secret\s*[:=]\s*["'][^"']+["']/gi,
  /key\s*[:=]\s*["'][^"']+["']/gi,
  /token\s*[:=]\s*["'][^"']+["']/gi,
  /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi,
  /database\s*[:=]\s*["'][^"']+["']/gi,
  /mongodb(?:\+srv)?:\/\/[^"']+/gi,
  /postgres(?:ql)?:\/\/[^"']+/gi,
  /mysql:\/\/[^"']+/gi,
  /redis:\/\/[^"']+/gi,
  /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/g,  // IP地址
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // 邮箱
  /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})/g,     // 信用卡号（简单模式）
];

// 要检查的文件扩展名
const EXTENSIONS = ['.js', '.json', '.html', '.md'];

// 排除的目录和文件
const EXCLUDED = [
  'node_modules',
  'backups',
  '.git',
  'build_fonts',
  'claw',
  'fonts',
  'images',
  'Metal011_2K-JPG',
  'model',
  'stl',
  'text',
  'textures',
  'uploads',
  'three.min.js',
  'GLTFLoader.js',
  'OBJLoader.js',
  'OrbitControls.js',
  'STLLoader.js',
];

function shouldCheck(filePath) {
  const basename = path.basename(filePath);
  const dirname = path.dirname(filePath);
  
  // 检查是否在排除列表中
  for (const excluded of EXCLUDED) {
    if (filePath.includes(excluded)) {
      return false;
    }
  }
  
  // 检查文件扩展名
  const ext = path.extname(filePath);
  return EXTENSIONS.includes(ext);
}

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];
    
    lines.forEach((line, index) => {
      SENSITIVE_PATTERNS.forEach((pattern, patternIndex) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // 跳过一些误判（如版本号、示例代码）
            if (line.includes('example.com') || 
                line.includes('example@example.com') ||
                line.includes('your_') ||
                line.includes('placeholder')) {
              return;
            }
            
            issues.push({
              file: filePath,
              line: index + 1,
              match: match.trim(),
              context: line.trim().substring(0, 100)
            });
          });
        }
      });
    });
    
    return issues;
  } catch (err) {
    console.warn(`无法读取文件: ${filePath}`, err.message);
    return [];
  }
}

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (shouldCheck(filePath)) {
        walkDir(filePath, fileList);
      }
    } else {
      if (shouldCheck(filePath)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

function main() {
  console.log('🔍 开始检查敏感信息...\n');
  
  const projectRoot = __dirname;
  const files = walkDir(projectRoot);
  
  console.log(`扫描 ${files.length} 个文件...\n`);
  
  let totalIssues = 0;
  const allIssues = [];
  
  files.forEach(file => {
    const issues = checkFile(file);
    if (issues.length > 0) {
      allIssues.push(...issues);
      totalIssues += issues.length;
      
      console.log(`📄 ${path.relative(projectRoot, file)}`);
      issues.forEach(issue => {
        console.log(`  第 ${issue.line} 行: ${issue.match}`);
        console.log(`      上下文: ${issue.context}`);
        console.log();
      });
    }
  });
  
  console.log('='.repeat(60));
  console.log(`检查完成。发现 ${totalIssues} 个潜在问题。\n`);
  
  if (totalIssues > 0) {
    console.log('📋 建议操作：');
    console.log('1. 检查以上匹配项是否包含真实的敏感信息');
    console.log('2. 将敏感信息移动到 .env 文件中');
    console.log('3. 在 .env 中设置，在代码中使用 process.env.XXX 读取');
    console.log('4. 确保 .env 在 .gitignore 中');
    
    // 生成报告文件
    const report = {
      scanTime: new Date().toISOString(),
      totalFilesScanned: files.length,
      totalIssues: totalIssues,
      issues: allIssues
    };
    
    fs.writeFileSync(
      path.join(projectRoot, 'sensitive-check-report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(`\n📄 详细报告已保存: sensitive-check-report.json`);
    
    process.exit(1); // 非零退出码表示有问题
  } else {
    console.log('✅ 恭喜！未发现明显的敏感信息硬编码问题。');
    console.log('\n💡 建议：');
    console.log('1. 确认所有密码、密钥都通过 .env 文件配置');
    console.log('2. 检查 .gitignore 是否包含 .env、backups/ 等目录');
    console.log('3. 准备阿里云服务器环境配置');
    
    // 删除报告文件（如果有旧的）
    try {
      fs.unlinkSync(path.join(projectRoot, 'sensitive-check-report.json'));
    } catch (err) {}
    
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}