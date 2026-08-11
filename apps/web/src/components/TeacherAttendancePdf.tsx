import { useEffect, useState } from 'react';
import { Check, ChevronRight, ClipboardCheck, Download } from 'lucide-react';
import { api } from '../api';

export default function TeacherAttendancePdf() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState(1);
  const [register, setRegister] = useState<any>();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/attendance/teacher/classes').then((response) => {
      setAssignments(response.data);
      if (response.data[0]) setSelected(response.data[0].id);
    }).catch(() => setError('Unable to load assigned classes.'));
  }, []);

  const assignment = assignments.find((item) => item.id === selected);
  const load = async () => {
    if (!assignment) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/attendance/register', { params: { classId: assignment.classId, subjectId: assignment.subjectId, date, period } });
      setRegister(response.data);
      setStatuses(Object.fromEntries(response.data.students.map((student: any) => [student.id, response.data.session?.records.find((record: any) => record.studentId === student.id)?.status || 'PRESENT'])));
    } catch (requestError: any) {
      setRegister(undefined);
      setError(requestError.response?.data?.message || 'Unable to load students for this class.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selected, date, period, assignments.length]);

  const submit = async () => {
    setError('');
    setMessage('');
    try {
      await api.post('/attendance/submit', { classId: assignment.classId, subjectId: assignment.subjectId, date, period, records: register.students.map((student: any) => ({ studentId: student.id, status: statuses[student.id] })) });
      setMessage('Attendance submitted, locked, and saved as PDF.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Attendance could not be submitted.');
    }
  };

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/attendance/session/${register.session.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = register.session.pdfFileName || 'attendance.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Attendance PDF could not be downloaded.');
    }
  };

  return <div className="portal-content">
    <div className="page-title"><div><p>ATTENDANCE REGISTER</p><h1>Mark attendance</h1></div><button className="outline" disabled={!register || register.session?.state === 'SUBMITTED'} onClick={() => setStatuses(Object.fromEntries(register.students.map((student: any) => [student.id, 'PRESENT'])))}><Check /> Mark all present</button></div>
    <div className="filters"><label>Class & subject<select value={selected} onChange={(event) => setSelected(event.target.value)}>{assignments.map((item) => <option key={item.id} value={item.id}>{item.class.name} - {item.class.section} · {item.subject.name}</option>)}</select></label><label>Date<input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} /></label><label>Period<select value={period} onChange={(event) => setPeriod(+event.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    {loading && <div className="empty-card"><ClipboardCheck /><div><b>Loading class roster…</b><p>Please wait while student records are fetched.</p></div></div>}
    {error && <p className="error">{error}</p>}
    {!loading && register && <div className="register"><div className="register-head"><span>{register.students.length} students</span><span>{register.session?.state === 'SUBMITTED' ? `🔒 Submitted register · ${register.session.pdfFileName ? 'PDF ready' : 'Legacy record'}` : 'Draft register'}</span></div>{register.students.map((student: any) => <div className="student-row" key={student.id}><span className="roll">{String(student.rollNo).padStart(2, '0')}</span><div className="mini-avatar">{student.user.name[0]}</div><b>{student.user.name}</b><div className="segmented">{['PRESENT', 'ABSENT', 'LEAVE'].map((value) => <button key={value} className={statuses[student.id] === value ? value.toLowerCase() : ''} disabled={register.session?.state === 'SUBMITTED'} onClick={() => setStatuses({ ...statuses, [student.id]: value })}>{value[0]}<span>{value.slice(1).toLowerCase()}</span></button>)}</div></div>)}<div className="submit-row"><span>{Object.values(statuses).filter((value) => value === 'PRESENT').length} present · {Object.values(statuses).filter((value) => value === 'ABSENT').length} absent · {Object.values(statuses).filter((value) => value === 'LEAVE').length} leave</span>{register.session?.state === 'SUBMITTED' ? register.session.pdfFileName ? <button className="outline" onClick={downloadPdf}><Download /> Download attendance PDF</button> : <span>PDF is available for newly submitted registers.</span> : <button className="primary" onClick={submit}>Submit & save PDF <ChevronRight /></button>}</div>{message && <p className="success notice-success">{message}</p>}</div>}
  </div>;
}
