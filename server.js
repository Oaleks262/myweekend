const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const sharp   = require('sharp');
const archiver = require('archiver');

const app  = express();
const PORT = process.env.PORT || 2308;
const GUESTS_PATH = path.join(__dirname, 'guests.json');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const SITE_SETTINGS_PATH = path.join(__dirname, 'site-settings.json');
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');

const DEFAULT_SITE_SETTINGS = {
  names: { groom: 'Олександр', bride: 'Соломія' },
  date: { display: '23 · 08 · 2026', rsvpDeadline: '26 червня 2026 року' },
  invitation: { text: 'Ми з радістю та теплом у серці запрошуємо Вас приєднатися до святкування нашого весілля, яке відбудеться вже цього літа. Ми будемо безмежно щасливі, якщо ви розділите з нами радість цього дня.' },
  timeline: [
    { time: '14:00', event: 'Зустріч у домі нареченої', address: 'вул. Лютеранська, 10, Київ', mapUrl: 'https://www.google.com/maps/place/Kyiv,+Ukraine/' },
    { time: '16:00', event: 'Церемонія шлюбу', address: 'Собор Святого Андрія, вул. Андреєвська, 3', mapUrl: 'https://www.google.com/maps/place/Kyiv,+Ukraine/' },
    { time: '18:30', event: 'Заклад', address: 'Ресторан «Золоті Ворота», вул. Золотої Брами, 7', mapUrl: 'https://www.google.com/maps/place/Kyiv,+Ukraine/' }
  ],
  details: {
    text1: 'Будемо дуже вдячні за будь-який прояв вашої уваги. Та якщо ви роздумуєте над подарунком, найкращою підтримкою для нас стане фінансовий внесок у нашу спільну мрію.',
    text2: 'Ваш подарунок допоможе нам швидше здійснити цю ціль та зробити наше сімейне життя ще комфортнішим. Дякуємо за розуміння і вашу підтримку.'
  },
  colors: { forest: '#333819', gold: '#c4a96a', cream: '#f4f1ec' },
  dresscode: { colors: ['#eeece7', '#d7d7d2', '#b8bbb6', '#999c96', '#acb091', '#8a9161', '#6c772d', '#5d662b'] },
  splashColors: { background: '#E5E6E3', names: '#495023', button: '#868c61', label: '#666e36' },
  images: { hero: '/img/fotter.jpg', couple: '/img/IMG_FA56B1C5F58F-1.jpeg', og: '/img/IMG_FA56B1C5F58F-1.jpeg' },
  og: { description: 'Запрошення на весілля' }
};

// Ensure required directories exist
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}
const IMG_DIR = path.join(__dirname, 'public', 'img');
if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}

// ─── Load helpers ───
function loadGuests() {
  try {
    const raw = fs.readFileSync(GUESTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('guests.json read error:', e.message);
    return [];
  }
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { photosEnabled: false };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function loadSiteSettings() {
  try {
    const raw = fs.readFileSync(SITE_SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS));
  }
}

function saveSiteSettings(settings) {
  fs.writeFileSync(SITE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// ─── Middleware ───
app.use(express.json());
// index: false — щоб "/" не перехоплювався статикою, а йшов у route-handler для OG-тегів
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Multer for file uploads ───
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'), false);
    }
  }
});

// ─── API: get guest by slug ───
app.get('/api/guest/:slug', (req, res) => {
  const guests = loadGuests();
  const guest  = guests.find(g => g.slug === req.params.slug);
  if (guest) return res.json(guest);
  return res.status(404).json({ error: 'not found' });
});

// ─── API: list all guests ───
app.get('/api/guests', (req, res) => {
  res.json(loadGuests());
});

