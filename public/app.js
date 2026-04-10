// ════════════════════════════════════════════
//  1. SCROLL REVEAL
// ════════════════════════════════════════════
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ════════════════════════════════════════════
//  2. CALENDAR — August 2026
// ════════════════════════════════════════════
(function renderCalendar() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;

  const YEAR = 2026, MONTH = 7; // 0-indexed → August
  const TARGET = 23;

  // Aug 1 2026 is Saturday → getDay() = 6, Mon=0 offset = (6+6)%7 = 5
  const firstDay = new Date(YEAR, MONTH, 1).getDay();
  const offset   = (firstDay + 6) % 7; // Monday-based offset
  const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate(); // 31

  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="cal__d cal__d--empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    if (d === TARGET) {
      html += `
        <div class="cal__d cal__d--star" style="position:relative;">
          ${d}
          <svg class="cal-svg" viewBox="0 0 42 42">
            <path d="M21 3 C11.6 3 4 10.6 4 20 C4 29.4 11.6 37 21 37 C30.4 37 38 29.4 38 20 C38 10.6 30.4 3 21 3"/>
          </svg>
          <svg class="cal-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>`;
    } else {
      html += `<div class="cal__d">${d}</div>`;
    }
  }
  grid.innerHTML = html;
})();

// ════════════════════════════════════════════
//  3. COUNTDOWN TIMER
// ════════════════════════════════════════════
(function countdown() {
  const target = new Date('2026-08-23T14:00:00').getTime();
  const tD = document.getElementById('tD');
  const tH = document.getElementById('tH');
  const tM = document.getElementById('tM');
  const tS = document.getElementById('tS');
  if (!tD) return;

  function pad(n, len = 2) { return String(n).padStart(len, '0'); }

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) { tD.textContent = '0'; tH.textContent = '0'; tM.textContent = '0'; tS.textContent = '0'; return; }
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    tD.textContent = pad(days, 3);
    tH.textContent = pad(hrs);
    tM.textContent = pad(mins);
    tS.textContent = pad(secs);
  }

  tick();
  setInterval(tick, 1000);
})();

// ════════════════════════════════════════════
//  4. AUDIO PLAYER
//     — Real <audio> element, loads music/wedding.mp3
//     — Autoplay: starts on first user gesture anywhere on page
//     — Play/pause toggle, seekable track bar
// ════════════════════════════════════════════
(function initPlayer() {
  const btn    = document.getElementById('playBtn');
  const ip     = document.getElementById('iconPlay');
  const ipp    = document.getElementById('iconPause');
  const fill   = document.getElementById('trackFill');
  const trk    = document.getElementById('trackWrap');
  const tm     = document.getElementById('pTime');
  if (!btn) return;

  // Create audio element
  const audio = document.createElement('audio');
  audio.src = 'music/wedding.mp3';
  audio.preload = 'metadata';

  let playing = false;

  function pad(s) { return String(s).padStart(2, '0'); }
  function fmt(sec) { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${pad(s)}`; }

  // Update UI on time change
  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = pct + '%';
    tm.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`;
  });

  // When metadata loads, show total time
  audio.addEventListener('loadedmetadata', () => {
    tm.textContent = `0:00 / ${fmt(audio.duration)}`;
  });

  // Toggle play/pause
  function toggle() {
    if (playing) {
      audio.pause(); playing = false;
      ip.style.display = 'block'; ipp.style.display = 'none';
    } else {
      audio.play(); playing = true;
      ip.style.display = 'none'; ipp.style.display = 'block';
    }
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // Seek on track click
  trk.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = trk.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // ─── SPLASH SCREEN → Start music on click ───
  const splash = document.getElementById('splash');
  const splashBtn = document.getElementById('splashBtn');

  if (splash && splashBtn) {
    splashBtn.addEventListener('click', () => {
      splash.classList.add('hidden');
      audio.play().then(() => {
        playing = true;
        ip.style.display = 'none';
        ipp.style.display = 'block';
      }).catch(() => {});
    });
  }
})();

// ════════════════════════════════════════════
//  5. RSVP FORM
// ════════════════════════════════════════════
(function initRSVP() {
  const btn = document.getElementById('rBtn');
  const rOk = document.getElementById('rOk');
  const form = document.getElementById('rsvpForm');
  if (!btn) return;

  btn.addEventListener('click', () => {
    form.style.display = 'none';
    rOk.style.display  = 'block';
  });
})();

// ════════════════════════════════════════════
//  6. SCROLL ARROW
// ════════════════════════════════════════════

