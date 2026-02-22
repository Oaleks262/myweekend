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
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');

// Ensure photos directory exists
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
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

// ─── Middleware ───
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  const slug = name.trim().toLowerCase().split('').map(ch => map[ch] || ch).join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (guests.find(g => g.slug === slug)) {
    return res.status(409).json({ error: 'slug already exists', slug });
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

  const { phone } = req.body;
  if (phone !== undefined) {
    guests[guestIndex].phone = phone;
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

// ─── Home page ───
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Catch-all: serve guest.html for any /:slug path ───
app.get('/:slug', (req, res) => {
  if (['favicon.ico','robots.txt'].includes(req.params.slug)) return res.status(404).end();
  res.sendFile(path.join(__dirname, 'public', 'guest.html'));
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`\n  Wedding site → http://localhost:${PORT}`);
  console.log(`  Guest example → http://localhost:${PORT}/marko-shevchenko`);
  console.log(`  Admin panel  → http://localhost:${PORT}/admin.html`);
  console.log(`  API          → http://localhost:${PORT}/api/guests\n`);
});
