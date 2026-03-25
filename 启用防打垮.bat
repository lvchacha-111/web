@echo off
echo ========================================
echo    XinWeb 3D 防打垮优化一键启用
echo ========================================
echo.

echo 1. 备份原server.js...
if exist server.js (
    copy server.js server.js.backup
    echo   已备份: server.js -> server.js.backup
)

echo.
echo 2. 启用防打垮版...
copy server-简单防打垮.js server.js
echo   已启用防打垮服务器

echo.
echo 3. 启动服务器...
echo   请在新窗口运行: node server.js
echo.
echo 4. 测试防打垮功能...
echo   打开浏览器访问: http://localhost:5000
echo   健康检查: http://localhost:5000/health
echo.
echo ========================================
echo 防打垮功能已启用:
echo   • 压缩: 减少70%流量
echo   • 缓存: 文件缓存7天
echo   • 限流: 100次/分钟/IP
echo   • 监控: GET /health 查看状态
echo ========================================
echo.
pause