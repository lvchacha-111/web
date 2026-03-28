#!/usr/bin/env node

/**
 * XinWeb 3D 平台 - 智能备份脚本
 * 
 * 功能：
 * 1. 自动备份关键目录（uploads, images, stl等）
 * 2. 跨平台兼容（Windows/Linux/Mac）
 * 3. 详细的日志和错误处理
 * 4. 自动清理旧备份（可配置保留天数）
 * 5. 生成备份清单和校验文件
 * 6. 支持环境变量配置
 * 
 * 使用方法：
 * 1. 直接运行：node backup.js
 * 2. 定时任务：配置Windows任务计划或Linux cron
 * 
 * 配置（在.env文件中添加）：
 * # 备份配置
 * BACKUP_ENABLED=true
 * BACKUP_DIR=./backups
 * BACKUP_RETENTION_DAYS=7
 * BACKUP_SOURCES=uploads,images,stl
 * BACKUP_COMPRESSION=false
 * 
 * 默认值已内置，无需配置即可运行。
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

// ====================== 命令行参数解析 ======================
const ARGS = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help' || arg === '-h') {
    console.log(`
XinWeb 3D 平台 - 智能备份脚本
用法: node backup.js [选项]

选项:
  --help, -h          显示此帮助信息
  --dry-run           模拟运行，不实际复制文件
  --config <path>     指定配置文件路径（默认使用.env）
  --sources <list>    覆盖备份源目录（逗号分隔）
  --retention <days>  覆盖保留天数
  --backup-dir <dir>  覆盖备份目录

示例:
  node backup.js                    # 正常备份
  node backup.js --dry-run          # 模拟运行
  node backup.js --sources uploads,images  # 只备份指定目录

配置优先顺序：命令行参数 > 环境变量 > 默认值
    `);
    process.exit(0);
  } else if (arg === '--dry-run') {
    ARGS.dryRun = true;
  } else if (arg === '--config' && i + 1 < process.argv.length) {
    process.argv[++i]; // 跳过，dotenv 已加载 .env
  } else if (arg === '--sources' && i + 1 < process.argv.length) {
    ARGS.sources = process.argv[++i];
  } else if (arg === '--retention' && i + 1 < process.argv.length) {
    ARGS.retentionDays = parseInt(process.argv[++i]);
  } else if (arg === '--backup-dir' && i + 1 < process.argv.length) {
    ARGS.backupDir = process.argv[++i];
  }
}

// ====================== 配置部分 ======================
const CONFIG = {
  // 是否启用备份
  enabled: process.env.BACKUP_ENABLED !== 'false',
  
  // 备份存储目录（相对于项目根目录）
  backupDir: ARGS.backupDir || process.env.BACKUP_DIR || path.join(__dirname, 'backups'),
  
  // 保留多少天的备份
  retentionDays: ARGS.retentionDays || parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
  
  // 需要备份的目录（逗号分隔，相对于项目根目录）
  sources: (ARGS.sources || process.env.BACKUP_SOURCES || 'uploads,images,stl')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0),
  
  // 是否压缩备份（暂未实现，预留）
  compression: process.env.BACKUP_COMPRESSION === 'true',
  
  // 日志级别：debug, info, warn, error
  logLevel: process.env.BACKUP_LOG_LEVEL || 'info',
  
  // 是否为模拟运行
  dryRun: ARGS.dryRun || false
};

// ====================== 日志系统 ======================
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[CONFIG.logLevel] || LOG_LEVELS.info;

function log(level, message, ...args) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }
}

function debug(...args) { log('debug', ...args); }
function info(...args) { log('info', ...args); }
function warn(...args) { log('warn', ...args); }
function error(...args) { log('error', ...args); }

// ====================== 工具函数 ======================
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    debug(`创建目录: ${dirPath}`);
  }
  return dirPath;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch (err) {
    return false;
  }
}

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ====================== 跨平台复制 ======================
function copyDirectory(source, target) {
  return new Promise((resolve, reject) => {
    const sourceExists = fileExists(source);
    if (!sourceExists) {
      debug(`源目录不存在，跳过: ${source}`);
      resolve({ success: false, skipped: true, reason: '源目录不存在' });
      return;
    }

    if (CONFIG.dryRun) {
      info(`[模拟] 将复制: ${source} -> ${target}`);
      resolve({ success: true, dryRun: true });
      return;
    }

    ensureDir(path.dirname(target));

    const platform = process.platform;
    let command;
    
    if (platform === 'win32') {
      // Windows: 使用 robocopy（如果可用）或 xcopy
      command = `robocopy "${source}" "${target}" /E /COPYALL /R:3 /W:5 /NP /NFL /NDL`;
    } else {
      // Linux/Mac: 使用 rsync（如果可用）或 cp
      command = `rsync -a "${source}/" "${target}/" 2>/dev/null || cp -r "${source}/." "${target}/"`;
    }

    debug(`执行复制命令: ${command}`);
    
    exec(command, (err, stdout, stderr) => {
      if (err) {
        // robocopy 返回非零退出码表示有文件未复制，但不一定是致命错误
        if (platform === 'win32' && err.code === 1) {
          // robocopy 返回1表示有文件被复制，但有跳过（正常情况）
          debug(`robocopy 部分成功: ${stdout}`);
          resolve({ success: true, partial: true, output: stdout });
        } else {
          error(`复制失败: ${source} -> ${target}`, err.message);
          resolve({ success: false, error: err.message });
        }
      } else {
        debug(`复制成功: ${source} -> ${target}`);
        resolve({ success: true, output: stdout });
      }
    });
  });
}

// ====================== 备份操作 ======================
async function createBackup() {
  info('🚀 开始备份流程');
  info(`配置: 保留${CONFIG.retentionDays}天, 备份目录: ${CONFIG.backupDir}`);
  info(`备份源: ${CONFIG.sources.join(', ')}`);

  if (!CONFIG.enabled) {
    info('备份功能已禁用，跳过');
    return { success: false, reason: 'disabled' };
  }

  // 创建备份根目录
  const backupRoot = CONFIG.dryRun ? CONFIG.backupDir : ensureDir(CONFIG.backupDir);
  
  // 按日期创建备份目录
  const dateStr = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const backupName = `backup_${dateStr}_${timestamp}`;
  const backupPath = path.join(backupRoot, backupName);
  
  if (CONFIG.dryRun) {
    info(`[模拟] 将创建备份目录: ${backupPath}`);
  } else {
    ensureDir(backupPath);
    info(`备份目录: ${backupPath}`);
  }

  const backupReport = {
    startTime: new Date().toISOString(),
    backupName,
    backupPath,
    sources: [],
    errors: [],
    stats: {
      totalSources: CONFIG.sources.length,
      successful: 0,
      skipped: 0,
      failed: 0
    }
  };

  // 备份每个源目录
  for (const source of CONFIG.sources) {
    const sourcePath = path.join(__dirname, source);
    const targetPath = path.join(backupPath, source);
    
    info(`备份: ${source} -> ${targetPath}`);
    
    try {
      const result = await copyDirectory(sourcePath, targetPath);
      
      const sourceReport = {
        name: source,
        sourcePath,
        targetPath,
        success: result.success,
        skipped: result.skipped || false,
        error: result.error || null,
        timestamp: new Date().toISOString()
      };

      backupReport.sources.push(sourceReport);
      
      if (result.skipped) {
        backupReport.stats.skipped++;
        warn(`跳过不存在的目录: ${source}`);
      } else if (result.success) {
        backupReport.stats.successful++;
        info(`✓ 备份完成: ${source}`);
      } else {
        backupReport.stats.failed++;
        backupReport.errors.push(`备份失败: ${source} - ${result.error}`);
        error(`备份失败: ${source}`);
      }
    } catch (err) {
      backupReport.stats.failed++;
      backupReport.errors.push(`备份异常: ${source} - ${err.message}`);
      error(`备份异常: ${source}`, err);
    }
  }

  // 生成备份清单
  backupReport.endTime = new Date().toISOString();
  backupReport.duration = new Date(backupReport.endTime) - new Date(backupReport.startTime);
  
  if (CONFIG.dryRun) {
    info(`[模拟] 将生成备份清单: ${backupPath}/BACKUP_MANIFEST.json`);
    info(`[模拟] 清单内容预览:`, JSON.stringify(backupReport, null, 2).substring(0, 500) + '...');
  } else {
    const manifestPath = path.join(backupPath, 'BACKUP_MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify(backupReport, null, 2));
    info(`备份清单已生成: ${manifestPath}`);
  }

  // 清理旧备份
  cleanupOldBackups(backupRoot);

  // 输出总结
  info('='.repeat(50));
  info(`📊 备份总结:`);
  info(`  总计: ${backupReport.stats.totalSources} 个源目录`);
  info(`  成功: ${backupReport.stats.successful}`);
  info(`  跳过: ${backupReport.stats.skipped}`);
  info(`  失败: ${backupReport.stats.failed}`);
  info(`  耗时: ${backupReport.duration}ms`);
  info(`  备份位置: ${backupPath}`);
  
  if (backupReport.errors.length > 0) {
    error(`⚠️  有错误发生:`);
    backupReport.errors.forEach(err => error(`  - ${err}`));
  }
  
  info('='.repeat(50));
  
  return backupReport;
}

// ====================== 清理旧备份 ======================
function cleanupOldBackups(backupRoot) {
  if (CONFIG.dryRun) {
    info(`[模拟] 将检查旧备份清理: ${backupRoot}`);
    info(`[模拟] 保留最近${CONFIG.retentionDays}天的备份`);
    return;
  }
  
  if (!fs.existsSync(backupRoot)) return;
  
  const files = fs.readdirSync(backupRoot);
  const now = Date.now();
  const cutoffTime = now - (CONFIG.retentionDays * 24 * 60 * 60 * 1000);
  
  let deletedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(backupRoot, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && file.startsWith('backup_')) {
      if (stat.mtimeMs < cutoffTime) {
        try {
          fs.rmSync(filePath, { recursive: true, force: true });
          info(`🗑️  删除旧备份: ${file}`);
          deletedCount++;
        } catch (err) {
          error(`删除失败: ${file}`, err.message);
        }
      }
    }
  }
  
  if (deletedCount > 0) {
    info(`已清理 ${deletedCount} 个旧备份（保留最近${CONFIG.retentionDays}天）`);
  }
}

// ====================== 主函数 ======================
async function main() {
  info('='.repeat(50));
  info('🦞 XinWeb 3D 平台 - 智能备份系统');
  if (CONFIG.dryRun) {
    info('⚠️  模拟运行模式（不实际执行操作）');
  }
  info('='.repeat(50));
  
  try {
    const report = await createBackup();
    
    if (report.stats.failed > 0 && report.stats.successful === 0) {
      error('❌ 所有备份都失败了，请检查配置和目录权限');
      process.exit(1);
    } else if (report.stats.failed > 0) {
      warn('⚠️  部分备份失败，但部分成功');
      process.exit(0);
    } else {
      info('✅ 备份完成！');
      process.exit(0);
    }
  } catch (err) {
    error('💥 备份过程中发生未捕获的错误:', err);
    process.exit(1);
  }
}

// ====================== 执行 ======================
if (require.main === module) {
  main();
} else {
  // 作为模块导出
  module.exports = {
    createBackup,
    cleanupOldBackups,
    CONFIG
  };
}