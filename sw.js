// 1. 每次你更新了代码（比如改了 index.html 或 auth.js），就把这个 v1 改成 v2, v3...
const CACHE_NAME = 'yijiao-cache-v2'; 

const assets = [
  '/',
  'index.html',
  'detail.html',   // 建议加上详情页
  'auth.js',       // 必须加上你的保安系统
  'logo.png',
  'favicon.ico'    // 加上图标
];

// 安装阶段：存入基础文件
self.addEventListener('install', event => {
  self.skipWaiting(); // 强制让新版本立刻接管，不要等旧页面关闭
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// 激活阶段：清理旧版本的缓存（非常重要！）
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 运行阶段：采用“网络优先，失败后读缓存”策略
self.addEventListener('fetch', event => {
  event.respondWith(
    // 每次都先尝试去网上抓最新的
    fetch(event.request).catch(() => {
      // 如果没网（fetch报错），再去缓存里找
      return caches.match(event.request);
    })
  );
});