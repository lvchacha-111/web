#!/bin/bash

# XinWeb 3D 平台 - 阿里云部署脚本
# 用法: ./deploy.sh [环境]
#   环境: prod (默认) 或 staging

set -e  # 遇到错误退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "命令 $1 不存在，请先安装"
        exit 1
    fi
}

# 主函数
main() {
    local ENV=${1:-prod}
    local APP_NAME="xinweb-3d"
    local APP_DIR=$(pwd)
    local USER=$(whoami)
    
    print_info "🚀 开始部署 XinWeb 3D 平台 ($ENV 环境)"
    print_info "应用目录: $APP_DIR"
    print_info "当前用户: $USER"
    print_info "时间: $(date)"
    
    # ====================== 环境检查 ======================
    print_info "1. 检查系统环境..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js v18+"
        print_info "安装命令（Ubuntu）:"
        echo "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "sudo apt install -y nodejs"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    print_info "Node.js 版本: v$NODE_VERSION"
    
    # 检查 npm
    check_command npm
    
    # 检查 PM2（如果未安装，尝试安装）
    if ! command -v pm2 &> /dev/null; then
        print_warn "PM2 未安装，尝试全局安装..."
        npm install -g pm2
        if ! command -v pm2 &> /dev/null; then
            print_error "PM2 安装失败，请手动安装: npm install -g pm2"
            exit 1
        fi
    fi
    
    PM2_VERSION=$(pm2 --version 2>/dev/null || echo "未知")
    print_info "PM2 版本: $PM2_VERSION"
    
    # ====================== 应用准备 ======================
    print_info "2. 准备应用..."
    
    # 检查 .env 文件
    if [ ! -f ".env" ]; then
        print_warn ".env 文件不存在，创建示例配置..."
        cat > .env.example << 'EOF'
# ====================== 服务器配置 ======================
PORT=5000
ADMIN_PORT=3000

# ====================== 管理后台 ======================
ADMIN_USER=admin
ADMIN_PASSWORD=请设置强密码_这里修改

# ====================== 备份配置 ======================
BACKUP_ENABLED=true
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7
BACKUP_SOURCES=uploads,images,stl
BACKUP_LOG_LEVEL=info

# ====================== 其他配置 ======================
SECRET_KEY=生成一个随机字符串作为密钥
EOF
        print_error "请先创建 .env 文件并配置参数"
        print_info "示例: cp .env.example .env && nano .env"
        exit 1
    fi
    
    # 检查备份目录是否存在
    if [ ! -d "backups" ]; then
        mkdir -p backups
        print_info "创建备份目录: backups/"
    fi
    
    # 检查上传目录权限
    for dir in uploads images stl; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_info "创建目录: $dir/"
        fi
        # 设置目录权限（如果可能）
        if [ "$USER" != "root" ]; then
            chmod 755 "$dir" 2>/dev/null || true
        fi
    done
    
    # ====================== 安装依赖 ======================
    print_info "3. 安装依赖..."
    
    # 清理 node_modules（可选）
    if [ "$ENV" = "prod" ] && [ -d "node_modules" ]; then
        print_warn "清理旧的 node_modules..."
        rm -rf node_modules
    fi
    
    # 安装生产依赖
    print_info "安装 npm 包..."
    npm install --production
    
    if [ $? -ne 0 ]; then
        print_error "npm install 失败"
        exit 1
    fi
    
    # ====================== PM2 进程管理 ======================
    print_info "4. 配置 PM2..."
    
    # 停止现有进程（如果存在）
    if pm2 list | grep -q "$APP_NAME"; then
        print_info "停止现有进程..."
        pm2 stop "$APP_NAME" 2>/dev/null || true
        pm2 delete "$APP_NAME" 2>/dev/null || true
    fi
    
    if pm2 list | grep -q "$APP_NAME-admin"; then
        print_info "停止现有管理后台进程..."
        pm2 stop "$APP_NAME-admin" 2>/dev/null || true
        pm2 delete "$APP_NAME-admin" 2>/dev/null || true
    fi
    
    # 创建 PM2 配置文件
    cat > pm2.config.js << EOF
module.exports = {
  apps: [
    {
      name: "$APP_NAME",
      script: "server.js",
      cwd: "$APP_DIR",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "$ENV"
      },
      error_file: "\$HOME/.pm2/logs/$APP_NAME-error.log",
      out_file: "\$HOME/.pm2/logs/$APP_NAME-out.log",
      log_file: "\$HOME/.pm2/logs/$APP_NAME-combined.log",
      time: true
    },
    {
      name: "$APP_NAME-admin",
      script: "admin.js",
      cwd: "$APP_DIR",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "$ENV"
      },
      error_file: "\$HOME/.pm2/logs/$APP_NAME-admin-error.log",
      out_file: "\$HOME/.pm2/logs/$APP_NAME-admin-out.log",
      log_file: "\$HOME/.pm2/logs/$APP_NAME-admin-combined.log",
      time: true
    }
  ]
};
EOF
    
    print_info "启动应用..."
    pm2 start pm2.config.js
    
    # ====================== PM2 开机自启 ======================
    print_info "5. 配置开机自启..."
    
    # 保存 PM2 配置
    pm2 save
    
    # 设置开机自启
    if [ "$USER" = "root" ]; then
        pm2 startup systemd -u root --hp /root
    else
        print_info "请手动运行以下命令设置开机自启:"
        echo "  pm2 startup"
        echo "  sudo env PATH=\$PATH:\$HOME/.nvm/versions/node/v\$NODE_VERSION/bin \$HOME/.nvm/versions/node/v\$NODE_VERSION/lib/node_modules/pm2/bin/pm2 startup systemd -u \$USER --hp \$HOME"
    fi
    
    # ====================== 状态检查 ======================
    print_info "6. 检查服务状态..."
    
    sleep 2  # 等待进程启动
    
    echo ""
    pm2 status
    
    # 检查端口监听
    print_info "检查端口监听..."
    if ss -tulpn 2>/dev/null | grep -q ":5000"; then
        print_info "✅ 主服务端口 5000 正在监听"
    elif netstat -tulpn 2>/dev/null | grep -q ":5000"; then
        print_info "✅ 主服务端口 5000 正在监听"
    else
        print_warn "⚠️  端口 5000 未监听，可能服务启动失败"
    fi
    
    if ss -tulpn 2>/dev/null | grep -q ":3000"; then
        print_info "✅ 管理后台端口 3000 正在监听"
    elif netstat -tulpn 2>/dev/null | grep -q ":3000"; then
        print_info "✅ 管理后台端口 3000 正在监听"
    else
        print_warn "⚠️  端口 3000 未监听，可能服务启动失败"
    fi
    
    # ====================== 部署完成 ======================
    print_info "7. 部署完成！"
    
    IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
    if [ "$IP_ADDR" = "127.0.0.1" ]; then
        IP_ADDR=$(curl -s ifconfig.me 2>/dev/null || echo "你的服务器IP")
    fi
    
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    print_info "🌐 访问地址:"
    echo "  主网站:  http://$IP_ADDR:5000"
    echo "  管理后台: http://$IP_ADDR:3000"
    echo "  （管理后台需要用户名密码，请查看 .env 文件）"
    echo ""
    print_info "📊 管理命令:"
    echo "  查看状态:  pm2 status"
    echo "  查看日志:  pm2 logs $APP_NAME"
    echo "  重启应用:  pm2 restart $APP_NAME"
    echo "  停止应用:  pm2 stop $APP_NAME"
    echo "  备份数据:  npm run backup"
    echo ""
    print_info "📁 重要目录:"
    echo "  应用目录:  $APP_DIR"
    echo "  备份目录:  $APP_DIR/backups/"
    echo "  日志目录:  ~/.pm2/logs/"
    echo "  上传目录:  $APP_DIR/uploads/"
    echo ""
    print_info "🔧 后续配置建议:"
    echo "  1. 配置防火墙 (开放 80, 443, 5000 端口)"
    echo "  2. 配置域名和 Nginx 反向代理"
    echo "  3. 配置 SSL 证书 (HTTPS)"
    echo "  4. 设置定时备份任务"
    echo "════════════════════════════════════════════════════════════════"
    
    # 生成健康检查脚本
    cat > health-check.sh << 'EOF'
