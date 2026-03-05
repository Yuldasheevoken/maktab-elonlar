// ============================================================
// MAKTAB ELONLAR - Supabase bilan Cross-Device Sync
// window.storage → Supabase real-time database
// ============================================================

const SUPABASE_URL = 'https://tcbszzsxpqlkeltsxagq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYnN6enN4cHFsa2VsdHN4YWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg1NjgsImV4cCI6MjA4ODI2NDU2OH0.eiv51RaM3avfjWHshTSKTsjTceoQACIC1myCp2KvyHg';

// ============================================================
// SUPABASE CLIENT (CDN orqali, import shart emas)
// ============================================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// AUTH CONFIG
// ============================================================
const ADMINS = {
  owner: {
    login: '15-maktabA-Za1@maktab.uz',
    password: 'admin123',
    role: 'owner',
    name: 'Direktor'
  },
  moderator: {
    login: 'Elonlaradmini@gmail.uz',
    password: 'admin456',
    role: 'moderator',
    name: 'Moderator'
  }
};

// ============================================================
// STATE
// ============================================================
let state = {
  elonlar: [],
  currentAdmin: null,
  loading: false,
  filter: 'barchasi',
  realtimeChannel: null
};

// ============================================================
// DOM HELPERS
// ============================================================
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el.style.display = ''; };
const hide = id => { const el = $(id); if (el) el.style.display = 'none'; };

