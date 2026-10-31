/**
 * script.js — Onboarding Buddy
 * ============================================================
 * Logika utama aplikasi:
 *   - Manajemen tab (Chat / Checklist)
 *   - Fitur Chat: kirim pesan, demo mode, panggil LLM API
 *   - Fitur Checklist: centang tugas, progress bar, localStorage
 *   - Manajemen API key (hanya di memori, tidak di localStorage)
 * ============================================================
 */

/* ============================================================
   SECTION 1: Inisialisasi & State Global
   ============================================================ */

/** Menyimpan API key hanya di memori browser (tidak di-persist) */
let apiKey = '';

/** Menyimpan riwayat percakapan untuk konteks multi-turn LLM */
let chatHistory = [];

/** Referensi ke data knowledge base yang sudah di-load */
let knowledgeData = null;

/** Flag agar welcome message hanya dikirim sekali */
let isFirstMessage = true;

/* ============================================================
   SECTION 2: Load Data Knowledge Base
   ============================================================ */

/**
 * Memuat knowledge.json dan menyimpannya di variabel global.
 * Dipanggil satu kali saat halaman siap.
 */
async function loadKnowledge() {
  try {
    const res = await fetch('./knowledge.json');
    if (!res.ok) throw new Error('Gagal memuat knowledge.json');
    knowledgeData = await res.json();
    console.log('[Onboarding Buddy] Knowledge base berhasil dimuat:', knowledgeData.company);
  } catch (err) {
    console.error('[Onboarding Buddy] Error memuat knowledge base:', err);
    showInlinError('Gagal memuat data knowledge base. Pastikan file knowledge.json tersedia.');
  }
}

/**
 * Mengonversi knowledge.json menjadi teks terstruktur untuk dikirim ke LLM.
 * @returns {string}
 */
function knowledgeToText() {
  if (!knowledgeData) return '';
  return knowledgeData.faqs.map(faq =>
    `[${faq.category}]\nPertanyaan: ${faq.question}\nJawaban: ${faq.answer}`
  ).join('\n\n');
}

/* ============================================================
   SECTION 3: Demo Mode — Pencocokan Kata Kunci
   ============================================================ */

/**
 * Jawab pertanyaan menggunakan pencocokan kata kunci dari knowledge base.
 * Digunakan saat API key tidak tersedia (Demo Mode).
 *
 * @param {string} query - Teks pertanyaan dari pengguna.
 * @returns {string} Jawaban yang ditemukan, atau pesan default.
 */
