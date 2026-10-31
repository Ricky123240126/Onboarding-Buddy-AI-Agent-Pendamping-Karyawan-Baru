# Onboarding Buddy 🤝

Asisten virtual interaktif untuk karyawan baru **PT Nusantara Teknologi**.  
Dibangun dengan **HTML + Tailwind CSS + Vanilla JavaScript** — tanpa framework, tanpa build tool.

---

## 📁 Struktur File

```
onboarding-buddy/
├── index.html       # Halaman utama (UI, markup semantik)
├── style.css        # Custom styles (animasi, bubble chat, dll.)
├── script.js        # Logika utama (chat, checklist, LLM, demo mode)
├── prompt.js        # System prompt AI Agent (mudah diedit)
├── knowledge.json   # Data FAQ PT Nusantara Teknologi
└── README.md        # Dokumentasi ini
```

---

## 🚀 Cara Menjalankan

### Opsi 1 — Langsung buka file (paling mudah)

> ⚠️ Browser modern memblokir `fetch()` ke file lokal karena kebijakan CORS.  
> Gunakan salah satu opsi di bawah agar `knowledge.json` dapat dimuat dengan benar.

### Opsi 2 — VS Code Live Server (direkomendasikan untuk pemula)

1. Install ekstensi **Live Server** di VS Code.
2. Klik kanan `index.html` → **Open with Live Server**.
3. Browser akan membuka `http://127.0.0.1:5500/index.html` secara otomatis.

### Opsi 3 — Python HTTP Server

```bash
# Python 3
python -m http.server 8080

# Lalu buka: http://localhost:8080
```

### Opsi 4 — Node.js `npx serve`

```bash
npx serve .

# Lalu buka URL yang ditampilkan di terminal
```

---

## ⚙️ Konfigurasi API Key (Opsional)

Aplikasi berjalan dalam **Demo Mode** secara otomatis tanpa API key.

Untuk mengaktifkan mode LLM penuh:

1. Buka panel **"Pengaturan API Key"** di bagian atas halaman.
2. Masukkan API key Anda dari [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
3. API key hanya disimpan di **memori browser** dan akan terhapus saat halaman di-refresh.

> **Model yang digunakan:** `gpt-4o-mini` (hemat dan cepat).  
> Untuk mengubah model, edit baris `model: 'gpt-4o-mini'` di `script.js`.

---

## 💡 Demo Mode

Bila API key tidak diisi, aplikasi otomatis menggunakan **Demo Mode**:
- Menjawab berdasarkan **pencocokan kata kunci** dari `knowledge.json`.
- Tidak memerlukan koneksi internet ke API.
- Cocok untuk demo, testing, atau saat tidak memiliki API key.

---

## ✏️ Mengubah System Prompt

Edit file **`prompt.js`** untuk menyesuaikan:
- Nada dan gaya bicara Buddy
- Batasan topik yang boleh dijawab
- Format jawaban (poin, nomor, dll.)

---

## 📚 Menambah Data FAQ

Edit file **`knowledge.json`** — tambahkan objek baru ke dalam array `faqs`:

```json
{
  "id": 13,
  "category": "Nama Kategori",
  "keywords": ["kata kunci 1", "kata kunci 2"],
  "question": "Pertanyaan yang sering ditanyakan?",
  "answer": "Jawaban lengkap di sini."
}
```

---

## 🎯 Fitur Utama

| Fitur | Keterangan |
|---|---|
| 💬 **Chat AI** | Tanya jawab berbasis knowledge base perusahaan |
| ⚡ **Demo Mode** | Berfungsi tanpa API key via pencocokan kata kunci |
| 🤖 **Mode LLM** | Jawaban natural via OpenAI API |
| ✅ **Checklist** | 10 tugas onboarding minggu pertama |
| 📊 **Progress Bar** | Persentase tugas yang sudah selesai |
| 💾 **localStorage** | Progress checklist tersimpan otomatis |
| 🔑 **API Key aman** | Key hanya di memori, tidak di-persist |
| 📱 **Responsif** | Tampilan optimal di mobile dan desktop |

---

## ❓ 5 Contoh Pertanyaan & Jawaban yang Diharapkan

### 1. Jam Kerja

**Pertanyaan:**  
> "Jam kerja di kantor mulai jam berapa?"

**Jawaban yang diharapkan:**  
> Jam kerja di PT Nusantara Teknologi adalah **Senin–Jumat, pukul 08.00–17.00 WIB**, dengan istirahat pukul 12.00–13.00 WIB. Khusus Jumat, istirahat diperpanjang hingga pukul 13.30 WIB untuk shalat Jumat. Lembur wajib mendapat persetujuan atasan dan akan dikompensasi sesuai peraturan ketenagakerjaan.

---

### 2. Cara Mengajukan Cuti

**Pertanyaan:**  
> "Bagaimana cara mengajukan cuti tahunan?"

**Jawaban yang diharapkan:**  
> Pengajuan cuti dilakukan melalui sistem **HR Portal** di https://hrportal.nusantekno.id minimal **3 hari kerja** sebelum tanggal cuti. Cuti tahunan diberikan sebanyak **12 hari kerja per tahun** setelah masa probasi 3 bulan. Cuti sakit memerlukan surat dokter jika lebih dari 2 hari.

---

### 3. Aktivasi Email Kantor

**Pertanyaan:**  
> "Bagaimana cara aktivasi akun email kantor saya?"

**Jawaban yang diharapkan:**  
> Akun email berformat `nama.lengkap@nusantekno.id` disiapkan oleh tim IT. Anda akan menerima email aktivasi ke alamat pribadi pada hari pertama kerja. Langkah: (1) Buka tautan aktivasi, (2) Buat password baru, (3) Aktifkan 2FA menggunakan Google Authenticator. Hubungi IT Helpdesk di `it@nusantekno.id` atau ext. 101 jika ada kendala.

---

### 4. Kontak HRD

**Pertanyaan:**  
> "Saya ingin menghubungi HRD, nomor teleponnya berapa?"

**Jawaban yang diharapkan:**  
> Tim HRD dapat dihubungi melalui:  
> - Email: hrd@nusantekno.id  
> - Telepon: (021) 5555-1234 ext. 200  
> - WhatsApp: 0812-3456-7890 (jam kerja)  
> - Ruangan: Lantai 3, Gedung A

---

### 5. Pertanyaan di Luar Knowledge Base

**Pertanyaan:**  
> "Apakah ada program beasiswa untuk karyawan?"

**Jawaban yang diharapkan:**  
> Maaf, informasi mengenai hal tersebut belum tersedia di sistem saya. Silakan hubungi tim HRD langsung di hrd@nusantekno.id atau telepon (021) 5555-1234 ext. 200 untuk informasi lebih lanjut. 😊

---

## 🛠️ Teknologi yang Digunakan

- **HTML5** — Markup semantik (header, main, section, nav, article)
- **Tailwind CSS v3** (via CDN) — Utility-first CSS framework
- **Vanilla JavaScript (ES2020)** — Tanpa framework, tanpa build tool
- **localStorage** — Menyimpan progress checklist
- **Fetch API** — Memanggil OpenAI API
- **OpenAI Chat Completions API** — Model `gpt-4o-mini`

---

## 📌 Catatan Pengembangan

- Seluruh kode menggunakan **komentar inline** untuk memudahkan pemahaman pemula.
- Pemanggilan LLM diisolasi dalam fungsi `callLLM()` di `script.js` agar mudah diganti provider.
- System prompt diisolasi di `prompt.js` agar dapat diedit tanpa menyentuh logika aplikasi.
- Demo Mode aktif otomatis bila `apiKey` kosong — tidak perlu konfigurasi tambahan.
- Tidak ada dependensi eksternal selain Tailwind CDN dan Google Fonts.

---

*Dibuat untuk PT Nusantara Teknologi — Internal Use Only*
