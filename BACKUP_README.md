# 🗃️ XinWeb 3D 平台 - 备份系统使用指南

## 📋 概述

本备份系统为 XinWeb 3D 平台提供自动化的文件备份功能，保护用户上传的文件（3D模型、图片等）免受意外丢失。

## 🚀 快速开始

### 1. 运行备份脚本
```bash
cd D:\xinweb
node backup.js
```

### 2. 测试备份是否正常工作
```bash
# 模拟运行（不实际复制文件）
node backup.js --dry-run

# 正常运行
node backup.js
```
如果看到类似以下输出，说明备份成功：
```
==================================================
🦞 XinWeb 3D 平台 - 智能备份系统
==================================================
[2026-03-25 09:30:00] [INFO] 🚀 开始备份流程
[2026-03-25 09:30:00] [INFO] 配置: 保留7天, 备份目录: ./backups
...
✅ 备份完成！
```

## ⚙️ 配置说明

备份配置存储在 `.env` 文件中：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `BACKUP_ENABLED` | `true` | 是否启用备份功能 |
| `BACKUP_DIR` | `./backups` | 备份存储目录（相对于项目根目录） |
| `BACKUP_RETENTION_DAYS` | `7` | 保留多少天的备份 |
| `BACKUP_SOURCES` | `uploads,images,stl` | 需要备份的目录（逗号分隔） |
| `BACKUP_LOG_LEVEL` | `info` | 日志级别：debug, info, warn, error |

### 添加新的备份目录
如果要备份其他目录，修改 `.env` 中的 `BACKUP_SOURCES`：
```env
BACKUP_SOURCES=uploads,images,stl,textures,fonts
```

## 🔄 自动定时备份

### Windows（任务计划程序）
1. 按 `Win+R`，输入 `taskschd.msc`
2. 点击"创建基本任务"
3. 按向导设置：
   - 名称：`XinWeb 自动备份`
   - 触发器：每天，时间：02:00（凌晨）
   - 操作：启动程序
     - 程序或脚本：`node`
     - 添加参数：`backup.js`
     - 起始于：`D:\xinweb`
4. 完成

### Linux/Mac（crontab）
```bash
# 编辑 crontab
crontab -e

# 添加以下行（每天凌晨2点运行）
0 2 * * * cd /path/to/xinweb && node backup.js >> backup.log 2>&1
```

## 📁 备份目录结构

备份按日期和时间组织：
```
backups/
├── backup_2026-03-25_2026-03-25T09-30-00/
│   ├── uploads/          # 用户上传的文件
│   ├── images/           # 产品图片
│   ├── stl/              # 3D模型文件
│   └── BACKUP_MANIFEST.json  # 备份清单（包含详细信息）
├── backup_2026-03-24_.../
└── ...
```

## 🔍 备份清单（MANIFEST）

每个备份目录包含 `BACKUP_MANIFEST.json`，记录：
- 备份时间、耗时
- 备份的目录和状态
- 成功/失败统计
- 错误信息（如果有）

## ♻️ 恢复备份

### 恢复单个目录
```bash
# 复制备份文件到原始位置
# Windows
xcopy /E "backups\backup_2026-03-25_...\uploads" "uploads"

# Linux/Mac
cp -r backups/backup_2026-03-25_.../uploads/. uploads/
```

### 完整恢复
1. 停止服务器（如果正在运行）
2. 删除或重命名损坏的目录
3. 从最新的备份复制所有目录
4. 重新启动服务器

## 🚨 故障排除

### 常见问题

1. **备份失败：权限不足**
   ```
   [ERROR] 复制失败: uploads -> backups/.../uploads
   ```
   **解决**：以管理员身份运行，或检查目录权限

2. **目录不存在被跳过**
   ```
   [WARN] 跳过不存在的目录: uploads
   ```
   **解决**：如果目录确实不需要，忽略此警告；如果需要，创建该目录

3. **备份文件太大**
   **解决**：考虑排除某些大文件类型，或增加磁盘空间

4. **Windows robocopy 错误**
   **解决**：脚本自动处理 robocopy 的警告性错误（退出码1）

### 日志级别
如需详细日志，修改 `.env`：
```env
BACKUP_LOG_LEVEL=debug
```

## 📊 监控建议

### 检查备份状态
```bash
# 查看最近的备份
dir backups /O-D

# 查看备份清单
type backups\最新备份目录\BACKUP_MANIFEST.json
```

### 设置监控（阿里云）
1. 监控 `backups/` 目录大小
2. 设置磁盘空间告警
3. 定期检查备份日志

## 🔧 高级配置（可选）

### 备份到远程存储
未来版本计划支持：
- 阿里云 OSS
- 腾讯云 COS
- AWS S3

### 备份压缩
启用压缩以减少存储空间（当前版本暂不支持）

### 增量备份
仅备份变化的文件（未来版本）

## 📞 技术支持

如有问题：
1. 检查 `backup.js` 的日志输出
2. 查看 `BACKUP_MANIFEST.json` 中的详细错误
3. 确保 `.env` 配置正确
4. 检查磁盘空间和目录权限

> **注意**：定期验证备份的可恢复性，确保在需要时能够成功恢复数据。