function demoModeAnswer(query) {
  if (!knowledgeData) return 'Data knowledge base belum tersedia.';

  const normalizedQuery = query.toLowerCase().trim();

  // ── Stop words: kata-kata pertanyaan umum yang tidak membawa makna topik ──
  const STOP_WORDS = new Set([
    'apa', 'bagaimana', 'berapa', 'kapan', 'dimana', 'siapa', 'mengapa',
    'di', 'ke', 'dari', 'yang', 'dan', 'atau', 'ini', 'itu',
    'saya', 'kamu', 'anda', 'ada', 'untuk', 'dengan', 'pada',
    'adalah', 'akan', 'bisa', 'cara', 'ingin', 'mau', 'tahu',
    'info', 'tentang', 'soal', 'hal', 'apakah', 'tolong', 'mohon',
    'bantu', 'dong', 'ya', 'nya', 'lah', 'kah',
    'the', 'is', 'are', 'how', 'what', 'when', 'where', 'who', 'why',
  ]);

  // Tokenisasi query → daftar kata bermakna (≥3 karakter, bukan stop word)
  const queryTokens = normalizedQuery
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  // ── Bangun indeks: keyword → set FAQ id yang memilikinya ──
  // Digunakan untuk mendeteksi keyword generik (ada di banyak FAQ)
  const kwFaqIds = {};
  for (const faq of knowledgeData.faqs) {
    for (const kw of faq.keywords) {
      const k = kw.toLowerCase();
      if (!kwFaqIds[k]) kwFaqIds[k] = new Set();
      kwFaqIds[k].add(faq.id);
    }
  }

  let bestScore = 0;
  let bestFaq   = null;

  for (const faq of knowledgeData.faqs) {
    // ── Langkah 1: Hitung berapa token query yang "ditangkap" FAQ ini ──
    // Sebuah token dianggap tertangkap jika ada keyword FAQ yang mengandungnya.
    const capturedTokens = queryTokens.filter(token =>
      faq.keywords.some(kw => kw.toLowerCase().includes(token))
    );
    const captureRatio = queryTokens.length > 0
      ? capturedTokens.length / queryTokens.length
      : 0;

    // ── Langkah 2: Syarat minimum coverage ──
    // Untuk query 1 token  → harus tertangkap 100%
    // Untuk query 2 token  → harus tertangkap 100% (KEDUA kata harus ada di FAQ)
    // Untuk query 3+ token → boleh ada 1 token yang tidak tertangkap (≥ 2/3)
    const minCoverage = queryTokens.length <= 2 ? 1.0 : 0.67;
    if (captureRatio < minCoverage) {
      // FAQ ini tidak mencakup cukup banyak topik yang ditanyakan → skip
      continue;
    }

    // ── Langkah 3: Hitung skor kualitas kecocokan ──
    let score = 0;

    for (const keyword of faq.keywords) {
      const kw       = keyword.toLowerCase();
      const kwTokens = kw.split(/\s+/).filter(w => w.length >= 2);
      // Keyword dianggap generik jika dimiliki oleh lebih dari 1 FAQ lain
      const isGeneric = (kwFaqIds[kw]?.size || 1) > 1;

      if (normalizedQuery.includes(kw)) {
        if (kwTokens.length > 1) {
          // Keyword multi-kata cocok persis → sinyal kuat
          score += 4;
        } else {
          // Keyword satu kata: beri bobot penuh jika unik, setengah jika generik
          score += isGeneric ? 0.5 : 2;
        }
      } else if (kwTokens.length > 1 && kwTokens.every(t => normalizedQuery.includes(t))) {
        // Semua token keyword multi-kata ditemukan, tapi tidak berurutan
        score += 2;
      }
    }

    // ── Langkah 4: Bonus jika query sangat mirip teks pertanyaan FAQ ──
    const faqQuestionStart = faq.question.toLowerCase().substring(0, 25);
    if (normalizedQuery.includes(faqQuestionStart)) {
      score += 5;
    }

    // ── Langkah 5: Bonus proporsional dari coverage ──
    // Dikalikan 3 agar coverage yang tinggi benar-benar mendorong skor
    score += captureRatio * 3;

    if (score > bestScore) {
      bestScore = score;
      bestFaq   = faq;
    }
  }

  // ── Threshold minimum skor akhir ──
  // Setelah lolos filter coverage, skor minimal 2.5 diperlukan.
  // Angka ini memastikan satu keyword generik + coverage parsial tidak cukup.
  const SCORE_THRESHOLD = 2.5;

  if (bestFaq && bestScore >= SCORE_THRESHOLD) {
    return bestFaq.answer;
  }

  // Tidak ada FAQ yang benar-benar cocok dengan semua topik dalam pertanyaan
  return 'Maaf, informasi mengenai hal tersebut belum tersedia di sistem saya. Silakan hubungi tim HRD langsung di hrd@nusantekno.id atau telepon (021) 5555-1234 ext. 200 untuk informasi lebih lanjut. 😊';
}

/* ============================================================
   SECTION 4: Panggilan LLM API (OpenAI-compatible)
   ============================================================ */

/**
 * Memanggil LLM via OpenAI-compatible API.
 * Fungsi ini DIPISAHKAN agar mudah diganti ke provider lain.
 *
 * @param {string} userMessage - Pesan terbaru dari pengguna.
 * @returns {Promise<string>} Teks respons dari model.
 */
