import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, GraduationCap, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';

type AccessKind = 'student' | 'teacher' | 'admin' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'forgot' | 'admin'>('login');
  const [showFor, setShowFor] = useState<string>();
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (event: any, kind: AccessKind) => {
    event.preventDefault();
    setErrors((current) => ({ ...current, [kind]: '' }));
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (kind === 'forgot') {
        const { data } = await api.post('/auth/forgot-password', { email: form.login });
        setMessage(data.message);
        return;
      }
      await login(String(form.login), String(form.password));
      nav('/portal');
    } catch (requestError: any) {
      setErrors((current) => ({ ...current, [kind]: requestError.response?.data?.message || 'Unable to sign in' }));
    }
  };

  const accessCards = [
    { kind: 'student' as const, title: 'Student Login', Icon: UserRound, label: 'Admission number', placeholder: 'Enter admission number', password: 'Student DOB: DDMMYYYY', note: 'Use admission number and date of birth.' },
    { kind: 'teacher' as const, title: 'Teacher Login', Icon: GraduationCap, label: 'Teacher ID', placeholder: 'Enter Teacher ID', password: 'Teacher DOB: DDMMYYYY', note: 'Use Teacher ID and date of birth.' },
  ];

  return <main className="login-page">
    <section className="login-art">
      <a className="powered-brand" href="https://www.wetakefwd.online" target="_blank" rel="noreferrer" aria-label="Visit We Take FWD">
        <span className="powered-logo-frame"><img src="/wetakefwd-3d-symbol.png" alt="We Take FWD 3D symbol" /></span>
        <small>POWERED BY</small>
        <strong>WeTakeFWD ERP</strong>
        <em>www.wetakefwd.online</em>
      </a>
    </section>
    <section className="login-panel"><div className={`login-box ${mode === 'login' ? 'login-box-wide' : ''}`}>
      <Link className="back" to="/"><ArrowLeft /> Back to school website</Link>
      <p className="eyebrow">SCHOOL ERP PORTAL</p>
      <h2>{mode === 'login' ? 'Choose your portal.' : mode === 'admin' ? 'Administrator login.' : 'Reset your password.'}</h2>
      <p>{mode === 'login' ? 'Students and teachers have separate secure sign-in boxes.' : mode === 'admin' ? 'Sign in with the administrator username or email.' : 'Enter your registered email and we’ll send reset instructions.'}</p>
      {mode === 'login' ? <>
        <div className="login-access-grid">
          {accessCards.map(({ kind, title, Icon, label, placeholder, password, note }) => <article className={`access-card ${kind}`} key={kind}>
            <div className="access-card-head"><span><Icon /></span><div><h3>{title}</h3><p>{note}</p></div></div>
            <form onSubmit={(event) => submit(event, kind)}>
              <label>{label}<div className="input-icon"><Mail /><input name="login" required autoComplete="username" placeholder={placeholder} /></div></label>
              <label>Password<div className="input-icon"><Lock /><input name="password" type={showFor === kind ? 'text' : 'password'} required autoComplete="current-password" placeholder={password} /><button type="button" aria-label={`Show ${kind} password`} onClick={() => setShowFor(showFor === kind ? undefined : kind)}>{showFor === kind ? <EyeOff /> : <Eye />}</button></div></label>
              {errors[kind] && <p className="error">{errors[kind]}</p>}
              <button className="primary wide">Sign in as {kind}</button>
            </form>
          </article>)}
        </div>
        <div className="login-secondary-actions"><button className="link-button" onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot your password?</button><button className="link-button admin-link" onClick={() => setMode('admin')}><ShieldCheck /> Administrator login</button></div>
      </> : <>
        <form onSubmit={(event) => submit(event, mode === 'admin' ? 'admin' : 'forgot')}>
          <label>{mode === 'admin' ? 'Administrator username or email' : 'Registered email'}<div className="input-icon"><Mail /><input name="login" required autoComplete="username" placeholder={mode === 'admin' ? 'Enter admin username' : 'Enter registered email'} /></div></label>
          {mode === 'admin' && <label>Password<div className="input-icon"><Lock /><input name="password" type={showFor === 'admin' ? 'text' : 'password'} required autoComplete="current-password" placeholder="Enter administrator password" /><button type="button" aria-label="Show administrator password" onClick={() => setShowFor(showFor === 'admin' ? undefined : 'admin')}>{showFor === 'admin' ? <EyeOff /> : <Eye />}</button></div></label>}
          {errors[mode] && <p className="error">{errors[mode]}</p>}
          {message && <p className="success">{message}</p>}
          <button className="primary wide">{mode === 'admin' ? 'Sign in as administrator' : 'Send reset instructions'}</button>
        </form>
        <button className="link-button" onClick={() => { setMode('login'); setMessage(''); }}>Back to student & teacher login</button>
      </>}
    </div></section>
  </main>;
}
