/**
 * Yi Jiao Design Service Worker - V4
 * 特性：核心预缓存 + 动态资源捕获 + 智能降级策略
 */

const CACHE_NAME = 'yijiao-v4-stable';

// 1. 预缓存清单（应用运行必须的基础骨架）
const PRE_CACHE_ASSETS = [
  '/',
  '/index.html',
  '/freewriting.html',
  '/auth.js',
  '/logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js'
];

// 2. 安装阶段：立即接管并预存基础资源
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 正在注入核心骨架...');
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
});

// 3. 激活阶段：清理旧版本，确保单版本运行
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] 清理过时缓存:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // 立即控制所有页面
  );
});

// 4. 核心拦截策略：网络优先 + 动态捕获
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 策略 A：排除统计脚本和不必要的第三方请求
  if (url.hostname.includes('google-analytics') || 
      url.hostname.includes('googletagmanager') || 
      url.pathname.includes('collect')) {
    return; // 直接跳过，不介入拦截
  }

  // 策略 B：针对 3D 贴图和 HDR（这些资源很大，且不常更新，采用缓存优先）
  const isLargeAsset = url.pathname.match(/\.(jpg|jpeg|png|hdr|json|woff2)$/i);

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      
      // 如果是大型资源且缓存里有，直接给，极速加载
      if (isLargeAsset && cachedResponse) {
        return cachedResponse;
      }

      // 否则发起网络请求
      return fetch(event.request).then(networkResponse => {
        // 检查是否是有效的响应，防止存入错误页面
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          // 如果是第三方资源（如 CDN 的 Three.js），type 为 opaque，单独处理
          if (networkResponse.type === 'cors' || networkResponse.type === 'opaque') {
             // 允许缓存来自 CDN 的资源
             updateCache(event.request, networkResponse.clone());
             return networkResponse;
          }
          return networkResponse;
        }

        // 动态缓存：把用户这次访问到的新东西（比如新字体、新贴图）偷偷存起来
        updateCache(event.request, networkResponse.clone());

        return networkResponse;
      }).catch(() => {
        // 网络失败后的兜底逻辑
        if (cachedResponse) return cachedResponse;
        
        // 最后的防崩补丁：如果完全没网也没缓存，返回一个空的透明像素或提示
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html'); // 没网时跳转首页
        }
        
        return new Response('Resource Offline', { status: 404, statusText: 'Offline' });
      });
    })
  );
});

// 辅助函数：异步更新缓存
function updateCache(request, response) {
  // 只缓存 GET 请求，不缓存 POST
  if (request.method !== 'GET') return;
  
  caches.open(CACHE_NAME).then(cache => {
    cache.put(request, response);
  });
}