// ============================================================
// TOAST BILDIRISHNOMA
// ============================================================
function toast(xabar, tur = 'info') {
  const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colors[tur]}; color:#fff; padding:14px 22px;
    border-radius:12px; font-size:14px; font-weight:600;
    box-shadow:0 4px 20px rgba(0,0,0,0.2); 
    animation: slideIn 0.3s ease; max-width:320px;
  `;
  div.textContent = xabar;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

// ============================================================
// SUPABASE - ELONLARNI YUKLASH
// ============================================================
async function elonlarniYukla() {
  state.loading = true;
  renderLoading();

  try {
    const { data, error } = await db
      .from('elonlar')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    state.elonlar = data || [];
    renderElonlar();
    toast(`${state.elonlar.length} ta elon yuklandi ✓`, 'success');
  } catch (err) {
    console.error('Yuklash xatosi:', err);
    toast("Ma'lumot yuklanmadi: " + err.message, 'error');
    state.elonlar = [];
    renderElonlar();
  } finally {
    state.loading = false;
  }
}

// ============================================================
// SUPABASE - ELON QO'SHISH
// ============================================================
async function elonQosh(elonData) {
  try {
    const yangiElon = {
      id: 'elon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      sarlavha: elonData.sarlavha || '',
      tavsif: elonData.tavsif || '',
      narx: elonData.narx || '',
      kategoriya: elonData.kategoriya || 'boshqa',
      telefon: elonData.telefon || '',
      sinf: elonData.sinf || '',
      rasm: elonData.rasm || '',
      muallif: elonData.muallif || 'Noma\'lum',
      holat: 'kutilmoqda',
      sana: new Date().toISOString()
    };

    const { data, error } = await db
      .from('elonlar')
      .insert([yangiElon])
      .select()
      .single();

    if (error) throw error;

    toast('Elon muvaffaqiyatli yuborildi! ✓', 'success');
    return data;
  } catch (err) {
    console.error("Qo'shish xatosi:", err);
    toast("Elon qo'shilmadi: " + err.message, 'error');
    return null;
  }
}

// ============================================================
// SUPABASE - ELON O'CHIRISH
// ============================================================
async function elonOchir(id) {
  try {
    const { error } = await db
      .from('elonlar')
      .delete()
      .eq('id', id);

    if (error) throw error;

    state.elonlar = state.elonlar.filter(e => e.id !== id);
    renderElonlar();
    toast("Elon o'chirildi ✓", 'success');
  } catch (err) {
    console.error("O'chirish xatosi:", err);
    toast("O'chirishda xato: " + err.message, 'error');
  }
}

// ============================================================
// SUPABASE - ELON HOLATINI O'ZGARTIRISH (admin)
// ============================================================
async function elonHolatOzgartir(id, yangiHolat) {
  try {
    const { error } = await db
      .from('elonlar')
      .update({ holat: yangiHolat })
      .eq('id', id);

    if (error) throw error;

    const idx = state.elonlar.findIndex(e => e.id === id);
    if (idx !== -1) state.elonlar[idx].holat = yangiHolat;
    renderElonlar();

    const xabarlar = {
      tasdiqlangan: '✅ Elon tasdiqlandi',
      rad_etilgan: '❌ Elon rad etildi',
      kutilmoqda: '⏳ Holat kutilmoqdaga qaytarildi'
    };
    toast(xabarlar[yangiHolat] || 'Holat yangilandi', 'success');
  } catch (err) {
    toast('Yangilashda xato: ' + err.message, 'error');
  }
}

// ============================================================
// REALTIME SUBSCRIPTION
// ============================================================
function realtimeUlan() {
  // Avvalgi kanaldan chiqish
  if (state.realtimeChannel) {
    db.removeChannel(state.realtimeChannel);
  }

  state.realtimeChannel = db
    .channel('elonlar-realtime')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'elonlar' },
      (payload) => {
        console.log('Realtime yangilik:', payload.eventType);
        
        if (payload.eventType === 'INSERT') {
          // Takrorlanishni oldini olish
          if (!state.elonlar.find(e => e.id === payload.new.id)) {
            state.elonlar.unshift(payload.new);
            renderElonlar();
            toast('🆕 Yangi elon qo\'shildi!', 'info');
          }
        } else if (payload.eventType === 'DELETE') {
          state.elonlar = state.elonlar.filter(e => e.id !== payload.old.id);
          renderElonlar();
        } else if (payload.eventType === 'UPDATE') {
          const idx = state.elonlar.findIndex(e => e.id === payload.new.id);
          if (idx !== -1) {
            state.elonlar[idx] = payload.new;
            renderElonlar();
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('Realtime holat:', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ Realtime ulanish muvaffaqiyatli');
      }
    });
}

// ============================================================
// AUTH - LOGIN
// ============================================================
function adminLogin(login, password) {
  for (const [key, admin] of Object.entries(ADMINS)) {
    if (admin.login === login && admin.password === password) {
      state.currentAdmin = { ...admin };
      localStorage.setItem('maktab_admin', JSON.stringify(state.currentAdmin));
      toast(`Xush kelibsiz, ${admin.name}! ✓`, 'success');
      return true;
    }
  }
  toast("Login yoki parol noto'g'ri!", 'error');
  return false;
}

function adminChiqish() {
  state.currentAdmin = null;
  localStorage.removeItem('maktab_admin');
  renderUI();
  toast("Tizimdan chiqildi", 'info');
}

function savedAdminniTekshir() {
  try {
    const saved = localStorage.getItem('maktab_admin');
    if (saved) {
      state.currentAdmin = JSON.parse(saved);
    }
  } catch (e) {
    localStorage.removeItem('maktab_admin');
  }
}

// ============================================================
// RENDER - LOADING
// ============================================================
function renderLoading() {
  const container = $('elonlar-container') || $('elonlar') || $('main-content');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center; padding:60px; color:#666;">
      <div style="font-size:48px; animation:spin 1s linear infinite; display:inline-block;">⏳</div>
      <p style="margin-top:16px; font-size:16px;">Ma'lumotlar yuklanmoqda...</p>
    </div>
    <style>
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    </style>
  `;
}