(function initScrollArrow() {
  const arrow = document.getElementById('scrollArrow');
  if (!arrow) return;

  arrow.addEventListener('click', () => {
    const hero = document.querySelector('.hero');
    if (hero) {
      window.scrollTo({
        top: hero.offsetHeight,
        behavior: 'smooth'
      });
    }
  });
})();

// ════════════════════════════════════════════
//  7. APPLY SITE SETTINGS
// ════════════════════════════════════════════
function applySettings(s) {
  if (!s) return;

  // CSS variables
  if (s.colors) {
    const r = document.documentElement;
    if (s.colors.forest) {
      r.style.setProperty('--forest', s.colors.forest);
      r.style.setProperty('--forest-mid', s.colors.forest);
      r.style.setProperty('--forest-light', s.colors.forest);
    }
    if (s.colors.gold) {
      r.style.setProperty('--gold', s.colors.gold);
      r.style.setProperty('--gold-dim', s.colors.gold);
    }
    if (s.colors.cream) {
      r.style.setProperty('--cream', s.colors.cream);
      r.style.setProperty('--cream-warm', s.colors.cream);
      r.style.setProperty('--cream-dark', s.colors.cream);
    }
  }

  // Names
  if (s.names) {
    const heroNames = document.querySelector('.hero__names');
    if (heroNames) {
      heroNames.innerHTML = `${s.names.groom}<span class="hero__amp">&amp;</span>${s.names.bride}`;
    }
    const splashNames = document.querySelector('.splash__names');
    if (splashNames) splashNames.textContent = `${s.names.groom} & ${s.names.bride}`;
    const signs = document.querySelectorAll('.thx__sign');
    if (signs.length >= 2) signs[1].textContent = `${s.names.groom} & ${s.names.bride}`;
  }

  // Date display
  if (s.date) {
    const heroDate = document.querySelector('.hero__date');
    if (heroDate) heroDate.textContent = s.date.display;
    const cdPara = document.querySelector('.cd-para');
    if (cdPara && s.date.rsvpDeadline) {
      cdPara.textContent = `Будь ласка, підтвердіть свою присутність на весіллі до ${s.date.rsvpDeadline}.`;
    }
  }

  // Invitation text
  if (s.invitation && s.invitation.text) {
    const invP = document.querySelector('.inv__text p');
    if (invP) invP.textContent = s.invitation.text;
  }

  // Timeline
  if (s.timeline) {
    const items = document.querySelectorAll('.tl-item');
    s.timeline.forEach((ev, i) => {
      if (!items[i]) return;
      const timeEl  = items[i].querySelector('.tl-time');
      const eventEl = items[i].querySelector('.tl-event');
      const addrEl  = items[i].querySelector('.tl-addr a');
      if (timeEl)  timeEl.textContent  = ev.time;
      if (eventEl) eventEl.textContent = ev.event;
      if (addrEl)  { addrEl.textContent = ev.address; addrEl.href = ev.mapUrl || '#'; }
    });
  }

  // Details paragraphs
  if (s.details) {
    const thxPs = document.querySelectorAll('.thx__text p');
    if (thxPs[0] && s.details.text1) thxPs[0].textContent = s.details.text1;
    if (thxPs[1] && s.details.text2) thxPs[1].textContent = s.details.text2;
  }

  // Dress code palette
  if (s.dresscode && s.dresscode.colors) {
    const palette = document.querySelector('.dc__palette');
    if (palette) {
      palette.innerHTML = s.dresscode.colors
        .map(c => `<div class="dc__sw"><div class="dc__circle" style="background:${c}"></div></div>`)
        .join('');
    }
  }

  // Splash screen colors
  if (s.splashColors) {
    const splash = document.querySelector('.splash');
    if (splash) splash.style.background = s.splashColors.background;
    const splashLabel = document.querySelector('.splash__label');
    if (splashLabel) splashLabel.style.color = s.splashColors.label;
    const splashNames = document.querySelector('.splash__names');
    if (splashNames) splashNames.style.color = s.splashColors.names;
    const splashBtn = document.querySelector('.splash__btn');
    if (splashBtn) splashBtn.style.background = s.splashColors.button;
  }

  // Images
  if (s.images) {
    if (s.images.hero) {
      const heroPhoto = document.querySelector('.hero__photo');
      if (heroPhoto) heroPhoto.style.backgroundImage = `url('${s.images.hero}')`;
    }
    if (s.images.couple) {
      const coupleImg = document.querySelector('.thx__photo img');
      if (coupleImg) coupleImg.src = s.images.couple;
    }
  }
}
