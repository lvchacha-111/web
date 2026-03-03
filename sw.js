// 1. 每次你更新了代码（比如改了 index.html 或 auth.js），就把这个 v1 改成 v2, v3...
const CACHE_NAME = 'yijiao-cache-v3'; 

const assets = [
  '/',
  'index.html',
  'detail.html',   // 建议加上详情页
  'auth.js',       // 必须加上你的保安系统
  'logo.png',
  'favicon.ico'    // 加上图标
];

// 安装阶段：存入基础文件
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 🚀 如果请求的是 Supabase 的云端数据，直接放行 (Network Only)
    // 这样能避免跨域问题，也能保证数据永远是最新的
    if (url.hostname.includes('supabase.co')) {
        return; // 直接退出，让浏览器用默认方式去联网
    }

    // 🚀 其他本地文件 (html, css, js)，走缓存策略 (Network First)
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
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