// ─── API: add new guest ───
app.post('/api/guests', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const guests = loadGuests();

  const map = {
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie',
    'ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l',
    'м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
    'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ъ':'',
    'э':'e','ю':'iu','я':'ia','ё':'io'
  };

  let slug = name.trim().toLowerCase().split('').map(ch => map[ch] || ch).join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const baseSlug = slug;
  let counter = 2;
  while (guests.find(g => g.slug === slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  const { phone } = req.body;

  const newGuest = {
    id:   guests.length ? Math.max(...guests.map(g => g.id)) + 1 : 1,
    name: name.trim(),
    slug,
    phone: phone || '',
    confirmed: false
  };

  guests.push(newGuest);
  fs.writeFileSync(GUESTS_PATH, JSON.stringify(guests, null, 2));
  res.status(201).json(newGuest);
});

// ─── API: update guest (phone) ───
app.patch('/api/guest/:slug', (req, res) => {
  const guests = loadGuests();
  const guestIndex = guests.findIndex(g => g.slug === req.params.slug);

  if (guestIndex === -1) {
    return res.status(404).json({ error: 'guest not found' });
  }

  const { phone, name, table } = req.body;
  if (phone !== undefined) {
    guests[guestIndex].phone = phone;
  }

  if (table !== undefined) {
    guests[guestIndex].table = table;
  }

  if (name !== undefined && name.trim()) {
    const map = {
      'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie',
      'ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l',
      'м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
      'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ъ':'',
      'э':'e','ю':'iu','я':'ia','ё':'io'
    };
    let newSlug = name.trim().toLowerCase().split('').map(ch => map[ch] || ch).join('')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const baseSlug = newSlug;
    let counter = 2;
    while (guests.find((g, i) => g.slug === newSlug && i !== guestIndex)) {
      newSlug = `${baseSlug}-${counter++}`;
    }
    guests[guestIndex].name = name.trim();
    guests[guestIndex].slug = newSlug;
  }

  fs.writeFileSync(GUESTS_PATH, JSON.stringify(guests, null, 2));
  res.json(guests[guestIndex]);
});

// ─── API: delete guest ───
app.delete('/api/guest/:slug', (req, res) => {
  let guests = loadGuests();
  const guestIndex = guests.findIndex(g => g.slug === req.params.slug);

  if (guestIndex === -1) {
    return res.status(404).json({ error: 'guest not found' });
  }

  guests.splice(guestIndex, 1);
  fs.writeFileSync(GUESTS_PATH, JSON.stringify(guests, null, 2));
  res.json({ success: true });
});

// ─── API: get seating info for a guest ───
app.get('/api/guest/:slug/seating', (req, res) => {
  const guests = loadGuests();
  const guest = guests.find(g => g.slug === req.params.slug);
  if (!guest) return res.status(404).json({ error: 'not found' });
  if (!guest.table) return res.json({ table: null });
  const neighbors = guests
    .filter(g => g.slug !== req.params.slug && g.table === guest.table)
    .map(g => g.name);
  res.json({ table: guest.table, neighbors });
});

// ─── API: batch update seating ───
app.patch('/api/guests/seating', (req, res) => {
  const assignments = req.body;
  if (!Array.isArray(assignments)) return res.status(400).json({ error: 'array expected' });
  const guests = loadGuests();
  assignments.forEach(({ slug, table }) => {
    const g = guests.find(g => g.slug === slug);
    if (g) g.table = table || null;
  });
  fs.writeFileSync(GUESTS_PATH, JSON.stringify(guests, null, 2));
  res.json({ ok: true });
});

// ─── API: RSVP confirm ───
app.post('/api/rsvp/:slug', (req, res) => {
  const guests = loadGuests();
  const guestIndex = guests.findIndex(g => g.slug === req.params.slug);

  if (guestIndex === -1) {
    return res.status(404).json({ error: 'guest not found' });
  }

  guests[guestIndex].confirmed = true;
  guests[guestIndex].confirmedAt = new Date().toISOString();

  fs.writeFileSync(GUESTS_PATH, JSON.stringify(guests, null, 2));
  res.json({ success: true, guest: guests[guestIndex] });
});

// ─── API: get site settings ───
app.get('/api/site-settings', (req, res) => {
  res.json(loadSiteSettings());
});

// ─── API: update site settings ───
app.patch('/api/site-settings', (req, res) => {
  const settings = loadSiteSettings();
  const u = req.body;

  // object fields — deep merge
  for (const key of ['names', 'date', 'invitation', 'details', 'colors', 'dresscode', 'splashColors', 'og', 'images']) {
    if (u[key] !== undefined) {
      if (!settings[key] || typeof settings[key] !== 'object') settings[key] = {};
      Object.assign(settings[key], u[key]);
    }
  }
  // array field — replace
  if (u.timeline !== undefined) settings.timeline = u.timeline;

  saveSiteSettings(settings);
  res.json(settings);
});

// ─── API: reset site settings to defaults ───
app.post('/api/site-settings/reset', (req, res) => {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS));
  saveSiteSettings(defaults);
  res.json(defaults);
});