// ============================================================
// RENDER - ELONLAR RO'YXATI
// ============================================================
function renderElonlar() {
  const container = $('elonlar-container') || $('elonlar') || $('main-content');
  if (!container) return;

  // Filter
  let korinuvchi = state.elonlar;
  
  if (!state.currentAdmin) {
    // Oddiy foydalanuvchi — faqat tasdiqlangan
    korinuvchi = state.elonlar.filter(e => e.holat === 'tasdiqlangan');
  } else if (state.filter !== 'barchasi') {
    korinuvchi = state.elonlar.filter(e => e.holat === state.filter);
  }

  if (korinuvchi.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:80px 20px; color:#999;">
        <div style="font-size:64px; margin-bottom:16px;">📭</div>
        <h3 style="font-size:20px; margin:0 0 8px;">Hozircha elon yo'q</h3>
        <p style="font-size:14px;">Birinchi bo'lib elon bering!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = korinuvchi.map(elon => elonKartaHTML(elon)).join('');
}

// ============================================================
// RENDER - BITTA ELON KARTASI
// ============================================================
function elonKartaHTML(elon) {
  const holatRangi = {
    tasdiqlangan: '#22c55e',
    kutilmoqda: '#f59e0b',
    rad_etilgan: '#ef4444'
  };
  const holatNomi = {
    tasdiqlangan: '✅ Tasdiqlangan',
    kutilmoqda: '⏳ Kutilmoqda',
    rad_etilgan: '❌ Rad etilgan'
  };

  const adminButtonlar = state.currentAdmin ? `
    <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
      ${elon.holat !== 'tasdiqlangan' ? `
        <button onclick="elonHolatOzgartir('${elon.id}', 'tasdiqlangan')"
          style="padding:6px 14px; background:#22c55e; color:#fff; border:none; 
                 border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">
          ✅ Tasdiqlash
        </button>
      ` : ''}
      ${elon.holat !== 'rad_etilgan' ? `
        <button onclick="elonHolatOzgartir('${elon.id}', 'rad_etilgan')"
          style="padding:6px 14px; background:#ef4444; color:#fff; border:none; 
                 border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">
          ❌ Rad etish
        </button>
      ` : ''}
      <button onclick="elonOchir('${elon.id}')"
        style="padding:6px 14px; background:#6b7280; color:#fff; border:none; 
               border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">
        🗑️ O'chirish
      </button>
    </div>
  ` : '';

  const sanaText = elon.sana ? new Date(elon.sana).toLocaleDateString('uz-UZ', {
    year: 'numeric', month: 'long', day: 'numeric'
  }) : '';

  return `
    <div style="background:#fff; border-radius:16px; padding:20px; margin-bottom:16px;
                box-shadow:0 2px 12px rgba(0,0,0,0.08); border:1px solid #f0f0f0;
                transition: transform 0.2s; position:relative;">
      ${state.currentAdmin ? `
        <span style="position:absolute; top:16px; right:16px; 
                     background:${holatRangi[elon.holat] || '#999'};
                     color:#fff; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">
          ${holatNomi[elon.holat] || elon.holat}
        </span>
      ` : ''}
      
      ${elon.rasm ? `
        <img src="${elon.rasm}" alt="${elon.sarlavha}" 
          style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:14px;"
          onerror="this.style.display='none'">
      ` : ''}
      
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div style="flex:1;">
          <h3 style="margin:0 0 8px; font-size:18px; color:#1a1a1a; 
                     padding-right:${state.currentAdmin ? '140px' : '0'}">
            ${elon.sarlavha}
          </h3>
          
          ${elon.kategoriya ? `
            <span style="display:inline-block; background:#eff6ff; color:#3b82f6; 
                         padding:3px 10px; border-radius:20px; font-size:12px; 
                         font-weight:600; margin-bottom:10px;">
              ${elon.kategoriya}
            </span>
          ` : ''}
          
          ${elon.tavsif ? `
            <p style="margin:0 0 10px; color:#555; font-size:14px; line-height:1.6;">
              ${elon.tavsif}
            </p>
          ` : ''}
          
          <div style="display:flex; flex-wrap:wrap; gap:12px; color:#888; font-size:13px;">
            ${elon.narx ? `<span>💰 <strong style="color:#22c55e">${elon.narx}</strong></span>` : ''}
            ${elon.sinf ? `<span>🏫 ${elon.sinf}-sinf</span>` : ''}
            ${elon.telefon ? `<span>📞 <a href="tel:${elon.telefon}" style="color:#3b82f6; text-decoration:none;">${elon.telefon}</a></span>` : ''}
            ${elon.muallif ? `<span>👤 ${elon.muallif}</span>` : ''}
            ${sanaText ? `<span>📅 ${sanaText}</span>` : ''}
          </div>
          
          ${adminButtonlar}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// RENDER - UMUMIY UI
// ============================================================
function renderUI() {
  // Admin panel ko'rsatish/yashirish
  const adminPanel = $('admin-panel');
  const loginForm = $('login-form');
  const adminInfo = $('admin-info');

  if (state.currentAdmin) {
    if (adminPanel) adminPanel.style.display = '';
    if (loginForm) loginForm.style.display = 'none';
    if (adminInfo) {
      adminInfo.innerHTML = `
        <span style="font-weight:600; color:#3b82f6;">${state.currentAdmin.name}</span>
        <button onclick="adminChiqish()" 
          style="margin-left:12px; padding:6px 14px; background:#ef4444; color:#fff; 
                 border:none; border-radius:8px; cursor:pointer; font-size:13px;">
          Chiqish
        </button>
      `;
      adminInfo.style.display = '';
    }
  } else {
    if (adminPanel) adminPanel.style.display = 'none';
    if (loginForm) loginForm.style.display = '';
    if (adminInfo) adminInfo.style.display = 'none';
  }

  renderElonlar();
}

// ============================================================
// ELON YUBORISH FORMASI
// ============================================================
function elonFormaBogla() {
  const forma = $('elon-forma') || $('elon-form') || document.querySelector('form[data-type="elon"]');
  if (!forma) return;

  forma.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sarlavha = (forma.querySelector('[name="sarlavha"]') || forma.querySelector('#sarlavha'))?.value?.trim();
    if (!sarlavha) {
      toast('Sarlavha majburiy!', 'warning');
      return;
    }

    const elonData = {
      sarlavha,
      tavsif: (forma.querySelector('[name="tavsif"]') || forma.querySelector('#tavsif'))?.value?.trim() || '',
      narx: (forma.querySelector('[name="narx"]') || forma.querySelector('#narx'))?.value?.trim() || '',
      kategoriya: (forma.querySelector('[name="kategoriya"]') || forma.querySelector('#kategoriya'))?.value || 'boshqa',
      telefon: (forma.querySelector('[name="telefon"]') || forma.querySelector('#telefon'))?.value?.trim() || '',
      sinf: (forma.querySelector('[name="sinf"]') || forma.querySelector('#sinf'))?.value || '',
      rasm: (forma.querySelector('[name="rasm"]') || forma.querySelector('#rasm'))?.value?.trim() || '',
      muallif: (forma.querySelector('[name="muallif"]') || forma.querySelector('#muallif'))?.value?.trim() || 'Noma\'lum',
    };

    const submitBtn = forma.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Yuborilmoqda...';
    }

    const natija = await elonQosh(elonData);
    
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Elon berish';
    }

    if (natija) {
      forma.reset();
      // Modalni yopish (agar modal bo'lsa)
      const modal = $('elon-modal') || document.querySelector('.modal');
      if (modal) modal.style.display = 'none';
    }
  });
}

// ============================================================
// LOGIN FORMASI
// ============================================================
function loginFormaBogla() {
  // Login tugmasi bosilganda
  document.addEventListener('click', (e) => {
    if (e.target.id === 'login-btn' || e.target.dataset.action === 'login') {
      const loginEl = $('login-input') || $('username') || document.querySelector('[name="login"]');
      const passEl = $('password-input') || $('password') || document.querySelector('[name="password"]');
      
      if (loginEl && passEl) {
        const muvaffaqiyat = adminLogin(loginEl.value.trim(), passEl.value);
        if (muvaffaqiyat) {
          renderUI();
          loginEl.value = '';
          passEl.value = '';
        }
      }
    }
  });

  // Enter tugmasi
  document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const loginEl = $('login-input') || $('username');
      const passEl = $('password-input') || $('password');
      if (loginEl && passEl && (document.activeElement === loginEl || document.activeElement === passEl)) {
        const muvaffaqiyat = adminLogin(loginEl.value.trim(), passEl.value);
        if (muvaffaqiyat) {
          renderUI();
          loginEl.value = '';
          passEl.value = '';
        }
      }
    }
  });
}

// ============================================================
// FILTER
// ============================================================
function filterOzgartir(yangiFilter) {
  state.filter = yangiFilter;
  
  // Filter tugmalarini yangilash
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.style.background = btn.dataset.filter === yangiFilter ? '#3b82f6' : '';
    btn.style.color = btn.dataset.filter === yangiFilter ? '#fff' : '';
  });
  
  renderElonlar();
}

// ============================================================
// STATISTIKA (admin uchun)
// ============================================================
function statistikaRender() {
  const statsEl = $('statistika') || $('stats');
  if (!statsEl || !state.currentAdmin) return;

  const jami = state.elonlar.length;
  const tasdiqlangan = state.elonlar.filter(e => e.holat === 'tasdiqlangan').length;
  const kutilmoqda = state.elonlar.filter(e => e.holat === 'kutilmoqda').length;
  const rad = state.elonlar.filter(e => e.holat === 'rad_etilgan').length;

  statsEl.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); 
                gap:12px; margin-bottom:20px;">
      ${[
        { n: jami, l: "Jami", c: '#3b82f6', i: '📋' },
        { n: tasdiqlangan, l: "Tasdiqlangan", c: '#22c55e', i: '✅' },
        { n: kutilmoqda, l: "Kutilmoqda", c: '#f59e0b', i: '⏳' },
        { n: rad, l: "Rad etilgan", c: '#ef4444', i: '❌' }
      ].map(s => `
        <div style="background:#fff; border-radius:12px; padding:16px; text-align:center;
                    box-shadow:0 2px 8px rgba(0,0,0,0.06); border-left:4px solid ${s.c}">
          <div style="font-size:28px">${s.i}</div>
          <div style="font-size:28px; font-weight:700; color:${s.c}; margin:4px 0">${s.n}</div>
          <div style="font-size:12px; color:#888">${s.l}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// ILOVANI ISHGA TUSHIRISH
// ============================================================
async function appStart() {
  console.log('🚀 Maktab Elonlar ishga tushmoqda...');
  
  // Saqlangan admin sessiyasini tiklash
  savedAdminniTekshir();
  
  // Forma va login eventlarini ulash
  elonFormaBogla();
  loginFormaBogla();
  
  // Filter tugmalarini ulash
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => filterOzgartir(btn.dataset.filter));
  });
  
  // UI ni boshlang'ich holat
  renderUI();
  
  // Supabase dan ma'lumotlarni yukla
  await elonlarniYukla();
  
  // Realtime ulanish
  realtimeUlan();
  
  // Statistika (agar admin bo'lsa)
  if (state.currentAdmin) statistikaRender();
  
  console.log('✅ Ilova tayyor! Realtime sync yoqilgan.');
}

// ============================================================
// GLOBAL EXPORT (HTML dagi onclick uchun)
// ============================================================
window.elonOchir = elonOchir;
window.elonHolatOzgartir = elonHolatOzgartir;
window.filterOzgartir = filterOzgartir;
window.adminChiqish = adminChiqish;

// DOM tayyor bo'lganda ishga tushur
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', appStart);
} else {
  appStart();
}
