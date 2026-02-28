// 缓存名称
const CACHE_NAME = 'my-3d-app-v1';

// 你希望在没网时也能访问的基础文件
const assets = [
  '/',
  'index.html',
  'logo.png',
  'three.min.js',
  'OrbitControls.js',
  'STLLoader.js'
];

// 安装阶段：把基础文件存进手机缓存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

// 运行阶段：如果没网，就从缓存里读文件
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});