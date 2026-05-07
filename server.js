const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const localtunnel = require('localtunnel');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;

// Statik dosyaları sun
app.use(express.static('public'));

// localtunnel bazen bir onay sayfası gösterir, bu bypass header'ı ile atlayabiliriz
app.use((req, res, next) => {
  res.setHeader('Bypass-Tunnel-Reminder', 'true');
  next();
});

// Bağlı kullanıcıların konumlarını tut
const users = new Map();

// Rastgele renk üret
function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
    '#F1948A', '#AED6F1', '#D7BDE2', '#A3E4D7'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Rastgele hayvan ismi üret
function getRandomName() {
  const animals = [
    'Kurt', 'Kartal', 'Ayı', 'Geyik', 'Tilki',
    'Şahin', 'Kaplan', 'Aslan', 'Pars', 'Atmaca',
    'Doğan', 'Tavşan', 'Karga', 'Baykuş', 'Çakal'
  ];
  const adjectives = [
    'Hızlı', 'Güçlü', 'Cesur', 'Yiğit', 'Korkusuz',
    'Çevik', 'Akıllı', 'Gizli', 'Yalnız', 'Vahşi'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

io.on('connection', (socket) => {
  const user = {
    id: socket.id,
    name: getRandomName(),
    color: getRandomColor(),
    lat: null,
    lng: null,
    lastUpdate: null
  };

  users.set(socket.id, user);
  console.log(`✅ ${user.name} bağlandı (${socket.id}) | Toplam: ${users.size} kullanıcı`);

  // Kullanıcıya kendi bilgilerini gönder
  socket.emit('welcome', {
    id: user.id,
    name: user.name,
    color: user.color
  });

  // Mevcut kullanıcı listesini gönder
  socket.emit('users-list', Array.from(users.values()).filter(u => u.lat !== null));

  // Yeni kullanıcıyı diğerlerine bildir
  socket.broadcast.emit('user-joined', { id: user.id, name: user.name, color: user.color });

  // Konum güncellemesi
  socket.on('location-update', (data) => {
    const u = users.get(socket.id);
    if (u) {
      u.lat = data.lat;
      u.lng = data.lng;
      u.accuracy = data.accuracy;
      u.lastUpdate = Date.now();

      // Tüm kullanıcılara güncellemeyi yayınla
      io.emit('location-broadcast', {
        id: socket.id,
        name: u.name,
        color: u.color,
        lat: u.lat,
        lng: u.lng,
        accuracy: u.accuracy,
        lastUpdate: u.lastUpdate
      });
    }
  });

  // İsim değiştirme
  socket.on('change-name', (newName) => {
    const u = users.get(socket.id);
    if (u && newName && newName.trim().length > 0) {
      const oldName = u.name;
      u.name = newName.trim().substring(0, 20);
      io.emit('name-changed', { id: socket.id, oldName, newName: u.name });
      console.log(`📝 ${oldName} → ${u.name}`);
    }
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (u) {
      console.log(`❌ ${u.name} ayrıldı | Toplam: ${users.size - 1} kullanıcı`);
      users.delete(socket.id);
      io.emit('user-left', { id: socket.id, name: u.name });
    }
  });
});

// Sunucuyu başlat
server.listen(PORT, '0.0.0.0', async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     🗺️  ERZURUM HARİTA UYGULAMASI                   ║');
  console.log('║     Gerçek Zamanlı Konum Paylaşımı                   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  💻 Bilgisayardan: http://localhost:${PORT}              ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  🔄 İnternet tüneli oluşturuluyor...                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // İnternet tüneli oluştur - farklı ağlardan erişim için
  try {
    const tunnel = await localtunnel({ port: PORT });

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅ TÜNEL HAZIR! Telefonlara bu adresi gönderin:    ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  📱 ${tunnel.url}`);
    console.log('║                                                      ║');
    console.log('║  ⚡ Bu adres her yerden çalışır (farklı WiFi, 4G)   ║');
    console.log('║  🔒 HTTPS - konum izni otomatik çalışır             ║');
    console.log('║  📋 Adresi kopyalayıp telefonlara gönderin          ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    tunnel.on('close', () => {
      console.log('⚠️ Tünel kapandı. Sunucuyu yeniden başlatın.');
    });

    tunnel.on('error', (err) => {
      console.log('⚠️ Tünel hatası:', err.message);
    });

  } catch (err) {
    console.log('');
    console.log('⚠️ İnternet tüneli oluşturulamadı:', err.message);
    console.log('');

    // Yedek: Yerel ağ IP adreslerini göster
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  📱 Aynı ağdan: http://${addr.address}:${PORT}`);
        }
      }
    }
    console.log('');
    console.log('  💡 Farklı ağ için: npx localtunnel --port 3000');
    console.log('');
  }
});