async function callLLM(userMessage) {
  const systemPrompt = buildSystemPrompt(knowledgeToText());

  // Bangun array messages: system prompt + riwayat + pesan terbaru
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userMessage }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.3,   // Rendah agar jawaban konsisten & faktual
      max_tokens: 800
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`API Error: ${errMsg}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/* ============================================================
   SECTION 5: Render Chat UI
   ============================================================ */

/**
 * Menambahkan bubble pesan ke area chat.
 *
 * @param {'user'|'buddy'} sender - Pengirim pesan.
 * @param {string} text - Teks pesan (mendukung newline).
 */
function appendMessage(sender, text) {
  const chatArea = document.getElementById('chat-area');

  const wrapper = document.createElement('div');
  wrapper.className = `flex msg-enter ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`;

  // Avatar Buddy
  const avatarHTML = sender === 'buddy'
    ? `<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold mr-2 flex-shrink-0 mt-1" aria-hidden="true">B</div>`
    : '';

  // Format teks: ganti newline dengan <br>, dan **bold** dengan <strong>
  const formattedText = formatMessageText(text);

  const bubbleClass = sender === 'user' ? 'bubble-user' : 'bubble-buddy';
  const maxWidth   = 'max-w-xs sm:max-w-md md:max-w-lg';

  wrapper.innerHTML = `
    ${avatarHTML}
    <div class="${bubbleClass} ${maxWidth} px-4 py-3 text-sm leading-relaxed" role="article" aria-label="Pesan dari ${sender === 'user' ? 'Anda' : 'Onboarding Buddy'}">
      ${formattedText}
    </div>
  `;

  chatArea.appendChild(wrapper);
  scrollChatToBottom();
}

/**
 * Mengonversi teks plain menjadi HTML sederhana.
 * Mendukung: **bold**, *italic*, dan newline → <br>.
 *
 * @param {string} text
 * @returns {string} HTML string
 */
function formatMessageText(text) {
  // Escape HTML dasar untuk keamanan
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // **bold**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italic*
  safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Newline → <br>
  safe = safe.replace(/\n/g, '<br>');

  return safe;
}

/**
 * Menampilkan indikator "Buddy sedang mengetik..."
 * @returns {HTMLElement} Elemen indikator (untuk dihapus setelah respons tiba)
 */
function showTypingIndicator() {
  const chatArea = document.getElementById('chat-area');
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'flex justify-start mb-3 msg-enter';
  indicator.setAttribute('aria-live', 'polite');
  indicator.setAttribute('aria-label', 'Buddy sedang mengetik');
  indicator.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold mr-2 flex-shrink-0 mt-1" aria-hidden="true">B</div>
    <div class="bubble-buddy px-4 py-3 flex items-center gap-1">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  chatArea.appendChild(indicator);
  scrollChatToBottom();
  return indicator;
}

/**
 * Menghapus indikator typing dari DOM.
 */
function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

/**
 * Scroll area chat ke paling bawah (pesan terbaru).
 */
function scrollChatToBottom() {
  const chatArea = document.getElementById('chat-area');
  chatArea.scrollTop = chatArea.scrollHeight;
}

/* ============================================================
   SECTION 6: Alur Kirim Pesan
   ============================================================ */

/**
 * Handler utama saat pengguna mengirim pesan.
 * Menangani: validasi, demo mode vs LLM, riwayat, error.
 */