#!/bin/bash
echo "🩺 XinWeb 健康检查 - $(date)"
echo ""
echo "1. PM2 进程状态:"
pm2 list | grep -A5 xinweb
echo ""
echo "2. 端口监听状态:"
ss -tulpn 2>/dev/null | grep -E ":5000|:3000" || netstat -tulpn 2>/dev/null | grep -E ":5000|:3000" || echo "未找到监听信息"
echo ""
echo "3. 最近日志 (主服务):"
tail -n 10 ~/.pm2/logs/xinweb-3d-out.log 2>/dev/null || echo "日志文件不存在"
echo ""
echo "4. 磁盘空间:"
df -h . | tail -1
echo ""
echo "5. 备份目录状态:"
ls -la backups/ 2>/dev/null | head -5
echo ""
EOF
    
    chmod +x health-check.sh
    print_info "健康检查脚本已生成: ./health-check.sh"
}

# 显示帮助
show_help() {
    echo "XinWeb 3D 平台部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  prod          生产环境部署 (默认)"
    echo "  staging       测试环境部署"
    echo "  --help, -h    显示此帮助"
    echo ""
    echo "示例:"
    echo "  $0            生产环境部署"
    echo "  $0 staging    测试环境部署"
    echo ""
}

# 参数解析
case "$1" in
    --help|-h)
        show_help
        exit 0
        ;;
    prod|"")
        main "prod"
        ;;
    staging)
        main "staging"
        ;;
    *)
        print_error "未知参数: $1"
        show_help
        exit 1
        ;;
esac