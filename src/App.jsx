import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, FileSpreadsheet,
  FileText, LayoutDashboard, LoaderCircle, Menu, Plus, QrCode, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound, Users, X,
} from 'lucide-react'
import { db, localDate, recordAttendance } from './db'

const navItems = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'siswa', label: 'Data Siswa', icon: Users },
  { id: 'scan', label: 'Scan QR', icon: QrCode },
  { id: 'riwayat', label: 'Riwayat Absensi', icon: CalendarDays },
]

const pad = (value) => String(value).padStart(2, '0')
const shortDate = (date) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
const fullDate = (date) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S'
const avatarColors = ['bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-emerald-100 text-emerald-700']

function IconButton({ children, onClick, className = '', title, disabled = false, type = 'button' }) {
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>{children}</button>
}

function App() {
  const [page, setPage] = useState('dashboard')
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedClass, setSelectedClass] = useState('Semua kelas')
  const [attendanceDate, setAttendanceDate] = useState(localDate())
  const [isStudentModalOpen, setStudentModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [qrStudent, setQrStudent] = useState(null)
  const [qrImage, setQrImage] = useState('')
  const [toast, setToast] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState('')
  const [manualStudentId, setManualStudentId] = useState('')
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyClass, setHistoryClass] = useState('Semua kelas')
  const [historyDate, setHistoryDate] = useState(localDate())
  const scannerRef = useRef(null)
  const fileInputRef = useRef(null)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const refreshData = useCallback(async () => {
    setLoading(true)
    try {
      const [allStudents, allAttendance] = await Promise.all([
        db.students.orderBy('nama').toArray(),
        db.attendance.orderBy('waktu').reverse().toArray(),
      ])
      setStudents(allStudents)
      setAttendance(allAttendance)
    } catch (error) {
      console.error('Gagal membaca data lokal:', error)
      notify('Data tidak dapat dibaca dari penyimpanan browser.', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { refreshData() }, [refreshData])
  useEffect(() => {
    if (!qrStudent) return
    let cancelled = false
    setQrImage('')
    QRCode.toDataURL(`ABSENSI:${qrStudent.nis}`, { width: 320, margin: 2, color: { dark: '#172c46', light: '#ffffff' } })
      .then((image) => {
        if (!cancelled) setQrImage(image)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Gagal membuat QR:', error)
        notify('QR code gagal dibuat.', 'error')
      })
    return () => { cancelled = true }
  }, [qrStudent, notify])

  const classes = useMemo(() => [...new Set(students.map((student) => student.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')), [students])
  const todaysAttendance = useMemo(() => attendance.filter((record) => record.tanggal === localDate()), [attendance])
  const presentStudentIds = useMemo(() => new Set(todaysAttendance.map((record) => record.studentId)), [todaysAttendance])
  const filteredStudents = useMemo(() => students.filter((student) => {
    const matchesQuery = `${student.nama} ${student.nis} ${student.kelas}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (selectedClass === 'Semua kelas' || student.kelas === selectedClass)
  }), [students, query, selectedClass])
  const historyRows = useMemo(() => attendance.filter((record) => {
    const matchesQuery = `${record.nama} ${record.nis} ${record.kelas}`.toLowerCase().includes(historyQuery.toLowerCase())
    return record.tanggal === historyDate && matchesQuery && (historyClass === 'Semua kelas' || record.kelas === historyClass)
  }), [attendance, historyDate, historyQuery, historyClass])
  const classAttendance = useMemo(() => classes.map((kelas) => {
    const classStudents = students.filter((student) => student.kelas === kelas)
    const present = todaysAttendance.filter((record) => record.kelas === kelas).length
    return { kelas, total: classStudents.length, hadir: present, persentase: classStudents.length ? Math.round((present / classStudents.length) * 100) : 0 }
  }), [classes, students, todaysAttendance])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    if (!scanner) return
    try {
      if (scanner.isScanning) await scanner.stop()
      scanner.clear()
    } catch (error) {
      console.warn('Kamera sudah berhenti:', error)
    }
    scannerRef.current = null
  }, [])

  useEffect(() => {
    if (page !== 'scan' || !scannerActive) {
      stopScanner()
      return undefined
    }
    let cancelled = false
    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const scanner = new Html5Qrcode('qr-reader', { verbose: false })
        scannerRef.current = scanner
        const cameras = await Html5Qrcode.getCameras()
        if (cancelled) return
        const camera = cameras.find(({ label }) => /back|rear|environment/i.test(label)) || cameras[0]
        if (!camera) throw new Error('Tidak ada kamera yang tersedia.')
        await scanner.start(
          camera.id,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            const nis = decodedText.trim().replace(/^ABSENSI:/i, '')
            const student = await db.students.where('nis').equals(nis).first()
            if (!student) {
              setScanError(`NIS "${nis}" tidak ditemukan. Pastikan siswa sudah terdaftar.`)
              return
            }
            try {
              const result = await recordAttendance(student)
              await refreshData()
              setScanResult({ student, alreadyPresent: result.alreadyPresent })
              setScanError('')
              if (!result.alreadyPresent) notify(`${student.nama} berhasil tercatat hadir.`)
            } catch (error) {
              console.error('Gagal menyimpan absensi:', error)
              setScanError('Absensi gagal disimpan. Silakan coba kembali.')
            }
          },
          () => {},
        )
      } catch (error) {
        if (cancelled) return
        console.error('Kamera tidak dapat dijalankan:', error)
        setScanError('Kamera tidak dapat diakses. Izinkan akses kamera atau gunakan alamat HTTPS.')
      }
    }
    startScanner()
    return () => {
      cancelled = true
      stopScanner()
    }
  }, [page, scannerActive, stopScanner, refreshData, notify])

  const saveStudent = async (formData) => {
    try {
      const duplicate = await db.students.where('nis').equals(formData.nis).first()
      if (duplicate && duplicate.id !== editingStudent?.id) {
        notify('NIS tersebut sudah digunakan siswa lain.', 'error')
        return false
      }
      if (editingStudent) await db.students.update(editingStudent.id, formData)
      else await db.students.add(formData)
      await refreshData()
      setStudentModalOpen(false)
      setEditingStudent(null)
      notify(editingStudent ? 'Data siswa berhasil diperbarui.' : 'Siswa berhasil ditambahkan.')
      return true
    } catch (error) {
      console.error('Gagal menyimpan siswa:', error)
      notify('Data siswa gagal disimpan.', 'error')
      return false
    }
  }

  const deleteStudent = async (student) => {
    if (!window.confirm(`Hapus ${student.nama} dari data siswa? Riwayat absensinya akan tetap tersimpan.`)) return
    try {
      await db.students.delete(student.id)
      await refreshData()
      notify('Data siswa berhasil dihapus.')
    } catch (error) {
      console.error('Gagal menghapus siswa:', error)
      notify('Data siswa gagal dihapus.', 'error')
    }
  }

  const markStudentPresent = async (student) => {
    try {
      const result = await recordAttendance(student)
      await refreshData()
      setManualStudentId('')
      if (result.alreadyPresent) notify(`${student.nama} sudah tercatat hadir hari ini.`, 'info')
      else {
        setScanResult({ student, alreadyPresent: false })
        notify(`${student.nama} berhasil dicatat hadir.`)
      }
    } catch (error) {
      console.error('Gagal mencatat absensi:', error)
      notify('Absensi gagal dicatat.', 'error')
    }
  }

  const importStudents = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (!rows.length) {
        notify('File Excel tidak berisi data siswa.', 'error')
        return
      }
      const firstRow = rows[0]
      const keys = Object.keys(firstRow)
      const pick = (row, names) => {
        const key = Object.keys(row).find((candidate) => names.includes(candidate.trim().toLowerCase()))
        return key ? String(row[key]).trim() : ''
      }
      if (!keys.some((key) => ['nis', 'nomor induk'].includes(key.trim().toLowerCase())) ||
          !keys.some((key) => ['nama', 'nama siswa'].includes(key.trim().toLowerCase()))) {
        notify('Kolom wajib tidak ditemukan. Gunakan judul kolom NIS, Nama, dan Kelas.', 'error')
        return
      }
      const existing = await db.students.toArray()
      const existingNis = new Set(existing.map((student) => student.nis))
      let added = 0
      let skipped = 0
      for (const row of rows) {
        const nis = pick(row, ['nis', 'nomor induk'])
        const nama = pick(row, ['nama', 'nama siswa'])
        const kelas = pick(row, ['kelas', 'rombel']) || 'Belum diatur'
        if (!nis || !nama || existingNis.has(nis)) {
          skipped += 1
          continue
        }
        await db.students.add({ nis, nama, kelas })
        existingNis.add(nis)
        added += 1
      }
      await refreshData()
      notify(`${added} siswa diimpor${skipped ? `, ${skipped} baris dilewati` : ''}.`)
    } catch (error) {
      console.error('Gagal mengimpor Excel:', error)
      notify('File gagal dibaca. Pastikan formatnya Excel (.xlsx) atau CSV.', 'error')
    } finally {
      event.target.value = ''
    }
  }

  const exportStudents = () => {
    import('xlsx').then((XLSX) => {
      const rows = students.map(({ nis, nama, kelas }) => ({ NIS: nis, Nama: nama, Kelas: kelas }))
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Data Siswa')
      XLSX.writeFile(workbook, `data-siswa-${localDate()}.xlsx`)
    }).catch((error) => {
      console.error('Gagal menyiapkan ekspor siswa:', error)
      notify('Ekspor data siswa gagal.', 'error')
    })
  }

  const exportAttendance = () => {
    import('xlsx').then((XLSX) => {
      const rows = historyRows.map((record) => ({
        Tanggal: record.tanggal,
        Waktu: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(record.waktu)),
        NIS: record.nis,
        Nama: record.nama,
        Kelas: record.kelas,
        Status: record.status,
      }))
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Absensi')
      XLSX.writeFile(workbook, `absensi-${historyDate}.xlsx`)
    }).catch((error) => {
      console.error('Gagal menyiapkan ekspor absensi:', error)
      notify('Ekspor absensi gagal.', 'error')
    })
  }

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const worksheet = XLSX.utils.aoa_to_sheet([['NIS', 'Nama', 'Kelas'], ['2024001', 'Contoh Nama Siswa', '7A']])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Siswa')
      XLSX.writeFile(workbook, 'template-data-siswa.xlsx')
    } catch (error) {
      console.error('Gagal membuat template siswa:', error)
      notify('Template Excel gagal dibuat.', 'error')
    }
  }

  const printQr = () => {
    if (!qrImage || !qrStudent) return
    const popup = window.open('', '_blank', 'width=500,height=620')
    if (!popup) {
      notify('Izinkan pop-up untuk mencetak QR code.', 'error')
      return
    }
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
    popup.document.write(`<html><head><title>Kartu QR ${escapeHtml(qrStudent.nama)}</title><style>body{font-family:Arial,sans-serif;display:grid;place-items:center;min-height:90vh;color:#172c46}.card{text-align:center;border:1px solid #dce5ef;border-radius:20px;padding:28px;width:300px}img{width:230px}h2{margin:12px 0 4px}p{margin:5px;color:#5c6d80}</style></head><body><div class="card"><img src="${qrImage}" alt="QR Code"/><h2>${escapeHtml(qrStudent.nama)}</h2><p>${escapeHtml(qrStudent.nis)} · Kelas ${escapeHtml(qrStudent.kelas)}</p><p>Kartu Absensi Siswa</p></div><script>window.onload=()=>window.print()<\/script></body></html>`)
    popup.document.close()
  }

  const currentNav = navItems.find((item) => item.id === page)

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col bg-[#14283f] px-5 py-6 text-white transition-transform lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#27c3ad] text-[#102b3c]"><QrCode size={22} strokeWidth={2.5} /></div>
          <div><div className="font-display text-[17px] font-extrabold tracking-tight">ruang<span className="text-[#49d6bb]">absen</span></div><div className="mt-0.5 text-[10px] font-semibold tracking-[.17em] text-slate-400">ABSENSI SEKOLAH</div></div>
          <IconButton className="ml-auto text-slate-400 lg:hidden" title="Tutup menu" onClick={() => setMobileMenuOpen(false)}><X size={20} /></IconButton>
        </div>
        <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Menu utama</div>
        <nav className="mt-3 space-y-1.5">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setPage(id); setMobileMenuOpen(false); setScanError('') }} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition ${page === id ? 'bg-[#213b55] text-white shadow-sm' : 'text-slate-400 hover:bg-[#1d354d] hover:text-white'}`}>
              <Icon size={18} className={page === id ? 'text-[#4bd5bd]' : ''} /><span>{label}</span>
              {id === 'scan' && <span className="ml-auto rounded-md bg-[#264d5b] px-2 py-0.5 text-[10px] text-[#67dfc6]">LIVE</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-white"><ShieldCheck size={16} className="text-[#48d2b8]" /> Data aman di perangkat</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">Data tersimpan di browser ini dan tidak dikirim ke server.</p>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 px-2 pt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d9e9ee] text-sm font-bold text-[#28506a]">G</div>
            <div><p className="text-xs font-bold">Guru / Wali Kelas</p><p className="mt-0.5 text-[10px] text-slate-400">Pengelola kelas</p></div>
            <Settings2 size={17} className="ml-auto text-slate-500" />
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <button aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <main className="min-h-screen lg:ml-[256px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-[#f8fafd]/95 px-5 backdrop-blur lg:px-10">
          <div className="flex items-center gap-3">
            <IconButton className="h-10 w-10 border border-slate-200 bg-white text-slate-600 lg:hidden" title="Buka menu" onClick={() => setMobileMenuOpen(true)}><Menu size={19} /></IconButton>
            <div><div className="text-xs text-slate-500">Ruang Guru <span className="mx-1 text-slate-300">/</span> <span className="font-semibold text-slate-700">{currentNav?.label}</span></div><h1 className="mt-0.5 font-display text-[15px] font-bold text-[#23364b] sm:text-[16px]">{currentNav?.label}</h1></div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 sm:flex"><CalendarDays size={15} className="text-[#28a995]" />{shortDate(new Date())}</div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#dce9e9] text-xs font-bold text-[#31586b] shadow-sm">GR</div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-7 lg:px-10 lg:pt-9">
          {page === 'dashboard' && <Dashboard {...{ students, todaysAttendance, presentStudentIds, classAttendance, loading, setPage, setStudentModalOpen, notify }} />}
          {page === 'siswa' && <StudentsPage {...{ students: filteredStudents, allCount: students.length, classes, selectedClass, setSelectedClass, query, setQuery, presentStudentIds, setStudentModalOpen, setEditingStudent, setQrStudent, deleteStudent, fileInputRef, importStudents, exportStudents, downloadTemplate, loading }} />}
          {page === 'scan' && <ScanPage {...{ students, todaysAttendance, scannerActive, setScannerActive, scanResult, setScanResult, scanError, setScanError, manualStudentId, setManualStudentId, markStudentPresent, presentStudentIds }} />}
          {page === 'riwayat' && <HistoryPage {...{ historyRows, historyQuery, setHistoryQuery, historyClass, setHistoryClass, classes, historyDate, setHistoryDate, exportAttendance, attendance }} />}
        </div>
      </main>

      {isStudentModalOpen && <StudentModal student={editingStudent} onClose={() => { setStudentModalOpen(false); setEditingStudent(null) }} onSave={saveStudent} />}
      {qrStudent && <QrModal student={qrStudent} image={qrImage} onClose={() => { setQrStudent(null); setQrImage('') }} onPrint={printQr} />}
      {toast && <div className={`fixed bottom-5 right-5 z-[70] flex max-w-[calc(100vw-40px)] items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.type === 'error' ? 'bg-rose-600' : toast.type === 'info' ? 'bg-slate-700' : 'bg-[#183d48]'}`}><CheckCircle2 size={17} />{toast.message}</div>}
    </div>
  )
}

function Dashboard({ students, todaysAttendance, presentStudentIds, classAttendance, loading, setPage, setStudentModalOpen }) {
  const absent = Math.max(students.length - todaysAttendance.length, 0)
  const rate = students.length ? Math.round((todaysAttendance.length / students.length) * 100) : 0
  return <>
    <section className="relative overflow-hidden rounded-[24px] bg-[#18364d] px-6 py-7 text-white shadow-[0_16px_40px_-25px_rgba(16,47,70,.65)] sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full border-[32px] border-white/[.035]" />
      <div className="pointer-events-none absolute right-28 top-20 h-28 w-28 rounded-full border-[18px] border-[#46cbb6]/10" />
      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#79d9c7]"><Sparkles size={14} /> SELAMAT DATANG DI RUANG ABSEN</div>
          <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight sm:text-[30px]">Halo, Bapak/Ibu Guru <span className="inline-block">👋</span></h2>
          <p className="mt-2 text-sm text-slate-300">Pantau kehadiran siswa hari ini dengan lebih mudah.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.08] px-3 py-2 text-xs text-slate-200"><CalendarDays size={14} className="text-[#60d7c3]" />{fullDate(new Date())}</div>
        </div>
        <button onClick={() => setPage('scan')} className="flex w-fit items-center gap-2.5 rounded-xl bg-[#47d0b8] px-5 py-3 text-[13px] font-bold text-[#123243] shadow-lg shadow-[#122a3f]/30 transition hover:bg-[#69dfc9]"><QrCode size={18} /> Mulai Scan Absensi <ChevronRight size={16} /></button>
      </div>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Users} label="Total Siswa" value={students.length} note="Siswa terdaftar" tone="blue" />
      <StatCard icon={CheckCircle2} label="Hadir Hari Ini" value={todaysAttendance.length} note={`${rate}% dari total siswa`} tone="green" />
      <StatCard icon={Clock3} label="Belum Hadir" value={absent} note="Perlu konfirmasi" tone="amber" />
      <StatCard icon={Activity} label="Persentase Hadir" value={`${rate}%`} note="Kehadiran hari ini" tone="purple" progress={rate} />
    </section>

    <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-display text-[15px] font-bold">Kehadiran per Kelas</h3><p className="mt-1 text-xs text-slate-500">Ringkasan kehadiran hari ini</p></div>
          <button onClick={() => setPage('riwayat')} className="text-xs font-bold text-[#208d83] hover:text-[#176d68]">Lihat riwayat <ChevronRight size={14} className="ml-1 inline" /></button>
        </div>
        {!classAttendance.length ? <EmptyState icon={Users} title="Belum ada data kelas" detail="Tambahkan siswa untuk melihat ringkasan kehadiran." action="Tambah siswa" onAction={() => setStudentModalOpen(true)} /> :
          <div className="mt-5 space-y-4">{classAttendance.slice(0, 5).map((row) => <div key={row.kelas} className="grid grid-cols-[70px_1fr_65px] items-center gap-3 sm:grid-cols-[90px_1fr_90px]"><div className="text-xs font-bold text-slate-700">Kelas {row.kelas}</div><div><div className="mb-1.5 flex justify-between text-[10px] text-slate-500"><span>{row.hadir} dari {row.total} siswa</span><span className="font-bold text-slate-700">{row.persentase}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#36bda9] transition-all" style={{ width: `${row.persentase}%` }} /></div></div><div className="text-right text-[10px] text-slate-400">{row.total - row.hadir} belum hadir</div></div>)}</div>
        }
      </section>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)] sm:p-6">
        <div className="flex items-start justify-between"><div><h3 className="font-display text-[15px] font-bold">Aktivitas Terbaru</h3><p className="mt-1 text-xs text-slate-500">Siswa yang baru saja hadir</p></div><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><Activity size={17} /></div></div>
        {!todaysAttendance.length ? <div className="py-9 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300"><Clock3 size={22} /></div><p className="mt-3 text-xs font-semibold text-slate-500">Belum ada absensi hari ini</p><p className="mt-1 text-[11px] text-slate-400">Hasil scan akan tampil di sini.</p></div> :
          <div className="mt-4 space-y-1">{todaysAttendance.slice(0, 5).map((record, index) => <div key={record.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${avatarColors[index % avatarColors.length]}`}>{initials(record.nama)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-700">{record.nama}</p><p className="mt-0.5 text-[10px] text-slate-400">Kelas {record.kelas}</p></div><div className="text-right"><p className="text-[11px] font-bold text-slate-700">{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.waktu))}</p><p className="mt-0.5 text-[10px] text-emerald-600">Hadir</p></div></div>)}</div>
        }
        <button onClick={() => setPage('riwayat')} className="mt-3 w-full rounded-lg border border-slate-100 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50">Lihat semua aktivitas <ChevronRight size={14} className="ml-1 inline" /></button>
      </section>
    </div>
    <p className="mt-5 flex items-center gap-2 text-[11px] text-slate-400"><ShieldCheck size={14} className="text-[#27a996]" /> Data absensi tersimpan secara lokal di browser perangkat ini.</p>
  </>
}

function StatCard({ icon: Icon, label, value, note, tone, progress }) {
  const tones = {
    blue: ['bg-blue-50 text-blue-600', 'text-[#2c6fa5]'],
    green: ['bg-emerald-50 text-emerald-600', 'text-[#22957e]'],
    amber: ['bg-amber-50 text-amber-600', 'text-[#b7822a]'],
    purple: ['bg-violet-50 text-violet-600', 'text-[#7863b6]'],
  }
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)]"><div className="flex items-center justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone][0]}`}><Icon size={19} /></div>{progress !== undefined && <div className="h-9 w-9 rounded-full border-[3px] border-slate-100 p-[5px]"><div className="h-full rounded-full border-2 border-[#8b7ad0]" /></div>}</div><p className="mt-4 text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 flex items-baseline gap-2"><span className={`font-display text-[25px] font-extrabold ${tones[tone][1]}`}>{value}</span></div><p className="mt-1 text-[10px] text-slate-400">{note}</p></div>
}

function EmptyState({ icon: Icon, title, detail, action, onAction }) {
  return <div className="py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300"><Icon size={22} /></div><p className="mt-3 text-sm font-bold text-slate-600">{title}</p><p className="mt-1 text-xs text-slate-400">{detail}</p>{action && <button onClick={onAction} className="mt-4 rounded-lg bg-[#e6f6f2] px-4 py-2 text-xs font-bold text-[#188675]">{action}</button>}</div>
}

function StudentsPage({ students, allCount, classes, selectedClass, setSelectedClass, query, setQuery, presentStudentIds, setStudentModalOpen, setEditingStudent, setQrStudent, deleteStudent, fileInputRef, importStudents, exportStudents, downloadTemplate, loading }) {
  return <>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm text-slate-500">Kelola daftar siswa dan kartu QR untuk absensi kelas.</p><p className="mt-2 text-xs font-semibold text-slate-400">{allCount} siswa terdaftar <span className="mx-1.5 text-slate-300">·</span> {classes.length} kelas</p></div>
      <button onClick={() => { setEditingStudent(null); setStudentModalOpen(true) }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1c9b8b] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#168476]"><Plus size={16} /> Tambah Siswa</button>
    </div>
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-0 flex-1 xl:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau NIS siswa..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#40b9a8] focus:ring-2 focus:ring-[#40b9a8]/10" /></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-600 outline-none focus:border-[#40b9a8]"><option>Semua kelas</option>{classes.map((kelas) => <option key={kelas}>{kelas}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></div>
          <button onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><FileSpreadsheet size={15} /> Template</button>
          <button onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><ArrowUpFromLine size={15} /> Impor Excel</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importStudents} />
          <button onClick={exportStudents} disabled={!allCount} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ArrowDownToLine size={15} /> Ekspor</button>
        </div>
      </div>
      <div className="soft-scroll overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[.08em] text-slate-400"><tr><th className="px-5 py-3.5">Siswa</th><th className="px-4 py-3.5">NIS</th><th className="px-4 py-3.5">Kelas</th><th className="px-4 py-3.5">Status Hari Ini</th><th className="px-5 py-3.5 text-right">Aksi</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.map((student, index) => <tr key={student.id} className="transition hover:bg-slate-50/70"><td className="px-5 py-3"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${avatarColors[index % avatarColors.length]}`}>{initials(student.nama)}</div><span className="text-xs font-bold text-slate-700">{student.nama}</span></div></td><td className="px-4 py-3 text-xs text-slate-500">{student.nis}</td><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{student.kelas}</span></td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${presentStudentIds.has(student.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${presentStudentIds.has(student.id) ? 'bg-emerald-500' : 'bg-slate-400'}`} />{presentStudentIds.has(student.id) ? 'Hadir' : 'Belum hadir'}</span></td><td className="px-5 py-3"><div className="flex justify-end gap-1"><IconButton title="Lihat QR Code" onClick={() => setQrStudent(student)} className="h-8 w-8 text-[#219989] hover:bg-emerald-50"><QrCode size={16} /></IconButton><IconButton title="Edit siswa" onClick={() => { setEditingStudent(student); setStudentModalOpen(true) }} className="h-8 w-8 text-slate-500 hover:bg-slate-100"><Settings2 size={15} /></IconButton><IconButton title="Hapus siswa" onClick={() => deleteStudent(student)} className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></IconButton></div></td></tr>)}</tbody>
        </table>
        {loading ? <div className="flex justify-center py-12"><LoaderCircle className="animate-spin text-[#279b8d]" /></div> : students.length === 0 ? <EmptyState icon={Users} title={allCount ? 'Siswa tidak ditemukan' : 'Belum ada data siswa'} detail={allCount ? 'Coba ubah kata kunci atau filter kelas.' : 'Tambahkan siswa satu per satu atau impor dari Excel.'} action={!allCount ? 'Tambah siswa pertama' : undefined} onAction={() => { setEditingStudent(null); setStudentModalOpen(true) }} /> : null}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400"><span>Menampilkan {students.length} dari {allCount} siswa</span><span>Data disimpan lokal</span></div>
    </div>
  </>
}

function ScanPage({ students, todaysAttendance, scannerActive, setScannerActive, scanResult, setScanResult, scanError, setScanError, manualStudentId, setManualStudentId, markStudentPresent, presentStudentIds }) {
  const selectedStudent = students.find((student) => String(student.id) === manualStudentId)
  return <>
    <div className="mb-6"><p className="text-sm text-slate-500">Arahkan kamera ke kartu QR siswa untuk mencatat kehadiran.</p></div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)] sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="font-display text-[15px] font-bold">Pemindai QR Code</h2><p className="mt-1 text-xs text-slate-500">Gunakan kamera perangkat untuk memindai kartu siswa.</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${scannerActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{scannerActive ? 'KAMERA AKTIF' : 'KAMERA NONAKTIF'}</span></div>
        <div className="mt-5 overflow-hidden rounded-2xl bg-[#14283f] p-3 sm:p-5">
          <div className="relative mx-auto min-h-[280px] max-w-[520px] overflow-hidden rounded-xl bg-[#0d1b29]">
            <div id="qr-reader" className="scan-frame w-full" />
            {!scannerActive && <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center text-white"><div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-[#62d9c5]"><QrCode size={30} /></div><p className="mt-4 text-sm font-bold">Siap memindai QR</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-slate-400">Pastikan kamera terhubung dan pencahayaan cukup.</p></div>}
          </div>
          <button onClick={() => { setScanResult(null); setScanError(''); setScannerActive(!scannerActive) }} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition ${scannerActive ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-[#4bd0b9] text-[#17384a] hover:bg-[#65ddc7]'}`}>{scannerActive ? <><X size={16} /> Matikan Kamera</> : <><QrCode size={16} /> Aktifkan Kamera</>}</button>
          {scanError && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{scanError}</div>}
          {scanResult && <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={18} /></div><div className="min-w-0"><p className="text-xs font-bold text-emerald-800">{scanResult.alreadyPresent ? 'Sudah tercatat hadir' : 'Absensi berhasil!'}</p><p className="mt-0.5 truncate text-[11px] text-emerald-700">{scanResult.student.nama} · {scanResult.student.nis} · Kelas {scanResult.student.kelas}</p></div><button onClick={() => setScanResult(null)} className="ml-auto text-emerald-600"><X size={15} /></button></div>}
          <p className="mt-3 text-center text-[10px] text-slate-400">Kamera hanya dapat digunakan di HTTPS atau localhost.</p>
        </div>
      </section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)] sm:p-6"><div className="flex items-center gap-2"><UserRound size={17} className="text-[#239a8b]" /><h2 className="font-display text-[14px] font-bold">Absensi Manual</h2></div><p className="mt-1 text-xs text-slate-500">Pilih siswa jika kamera tidak tersedia.</p><div className="relative mt-4"><select value={manualStudentId} onChange={(event) => setManualStudentId(event.target.value)} className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-xs outline-none focus:border-[#40b9a8]"><option value="">Pilih nama siswa...</option>{students.map((student) => <option key={student.id} value={student.id} disabled={presentStudentIds.has(student.id)}>{student.nama} · {student.nis} · {student.kelas}{presentStudentIds.has(student.id) ? ' (Hadir)' : ''}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></div><button disabled={!selectedStudent || presentStudentIds.has(selectedStudent?.id)} onClick={() => selectedStudent && markStudentPresent(selectedStudent)} className="mt-3 w-full rounded-lg bg-[#1c9b8b] py-3 text-xs font-bold text-white transition hover:bg-[#168476] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">Catat Kehadiran</button></section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)] sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-[14px] font-bold">Hadir Hari Ini</h2><p className="mt-1 text-xs text-slate-500">Daftar siswa yang sudah absen</p></div><span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">{todaysAttendance.length} siswa</span></div>{!todaysAttendance.length ? <p className="py-8 text-center text-xs text-slate-400">Belum ada siswa yang hadir.</p> : <div className="soft-scroll mt-3 max-h-[250px] divide-y divide-slate-100 overflow-y-auto">{todaysAttendance.map((record, index) => <div key={record.id} className="flex items-center gap-3 py-3"><div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${avatarColors[index % avatarColors.length]}`}>{initials(record.nama)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{record.nama}</p><p className="mt-0.5 text-[10px] text-slate-400">{record.nis} · Kelas {record.kelas}</p></div><span className="text-[10px] font-semibold text-emerald-600">{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(record.waktu))}</span></div>)}</div>}</section>
      </div>
    </div>
  </>
}

function HistoryPage({ historyRows, historyQuery, setHistoryQuery, historyClass, setHistoryClass, classes, historyDate, setHistoryDate, exportAttendance, attendance }) {
  const presentCount = historyRows.length
  return <>
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm text-slate-500">Lihat dan unduh catatan kehadiran siswa.</p><p className="mt-2 text-xs text-slate-400">{attendance.length} catatan tersimpan di perangkat ini</p></div><button onClick={exportAttendance} disabled={!historyRows.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"><Download size={15} /> Ekspor Excel</button></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-3"><StatCard icon={CheckCircle2} label="Siswa Hadir" value={presentCount} note={`Pada ${shortDate(new Date(`${historyDate}T00:00:00`))}`} tone="green" /><StatCard icon={CalendarDays} label="Tanggal Dipilih" value={new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(`${historyDate}T00:00:00`))} note={new Intl.DateTimeFormat('id-ID', { year: 'numeric' }).format(new Date(`${historyDate}T00:00:00`))} tone="blue" /><StatCard icon={Users} label="Kelas Terdaftar" value={classes.length} note="Dengan catatan absensi" tone="purple" /></div>
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_22px_-18px_rgba(27,48,70,.4)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Cari nama atau NIS siswa..." className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#40b9a8]" /></div>
        <div className="flex flex-wrap gap-2"><input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value || localDate())} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 outline-none focus:border-[#40b9a8]" /><select value={historyClass} onChange={(event) => setHistoryClass(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-[#40b9a8]"><option>Semua kelas</option>{classes.map((kelas) => <option key={kelas}>{kelas}</option>)}</select></div>
      </div>
      <div className="soft-scroll overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[.08em] text-slate-400"><tr><th className="px-5 py-3.5">Siswa</th><th className="px-4 py-3.5">NIS</th><th className="px-4 py-3.5">Kelas</th><th className="px-4 py-3.5">Waktu</th><th className="px-5 py-3.5">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{historyRows.map((record, index) => <tr key={record.id} className="hover:bg-slate-50/70"><td className="px-5 py-3"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${avatarColors[index % avatarColors.length]}`}>{initials(record.nama)}</div><span className="text-xs font-bold">{record.nama}</span></div></td><td className="px-4 py-3 text-xs text-slate-500">{record.nis}</td><td className="px-4 py-3 text-xs text-slate-500">{record.kelas}</td><td className="px-4 py-3 text-xs text-slate-500">{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(record.waktu))}</td><td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Hadir</span></td></tr>)}</tbody></table>{!historyRows.length && <EmptyState icon={FileText} title="Belum ada catatan absensi" detail="Belum ada siswa yang tercatat hadir pada tanggal ini." />}</div>
      <div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400">Menampilkan {historyRows.length} catatan absensi</div>
    </section>
  </>
}

function StudentModal({ student, onClose, onSave }) {
  const [nis, setNis] = useState(student?.nis || '')
  const [nama, setNama] = useState(student?.nama || '')
  const [kelas, setKelas] = useState(student?.kelas || '')
  const [saving, setSaving] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (!nis.trim() || !nama.trim() || !kelas.trim()) return
    setSaving(true)
    const saved = await onSave({ nis: nis.trim(), nama: nama.trim(), kelas: kelas.trim() })
    setSaving(false)
    if (!saved) return
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-bold">{student ? 'Edit Data Siswa' : 'Tambah Siswa'}</h2><p className="mt-1 text-xs text-slate-500">Lengkapi informasi siswa di bawah ini.</p></div><IconButton type="button" onClick={onClose} className="h-8 w-8 text-slate-400 hover:bg-slate-100" title="Tutup"><X size={18} /></IconButton></div><div className="mt-5 space-y-4"><label className="block text-xs font-bold text-slate-600">NIS<input autoFocus value={nis} onChange={(event) => setNis(event.target.value)} placeholder="Contoh: 2024001" className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#40b9a8] focus:ring-2 focus:ring-[#40b9a8]/10" /></label><label className="block text-xs font-bold text-slate-600">Nama Lengkap<input value={nama} onChange={(event) => setNama(event.target.value)} placeholder="Nama lengkap siswa" className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#40b9a8] focus:ring-2 focus:ring-[#40b9a8]/10" /></label><label className="block text-xs font-bold text-slate-600">Kelas<input value={kelas} onChange={(event) => setKelas(event.target.value)} placeholder="Contoh: 7A" className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#40b9a8] focus:ring-2 focus:ring-[#40b9a8]/10" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button><button disabled={saving || !nis.trim() || !nama.trim() || !kelas.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#1c9b8b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#168476] disabled:opacity-50">{saving && <LoaderCircle size={14} className="animate-spin" />}{student ? 'Simpan Perubahan' : 'Simpan Siswa'}</button></div></form></div>
}

function QrModal({ student, image, onClose, onPrint }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"><div className="flex justify-end"><IconButton onClick={onClose} className="h-8 w-8 text-slate-400 hover:bg-slate-100" title="Tutup"><X size={18} /></IconButton></div><h2 className="font-display text-lg font-bold">Kartu QR Siswa</h2><p className="mt-1 text-xs text-slate-500">Tunjukkan kode ini saat melakukan absensi.</p><div className="mx-auto mt-4 flex h-[240px] w-[240px] items-center justify-center rounded-2xl border border-slate-100 bg-white p-2">{image ? <img src={image} alt={`QR Code ${student.nama}`} className="h-full w-full" /> : <LoaderCircle className="animate-spin text-slate-300" />}</div><p className="mt-4 font-display text-base font-bold">{student.nama}</p><p className="mt-1 text-xs text-slate-500">{student.nis} <span className="mx-1 text-slate-300">·</span> Kelas {student.kelas}</p><button disabled={!image} onClick={onPrint} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1c9b8b] py-3 text-xs font-bold text-white hover:bg-[#168476] disabled:opacity-50"><FileText size={15} /> Cetak Kartu QR</button></div></div>
}

export default App
