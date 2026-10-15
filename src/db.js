import Dexie from 'dexie'

export const db = new Dexie('RuangAbsenDB')

db.version(1).stores({
  students: '++id, nis, nama, kelas',
  attendance: '++id, studentId, tanggal, [tanggal+studentId], kelas, status',
})

db.version(2).stores({
  students: '++id, nis, nama, kelas',
  attendance: '++id, studentId, tanggal, [tanggal+studentId], kelas, status, waktu',
})

export async function recordAttendance(student, date = localDate()) {
  const existing = await db.attendance
    .where('[tanggal+studentId]')
    .equals([date, student.id])
    .first()

  if (existing) return { alreadyPresent: true, record: existing }

  const record = {
    studentId: student.id,
    nis: student.nis,
    nama: student.nama,
    kelas: student.kelas,
    tanggal: date,
    waktu: new Date().toISOString(),
    status: 'Hadir',
  }
  record.id = await db.attendance.add(record)
  return { alreadyPresent: false, record }
}

export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
