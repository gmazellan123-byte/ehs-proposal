// 앱 설치(홈 화면 추가)용 서비스 워커 — 캐시하지 않고 항상 최신 화면을 네트워크에서 받아옴
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center">' +
      '<h3>인터넷 연결을 확인해 주세요</h3><p>연결된 뒤 다시 열면 정상적으로 표시됩니다.</p></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});
