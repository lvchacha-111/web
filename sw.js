/**
 * Yi Jiao Design Service Worker - V5
 * 稳定特性：高清贴图分流加载 + 内存保护 + 零报错兜底
 */

const CACHE_NAME = 'yijiao-v5-pro';

// 1. 核心骨架（必须在线/预存才能运行的文件）
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/freewriting.html',
  '/auth.js',
  '/logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js'
];

// 安装：预存核心资源
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

// 激活：彻底清理旧缓存，释放空间
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME && caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// 核心拦截逻辑
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 策略 0：忽略所有统计和非 GET 请求（防止报错的关键）
  if (url.hostname.includes('google-analytics') || 
      url.hostname.includes('googletagmanager') || 
      event.request.method !== 'GET') {
    return; 
  }

  // 策略 1：针对 3D 重型资源（2K贴图、HDR、字体）
  const isHeavyAsset = url.pathname.match(/\.(jpg|jpeg|png|hdr|json|woff2)$/i);

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      
      // 如果是重型贴图且缓存里有，立即返回，不再联网（解决空响应报错）
      if (isHeavyAsset && cachedResponse) {
        return cachedResponse;
      }

      // 否则发起请求，并采用高级错误处理
      return fetch(event.request).then(networkResponse => {
        // 只有正常的响应才放入缓存
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => {
        // 联网失败后的最终保底
        if (cachedResponse) return cachedResponse;
        
        // 如果是 HTML 页面没网也没缓存，返回基础页面
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/freewriting.html');
        }

        // 最终返回一个合法的空 Response，彻底根治 Uncaught TypeError
        return new Response('Network Error', { 
          status: 408, 
          headers: { 'Content-Type': 'text/plain' } 
        });
      });
    })
  );
});












