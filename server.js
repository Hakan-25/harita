const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Statik dosyaları sun
app.use(express.static('public'));

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
  console.log(`✅ ${user.name} bağlandı | Toplam: ${users.size}`);

  socket.emit('welcome', { id: user.id, name: user.name, color: user.color });
  socket.emit('users-list', Array.from(users.values()).filter(u => u.lat !== null));
  socket.broadcast.emit('user-joined', { id: user.id, name: user.name, color: user.color });

  socket.on('location-update', (data) => {
    const u = users.get(socket.id);
    if (u) {
      u.lat = data.lat;
      u.lng = data.lng;
      u.accuracy = data.accuracy;
      u.lastUpdate = Date.now();
      io.emit('location-broadcast', {
        id: socket.id, name: u.name, color: u.color,
        lat: u.lat, lng: u.lng, accuracy: u.accuracy, lastUpdate: u.lastUpdate
      });
    }
  });

  socket.on('change-name', (newName) => {
    const u = users.get(socket.id);
    if (u && newName && newName.trim().length > 0) {
      const oldName = u.name;
      u.name = newName.trim().substring(0, 20);
      io.emit('name-changed', { id: socket.id, oldName, newName: u.name });
    }
  });

  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (u) {
      console.log(`❌ ${u.name} ayrıldı | Toplam: ${users.size - 1}`);
      users.delete(socket.id);
      io.emit('user-left', { id: socket.id, name: u.name });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🗺️ Erzurum Harita sunucusu çalışıyor: port ${PORT}`);
});