async function handleSendMessage() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const userText = input.value.trim();

  // Validasi: pertanyaan tidak boleh kosong
  if (!userText) {
    showInlinError('Silakan ketik pertanyaan terlebih dahulu.');
    input.focus();
    return;
  }

  // Hapus pesan error sebelumnya
  clearInlineError();

  // Tampilkan pesan pengguna
  appendMessage('user', userText);
  input.value = '';
  input.style.height = 'auto';

  // Nonaktifkan input selama proses
  input.disabled = true;
  sendBtn.disabled = true;

  // Tampilkan typing indicator
  const typingEl = showTypingIndicator();

  try {
    let buddyReply;

    if (apiKey.trim()) {
      // Mode LLM: panggil API
      buddyReply = await callLLM(userText);

      // Simpan ke riwayat untuk konteks multi-turn
      chatHistory.push({ role: 'user',      content: userText });
      chatHistory.push({ role: 'assistant', content: buddyReply });

      // Batasi riwayat agar tidak terlalu panjang (10 pasang = 20 pesan)
      if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(chatHistory.length - 20);
      }
    } else {
      // Demo Mode: pencocokan kata kunci
      // Tambahkan sedikit delay agar terasa natural
      await delay(800);
      buddyReply = demoModeAnswer(userText);
    }

    removeTypingIndicator();
    appendMessage('buddy', buddyReply);
    isFirstMessage = false;

  } catch (err) {
    removeTypingIndicator();
    const errText = `Gagal mendapatkan respons. ${err.message || 'Periksa API key dan koneksi internet Anda.'}`;
    appendMessage('buddy', `⚠️ ${errText}`);
    console.error('[Onboarding Buddy] Error:', err);
  } finally {
    // Aktifkan kembali input
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/**
 * Helper: menunggu sejumlah milidetik (untuk demo delay).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================
   SECTION 7: Hapus Percakapan
   ============================================================ */

/**
 * Membersihkan area chat dan mereset riwayat percakapan.
 */
function clearChat() {
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '';
  chatHistory = [];
  isFirstMessage = true;

  // Tampilkan kembali welcome message
  appendWelcomeMessage();
}

/**
 * Menampilkan pesan sambutan awal dari Buddy.
 */
function appendWelcomeMessage() {
  const company = knowledgeData?.company || 'PT Nusantara Teknologi';
  appendMessage(
    'buddy',
    `Halo! 👋 Selamat datang di ${company}!\n\nSaya **Onboarding Buddy**, asisten virtual Anda untuk masa onboarding. Saya siap membantu menjawab pertanyaan seputar kebijakan, fasilitas, dan prosedur perusahaan.\n\nAda yang ingin Anda tanyakan?`
  );
}

/* ============================================================
   SECTION 8: Manajemen API Key
   ============================================================ */

/**
 * Memperbarui variabel apiKey dari input dan memperbarui UI badge.
 */
function updateApiKey() {
  const keyInput = document.getElementById('api-key-input');
  apiKey = keyInput ? keyInput.value.trim() : '';
  updateDemoBadge();
}

/**
 * Menampilkan atau menyembunyikan badge Demo Mode sesuai status API key.
 */
function updateDemoBadge() {
  const badge   = document.getElementById('demo-badge');
  const modeLabel = document.getElementById('mode-label');
  if (!badge) return;

  if (apiKey.trim()) {
    badge.classList.add('hidden');
    if (modeLabel) modeLabel.textContent = 'Mode: LLM API';
  } else {
    badge.classList.remove('hidden');
    if (modeLabel) modeLabel.textContent = 'Mode: Demo';
  }
}

/**
 * Toggle visibilitas API key input (show/hide password).
 */
function toggleApiKeyVisibility() {
  const keyInput   = document.getElementById('api-key-input');
  const toggleBtn  = document.getElementById('toggle-key-btn');
  if (!keyInput) return;

  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    toggleBtn.textContent = '🙈';
    toggleBtn.setAttribute('aria-label', 'Sembunyikan API key');
  } else {
    keyInput.type = 'password';
    toggleBtn.textContent = '👁️';
    toggleBtn.setAttribute('aria-label', 'Tampilkan API key');
  }
}

/* ============================================================
   SECTION 9: Error Display
   ============================================================ */

/**
 * Menampilkan pesan error inline di bawah input chat.
 * @param {string} message
 */
function showInlinError(message) {
  clearInlineError();
  const container = document.getElementById('chat-error-container');
  if (!container) return;
  const el = document.createElement('p');
  el.className = 'error-msg';
  el.id = 'inline-error';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  container.appendChild(el);
}

/**
 * Menghapus pesan error inline.
 */
function clearInlineError() {
  const el = document.getElementById('inline-error');
  if (el) el.remove();
}

/* ============================================================
   SECTION 10: Checklist Onboarding
   ============================================================ */

/** Kunci localStorage untuk menyimpan status checklist */
const CHECKLIST_STORAGE_KEY = 'onboarding_buddy_checklist';

