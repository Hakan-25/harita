/* ========================================
   ERZURUM HARİTA - CLIENT APP
   Otomatik konum paylaşımı
   ======================================== */

(function () {
  'use strict';

  // ============ YAPILANDIRMA ============
  const ERZURUM_CENTER = [39.9043, 41.2679];
  const DEFAULT_ZOOM = 13;
  const LOCATION_UPDATE_INTERVAL = 3000;

  const MAP_LAYERS = {
    standard: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      name: 'Standart'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar',
      name: 'Uydu'
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      name: 'Arazi'
    }
  };

  // ============ DURUM ============
  let map = null;
  let socket = null;
  let currentTileLayer = null;
  let myId = null;
  let myName = '';
  let myColor = '';
  let myLat = null;
  let myLng = null;
  let myAccuracy = null;
  let myMarker = null;
  let myAccuracyCircle = null;
  let markers = {};
  let accuracyCircles = {};
  let usersData = {};
  let firstLocationReceived = false;

  // ============ DOM ELEMENTLERİ ============
  const connectionStatus = document.getElementById('connection-status');
  const countText = document.querySelector('.count-text');
  const userCard = document.getElementById('user-card');
  const userNameEl = document.getElementById('user-name');
  const userCoordsEl = document.getElementById('user-coords');
  const editNameBtn = document.getElementById('edit-name-btn');
  const nameModal = document.getElementById('name-modal');
  const nameInput = document.getElementById('name-input');
  const nameSave = document.getElementById('name-save');
  const nameCancel = document.getElementById('name-cancel');
  const usersToggle = document.getElementById('users-toggle');
  const usersPanel = document.getElementById('users-panel');
  const closePanel = document.getElementById('close-panel');
  const usersList = document.getElementById('users-list');
  const centerMe = document.getElementById('center-me');
  const fitAll = document.getElementById('fit-all');
  const toastContainer = document.getElementById('toast-container');
  const welcomeOverlay = document.getElementById('welcome-overlay');
  const welcomeNameInput = document.getElementById('welcome-name-input');
  const welcomeStart = document.getElementById('welcome-start');

  // ============ HARİTA BAŞLATMA ============
  function initMap() {
    map = L.map('map', {
      center: ERZURUM_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true
    });

    setMapLayer('standard');
    map.zoomControl.setPosition('topleft');
    addLayerSwitcher();
  }

  function setMapLayer(layerKey) {
    const layer = MAP_LAYERS[layerKey];
    if (!layer) return;
    if (currentTileLayer) map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
      subdomains: 'abc'
    }).addTo(map);
  }

  function addLayerSwitcher() {
    const LayerControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'layer-switcher');
        container.innerHTML = `
          <button class="layer-btn active" data-layer="standard" title="Standart Harita">🗺️</button>
          <button class="layer-btn" data-layer="satellite" title="Uydu Görünümü">🛰️</button>
          <button class="layer-btn" data-layer="topo" title="Arazi">⛰️</button>
        `;
        L.DomEvent.disableClickPropagation(container);
        container.querySelectorAll('.layer-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            setMapLayer(e.currentTarget.dataset.layer);
            container.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
          });
        });
        return container;
      }
    });
    new LayerControl().addTo(map);
  }

  // ============ CUSTOM MARKER ============
  function createLabelMarker(name, color, isMe) {
    const meClass = isMe ? 'marker-me' : '';
    const label = isMe ? name + ' (Ben)' : name;
    return L.divIcon({
      html: `
        <div class="custom-marker ${meClass}">
          <div class="marker-label">${label}</div>
          <div class="marker-pulse" style="color: ${color};"></div>
          <div class="marker-dot" style="background: ${color}; color: ${color};"></div>
        </div>
      `,
      className: 'custom-marker-wrapper',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -30]
    });
  }

  // ============ SOCKET.IO BAĞLANTISI ============
  function initSocket() {
    socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });

    socket.on('connect', () => {
      connectionStatus.textContent = 'Bağlandı ✓';
      connectionStatus.style.color = '#82E0AA';
    });

    socket.on('disconnect', () => {
      connectionStatus.textContent = 'Bağlantı kesildi...';
      connectionStatus.style.color = '#FF6B6B';
    });

    socket.on('reconnect', () => {
      connectionStatus.textContent = 'Bağlandı ✓';
      connectionStatus.style.color = '#82E0AA';
      // Yeniden bağlanınca mevcut konumu hemen gönder
      sendLocation();
    });

    // Hoş geldin - sunucu rastgele isim verir, biz kaydedilmiş isimle değiştiririz
    socket.on('welcome', (data) => {
      myId = data.id;
      myColor = data.color;

      // localStorage'dan kaydedilmiş ismi al
      const savedName = localStorage.getItem('erzurum-harita-name');
      if (savedName) {
        myName = savedName;
        socket.emit('change-name', savedName);
      } else {
        myName = data.name;
      }

      userNameEl.textContent = myName;
      userCard.classList.remove('hidden');
    });

    // Mevcut kullanıcıları al
    socket.on('users-list', (users) => {
      users.forEach(u => {
        if (u.id !== myId && u.lat && u.lng) updateUserMarker(u);
      });
      updateUserCount();
    });

    // Konum güncellemesi
    socket.on('location-broadcast', (data) => {
      if (data.id === myId) return;
      updateUserMarker(data);
      updateUserCount();
      updateUsersList();
    });

    // Yeni kullanıcı
    socket.on('user-joined', (data) => {
      showToast(`👤 ${data.name} bağlandı`);
      updateUserCount();
    });

    // Kullanıcı ayrıldı
    socket.on('user-left', (data) => {
      removeUserMarker(data.id);
      delete usersData[data.id];
      showToast(`👋 ${data.name} ayrıldı`);
      updateUserCount();
      updateUsersList();
    });

    // İsim değişti
    socket.on('name-changed', (data) => {
      if (data.id === myId) {
        myName = data.newName;
        userNameEl.textContent = myName;
        if (myMarker) myMarker.setIcon(createLabelMarker(myName, myColor, true));
      } else {
        if (usersData[data.id]) {
          usersData[data.id].name = data.newName;
          if (markers[data.id]) markers[data.id].setIcon(createLabelMarker(data.newName, usersData[data.id].color, false));
        }
      }
      updateUsersList();
    });
  }

  // ============ KULLANICI MARKER YÖNETİMİ ============
  function updateUserMarker(data) {
    usersData[data.id] = data;

    if (markers[data.id]) {
      markers[data.id].setLatLng([data.lat, data.lng]);
      markers[data.id].setIcon(createLabelMarker(data.name, data.color, false));
      if (accuracyCircles[data.id]) {
        accuracyCircles[data.id].setLatLng([data.lat, data.lng]);
        if (data.accuracy) accuracyCircles[data.id].setRadius(data.accuracy);
      }
    } else {
      markers[data.id] = L.marker([data.lat, data.lng], {
        icon: createLabelMarker(data.name, data.color, false),
        zIndexOffset: 100
      }).addTo(map);

      if (data.accuracy) {
        accuracyCircles[data.id] = L.circle([data.lat, data.lng], {
          radius: data.accuracy, color: data.color, fillColor: data.color,
          fillOpacity: 0.08, weight: 1, opacity: 0.3
        }).addTo(map);
      }
    }
  }

  function removeUserMarker(userId) {
    if (markers[userId]) { map.removeLayer(markers[userId]); delete markers[userId]; }
    if (accuracyCircles[userId]) { map.removeLayer(accuracyCircles[userId]); delete accuracyCircles[userId]; }
  }

  // ============ OTOMATİK KONUM TAKİBİ ============
  // Maksimum hassasiyet için optimizasyon
  let bestAccuracy = Infinity;

  function startAutoLocation() {
    if (!navigator.geolocation) {
      userCoordsEl.textContent = 'Cihaz konum desteklemiyor';
      showToast('❌ Bu cihaz konum özelliğini desteklemiyor');
      return;
    }

    // Yüksek hassasiyetli konum izleme
    navigator.geolocation.watchPosition(
      (position) => {
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        const newAccuracy = position.coords.accuracy;

        // Daha iyi doğruluk geldiğinde veya her zaman güncelle
        // (GPS zamanla daha iyi sonuç verir)
        myLat = newLat;
        myLng = newLng;
        myAccuracy = newAccuracy;

        if (newAccuracy < bestAccuracy) {
          bestAccuracy = newAccuracy;
        }

        userCoordsEl.textContent = `${myLat.toFixed(6)}, ${myLng.toFixed(6)} (±${Math.round(myAccuracy)}m)`;

        updateMyMarker();
        sendLocation();

        // İlk konumda haritayı oraya götür
        if (!firstLocationReceived) {
          firstLocationReceived = true;
          map.setView([myLat, myLng], 17, { animate: true });
        }
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            userCoordsEl.textContent = 'Konum izni reddedildi';
            showToast('⚠️ Konum izni gerekli - tarayıcı ayarlarından izin verin');
            break;
          case error.POSITION_UNAVAILABLE:
            userCoordsEl.textContent = 'Konum alınamıyor';
            break;
          case error.TIMEOUT:
            userCoordsEl.textContent = 'Konum zaman aşımı - tekrar deneniyor...';
            // Timeout olursa tekrar dene
            setTimeout(startAutoLocation, 3000);
            break;
        }
      },
      {
        enableHighAccuracy: true,  // GPS kullan (WiFi değil)
        maximumAge: 0,             // Her zaman taze konum al, cache kullanma
        timeout: 30000             // 30 saniye bekle (GPS uyduları için süre)
      }
    );

    // Düzenli aralıklarla sunucuya gönder
    setInterval(() => {
      if (myLat !== null && myLng !== null) sendLocation();
    }, LOCATION_UPDATE_INTERVAL);
  }


  function updateMyMarker() {
    if (myLat === null || myLng === null) return;

    if (myMarker) {
      myMarker.setLatLng([myLat, myLng]);
      myMarker.setIcon(createLabelMarker(myName, myColor, true));
    } else {
      myMarker = L.marker([myLat, myLng], {
        icon: createLabelMarker(myName, myColor, true),
        zIndexOffset: 1000
      }).addTo(map);
    }

    if (myAccuracy) {
      if (myAccuracyCircle) {
        myAccuracyCircle.setLatLng([myLat, myLng]);
        myAccuracyCircle.setRadius(myAccuracy);
      } else {
        myAccuracyCircle = L.circle([myLat, myLng], {
          radius: myAccuracy, color: myColor, fillColor: myColor,
          fillOpacity: 0.08, weight: 1, opacity: 0.3
        }).addTo(map);
      }
    }
  }

  function sendLocation() {
    if (socket && socket.connected && myLat !== null && myLng !== null) {
      socket.emit('location-update', { lat: myLat, lng: myLng, accuracy: myAccuracy });
    }
  }

  // ============ MESAFE HESAPLAMA ============
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(m) {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  }

  // ============ UI GÜNCELLEMELERİ ============
  function updateUserCount() {
    countText.textContent = Object.keys(usersData).length + 1;
  }

  function updateUsersList() {
    let html = `
      <div class="user-list-item is-me" onclick="centerOnUser('me')">
        <div class="user-list-dot" style="background: ${myColor};"></div>
        <div class="user-list-info">
          <div class="user-list-name">${myName}</div>
          <div class="user-list-distance">Benim konumum</div>
        </div>
        <span class="user-list-me-tag">BEN</span>
      </div>
    `;

    for (const [id, user] of Object.entries(usersData)) {
      let dist = 'Konum bekleniyor';
      if (myLat !== null && user.lat !== null) {
        dist = formatDistance(calculateDistance(myLat, myLng, user.lat, user.lng)) + ' uzaklıkta';
      }
      html += `
        <div class="user-list-item" onclick="centerOnUser('${id}')">
          <div class="user-list-dot" style="background: ${user.color};"></div>
          <div class="user-list-info">
            <div class="user-list-name">${user.name}</div>
            <div class="user-list-distance">${dist}</div>
          </div>
        </div>
      `;
    }
    usersList.innerHTML = html;
  }

  window.centerOnUser = function (id) {
    if (id === 'me' && myLat) map.setView([myLat, myLng], 16, { animate: true });
    else if (usersData[id]) map.setView([usersData[id].lat, usersData[id].lng], 16, { animate: true });
  };

  // ============ TOAST ============
  function showToast(msg, duration = 3000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, duration);
  }

  // ============ OLAY DİNLEYİCİLER ============
  function initEvents() {
    centerMe.addEventListener('click', () => {
      if (myLat) map.setView([myLat, myLng], 16, { animate: true });
    });

    fitAll.addEventListener('click', () => {
      const pts = [];
      if (myLat) pts.push([myLat, myLng]);
      Object.values(usersData).forEach(u => { if (u.lat) pts.push([u.lat, u.lng]); });
      if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 });
    });

    usersToggle.addEventListener('click', () => { usersPanel.classList.toggle('hidden'); updateUsersList(); });
    closePanel.addEventListener('click', () => usersPanel.classList.add('hidden'));

    editNameBtn.addEventListener('click', () => {
      nameInput.value = myName;
      nameModal.classList.remove('hidden');
      setTimeout(() => nameInput.focus(), 100);
    });

    nameSave.addEventListener('click', () => {
      const n = nameInput.value.trim();
      if (n) { socket.emit('change-name', n); nameModal.classList.add('hidden'); }
    });

    nameCancel.addEventListener('click', () => nameModal.classList.add('hidden'));
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameSave.click();
      if (e.key === 'Escape') nameCancel.click();
    });

    document.querySelector('.modal-backdrop')?.addEventListener('click', () => nameModal.classList.add('hidden'));
    map.on('click', () => usersPanel.classList.add('hidden'));
  }

  // ============ PWA ============
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // ============ İSİM GİRİŞ EKRANI ============
  function initWelcome() {
    const savedName = localStorage.getItem('erzurum-harita-name');

    if (savedName) {
      // İsim zaten kayıtlı, direkt başla
      welcomeOverlay.classList.add('hidden');
      startApp();
    } else {
      // İsim giriş ekranını göster
      welcomeOverlay.classList.remove('hidden');

      welcomeNameInput.addEventListener('input', () => {
        const val = welcomeNameInput.value.trim();
        welcomeStart.disabled = val.length === 0;
      });

      welcomeStart.addEventListener('click', () => {
        const name = welcomeNameInput.value.trim();
        if (name) {
          localStorage.setItem('erzurum-harita-name', name);
          welcomeOverlay.classList.add('hidden');
          startApp();
        }
      });

      welcomeNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !welcomeStart.disabled) {
          welcomeStart.click();
        }
      });

      // Input'a otomatik focus
      setTimeout(() => welcomeNameInput.focus(), 300);
    }
  }

  function startApp() {
    initMap();
    initSocket();
    initEvents();
    startAutoLocation();
    registerSW();

    // İsim değiştirme'de localStorage'ı da güncelle
    const origNameSave = nameSave.onclick;
    nameSave.addEventListener('click', () => {
      const n = nameInput.value.trim();
      if (n) localStorage.setItem('erzurum-harita-name', n);
    });
  }

  // ============ BAŞLAT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcome);
  } else {
    initWelcome();
  }

})();