// ─── API: upload site image (hero / couple / og) ───
app.post('/api/images/:type', upload.single('image'), async (req, res) => {
  const type = req.params.type;
  if (!['hero', 'couple', 'og'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const filename = `custom-${type}.webp`;
  const filepath = path.join(__dirname, 'public', 'img', filename);

  try {
    const img = sharp(req.file.buffer);

    if (type === 'hero') {
      // Фон hero — max 1920px, не збільшуємо
      await img.resize(1920, null, { withoutEnlargement: true }).webp({ quality: 82 }).toFile(filepath);
    } else if (type === 'couple') {
      // Фото пари — max 700px, не збільшуємо
      await img.resize(700, null, { withoutEnlargement: true }).webp({ quality: 85 }).toFile(filepath);
    } else if (type === 'og') {
      // OG-превью — стандарт 1200×630, crop по центру
      await img.resize(1200, 630, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toFile(filepath);
    }

    const settings = loadSiteSettings();
    if (!settings.images) settings.images = {};
    settings.images[type] = `/img/${filename}`;
    saveSiteSettings(settings);
    res.json({ url: `/img/${filename}?t=${Date.now()}` }); // cache-bust лише для preview в адмінці
  } catch (e) {
    console.error('Image upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ═══════════════════════════════════════════
// PHOTOS API
// ═══════════════════════════════════════════

// ─── API: get settings ───
app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

// ─── API: update settings ───
app.patch('/api/settings', (req, res) => {
  const settings = loadSettings();
  const { photosEnabled } = req.body;

  if (photosEnabled !== undefined) {
    settings.photosEnabled = photosEnabled;
  }

  saveSettings(settings);
  res.json(settings);
});

// ─── API: list photos ───
app.get('/api/photos', (req, res) => {
  try {
    const files = fs.readdirSync(PHOTOS_DIR)
      .filter(f => f.endsWith('.webp'))
      .map(f => ({
        name: f,
        url: `/photos/${f}`,
        created: fs.statSync(path.join(PHOTOS_DIR, f)).mtime
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// ─── API: upload photos ───
app.post('/api/photos', upload.array('photos', 100), async (req, res) => {
  try {
    const results = [];

    for (const file of req.files) {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const filename = `photo_${timestamp}_${randomStr}.webp`;
      const filepath = path.join(PHOTOS_DIR, filename);

      // Convert to webp
      await sharp(file.buffer)
        .webp({ quality: 85 })
        .toFile(filepath);

      // Also save original as jpg for download
      const jpgFilename = `photo_${timestamp}_${randomStr}.jpg`;
      const jpgFilepath = path.join(PHOTOS_DIR, jpgFilename);
      await sharp(file.buffer)
        .jpeg({ quality: 90 })
        .toFile(jpgFilepath);

      results.push({
        name: filename,
        url: `/photos/${filename}`
      });
    }

    res.json({ success: true, photos: results });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── API: delete photo ───
app.delete('/api/photos/:name', (req, res) => {
  const name = req.params.name;
  const webpPath = path.join(PHOTOS_DIR, name);
  const jpgPath = path.join(PHOTOS_DIR, name.replace('.webp', '.jpg'));

  try {
    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(jpgPath)) fs.unlinkSync(jpgPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── API: download all photos as ZIP (jpg format) ───
app.get('/api/photos/download', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.attachment('wedding_photos.zip');
  archive.pipe(res);

  try {
    const files = fs.readdirSync(PHOTOS_DIR).filter(f => f.endsWith('.jpg'));

    for (const file of files) {
      archive.file(path.join(PHOTOS_DIR, file), { name: file });
    }

    archive.finalize();
  } catch (e) {
    console.error('Archive error:', e);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ─── OG tag helper ───
function buildOgTags({ title, description, imageUrl, pageUrl }) {
  const esc = s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
  <meta property="og:type"        content="website"/>
  <meta property="og:title"       content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image"       content="${esc(imageUrl)}"/>
  <meta property="og:url"         content="${esc(pageUrl)}"/>
  <meta name="twitter:card"       content="summary_large_image"/>
  <meta name="twitter:title"      content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image"      content="${esc(imageUrl)}"/>`;
}

// ─── Home page (з OG-тегами) ───
app.get('/', (req, res) => {
  const s    = loadSiteSettings();
  const base = `${req.protocol}://${req.get('host')}`;
  const ogTags = buildOgTags({
    title:       `${s.names?.groom || 'Олександр'} & ${s.names?.bride || 'Соломія'} — Весілля ${s.date?.display || '23 · 08 · 2026'}`,
    description: s.invitation?.text || s.og?.description || 'Запрошення на весілля',
    imageUrl:    base + (s.images?.og || s.images?.couple || '/img/IMG_FA56B1C5F58F-1.jpeg'),
    pageUrl:     base + '/'
  });
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
  html = html.replace('</head>', ogTags + '\n</head>');
  res.send(html);
});

// ─── Admin page ───
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Catch-all: serve guest.html з персоналізованими OG-тегами ───
app.get('/:slug', (req, res) => {
  if (['favicon.ico', 'robots.txt'].includes(req.params.slug)) return res.status(404).end();

  const guests = loadGuests();
  const guest  = guests.find(g => g.slug === req.params.slug);
  const s      = loadSiteSettings();
  const base   = `${req.protocol}://${req.get('host')}`;

  const title = `${s.names?.groom || 'Олександр'} & ${s.names?.bride || 'Соломія'} — Весілля ${s.date?.display || '23 · 08 · 2026'}`;
  const description = s.invitation?.text || s.og?.description || 'Запрошення на весілля';

  const ogTags = buildOgTags({
    title,
    description,
    imageUrl: base + (s.images?.og || s.images?.couple || '/img/IMG_FA56B1C5F58F-1.jpeg'),
    pageUrl:  base + '/' + req.params.slug
  });

  let html = fs.readFileSync(path.join(__dirname, 'public', 'guest.html'), 'utf-8');
  html = html.replace('</head>', ogTags + '\n</head>');
  res.send(html);
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`\n  Wedding site → http://localhost:${PORT}`);
  console.log(`  Guest example → http://localhost:${PORT}/marko-shevchenko`);
  console.log(`  Admin panel  → http://localhost:${PORT}/admin.html`);
  console.log(`  API          → http://localhost:${PORT}/api/guests\n`);
});