/** Daftar tugas onboarding minggu pertama */
const CHECKLIST_TASKS = [
  { id: 'task_1',  text: 'Ambil laptop dan perangkat kerja di IT Helpdesk' },
  { id: 'task_2',  text: 'Aktivasi akun email kantor' },
  { id: 'task_3',  text: 'Daftar dan aktifkan autentikasi dua faktor (2FA)' },
  { id: 'task_4',  text: 'Baca dan tandatangani Employee Handbook' },
  { id: 'task_5',  text: 'Perkenalkan diri ke tim dan atasan langsung' },
  { id: 'task_6',  text: 'Login ke HR Portal (hrportal.nusantekno.id)' },
  { id: 'task_7',  text: 'Ikuti sesi orientasi onboarding perusahaan' },
  { id: 'task_8',  text: 'Pastikan mesin fingerprint absensi terdaftar' },
  { id: 'task_9',  text: 'Pelajari platform LMS internal (learning.nusantekno.id)' },
  { id: 'task_10', text: 'Konfirmasi jadwal evaluasi probasi dengan atasan' }
];

/**
 * Memuat status checklist dari localStorage.
 * @returns {Object} Map taskId → boolean (true = selesai)
 */
function loadChecklistState() {
  try {
    const saved = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

/**
 * Menyimpan status checklist ke localStorage.
 * @param {Object} state - Map taskId → boolean
 */
function saveChecklistState(state) {
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[Onboarding Buddy] Gagal menyimpan checklist:', err);
  }
}

/**
 * Merender semua item checklist ke DOM.
 */
function renderChecklist() {
  const container = document.getElementById('checklist-container');
  if (!container) return;

  const state = loadChecklistState();
  container.innerHTML = '';

  CHECKLIST_TASKS.forEach((task) => {
    const isChecked = !!state[task.id];

    const item = document.createElement('div');
    item.className = `checklist-item flex items-center gap-3 px-4 py-3 rounded-lg ${isChecked ? 'completed' : ''}`;
    item.dataset.taskId = task.id;

    item.innerHTML = `
      <input
        type="checkbox"
        id="${task.id}"
        name="${task.id}"
        ${isChecked ? 'checked' : ''}
        aria-label="${task.text}"
      >
      <label for="${task.id}" class="text-sm flex-1">${task.text}</label>
    `;

    // Listener: update state saat checkbox berubah
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => handleChecklistChange(task.id, checkbox.checked, item));

    container.appendChild(item);
  });

  updateProgressBar(state);
}

/**
 * Handler saat checklist item dicentang/di-uncentang.
 *
 * @param {string} taskId
 * @param {boolean} checked
 * @param {HTMLElement} itemEl - Elemen DOM item checklist
 */
function handleChecklistChange(taskId, checked, itemEl) {
  const state = loadChecklistState();
  state[taskId] = checked;
  saveChecklistState(state);

  // Update visual
  if (checked) {
    itemEl.classList.add('completed');
  } else {
    itemEl.classList.remove('completed');
  }

  updateProgressBar(state);
}

/**
 * Memperbarui progress bar dan teks persentase.
 * @param {Object} state - Map taskId → boolean
 */
function updateProgressBar(state) {
  const total     = CHECKLIST_TASKS.length;
  const done      = CHECKLIST_TASKS.filter(t => !!state[t.id]).length;
  const pct       = Math.round((done / total) * 100);

  const barFill   = document.getElementById('progress-fill');
  const barLabel  = document.getElementById('progress-label');
  const barCount  = document.getElementById('progress-count');

  if (barFill) {
    barFill.style.width = `${pct}%`;
    // Update ARIA progressbar value untuk aksesibilitas
    const barEl = barFill.parentElement;
    if (barEl) barEl.setAttribute('aria-valuenow', pct);
  }
  if (barLabel) barLabel.textContent = `${pct}%`;
  if (barCount) barCount.textContent = `${done} dari ${total} tugas selesai`;

  // Tampilkan pesan selamat jika semua selesai
  const congrats = document.getElementById('checklist-congrats');
  if (congrats) {
    if (done === total) {
      congrats.classList.remove('hidden');
    } else {
      congrats.classList.add('hidden');
    }
  }
}

/**
 * Mereset semua checklist ke kondisi awal (belum dicentang).
 */
function resetChecklist() {
  if (!confirm('Yakin ingin mereset semua checklist ke kondisi awal?')) return;
  localStorage.removeItem(CHECKLIST_STORAGE_KEY);
  renderChecklist();
}

/* ============================================================
   SECTION 11: Tab Navigation
   ============================================================ */

/**
 * Beralih antara tab Chat dan tab Checklist.
 * @param {'chat'|'checklist'} tabName
 */
function switchTab(tabName) {
  const chatPanel      = document.getElementById('panel-chat');
  const checklistPanel = document.getElementById('panel-checklist');
  const tabChat        = document.getElementById('tab-chat');
  const tabChecklist   = document.getElementById('tab-checklist');

  if (tabName === 'chat') {
    chatPanel.classList.remove('hidden');
    checklistPanel.classList.add('hidden');
    tabChat.classList.add('active');
    tabChecklist.classList.remove('active');
  } else {
    chatPanel.classList.add('hidden');
    checklistPanel.classList.remove('hidden');
    tabChat.classList.remove('active');
    tabChecklist.classList.add('active');
    // Re-render checklist setiap kali tab dibuka agar selalu sinkron
    renderChecklist();
  }
}

/* ============================================================
   SECTION 12: Auto-resize Textarea
   ============================================================ */

/**
 * Menyesuaikan tinggi textarea dengan konten.
 * @param {HTMLTextAreaElement} textarea
 */
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/* ============================================================
   SECTION 13: Quick Questions
   ============================================================ */

/**
 * Mengisi input chat dengan pertanyaan cepat dan langsung mengirim.
 * @param {string} question
 */
function askQuickQuestion(question) {
  const input = document.getElementById('chat-input');
  input.value = question;
  autoResizeTextarea(input);
  handleSendMessage();
}

/* ============================================================
   SECTION 14: Init — Dipanggil saat DOM siap
   ============================================================ */

/**
 * Fungsi inisialisasi utama.
 * Urutan: load knowledge → setup event listeners → render UI awal.
 */
async function init() {
  // 1. Load knowledge base
  await loadKnowledge();

  // 2. Tampilkan welcome message
  appendWelcomeMessage();

  // 3. Update badge demo mode (karena API key kosong saat awal)
  updateDemoBadge();

  // 4. Event: kirim pesan via tombol
  document.getElementById('send-btn').addEventListener('click', handleSendMessage);

  // 5. Event: kirim pesan via Enter (Shift+Enter = newline)
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // 6. Event: auto-resize textarea
  document.getElementById('chat-input').addEventListener('input', (e) => {
    autoResizeTextarea(e.target);
    clearInlineError();
  });

  // 7. Event: hapus percakapan
  document.getElementById('clear-chat-btn').addEventListener('click', clearChat);

  // 8. Event: API key input (update saat mengetik atau blur)
  const keyInput = document.getElementById('api-key-input');
  if (keyInput) {
    keyInput.addEventListener('input',  updateApiKey);
    keyInput.addEventListener('change', updateApiKey);
  }

  // 9. Event: toggle visibilitas API key
  const toggleKeyBtn = document.getElementById('toggle-key-btn');
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  }

  // 10. Event: tab navigation
  document.getElementById('tab-chat').addEventListener('click',      () => switchTab('chat'));
  document.getElementById('tab-checklist').addEventListener('click', () => switchTab('checklist'));

  // 11. Event: reset checklist
  const resetBtn = document.getElementById('reset-checklist-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetChecklist);

  // 12. Event: quick question buttons (delegasi dari container)
  document.getElementById('quick-questions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-question]');
    if (btn) askQuickQuestion(btn.dataset.question);
  });

  // 13. Render checklist (load state dari localStorage)
  renderChecklist();

  console.log('[Onboarding Buddy] Aplikasi siap!');
}

// Mulai saat DOM selesai dimuat
document.addEventListener('DOMContentLoaded', init);
