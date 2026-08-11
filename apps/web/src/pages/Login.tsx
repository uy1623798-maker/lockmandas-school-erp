import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (event: any) => {
    event.preventDefault();
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === 'forgot') {
        const { data } = await api.post('/auth/forgot-password', { email: form.login });
        setMessage(data.message);
        return;
      }
      await login(String(form.login), String(form.password));
      nav('/portal');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Unable to sign in');
    }
  };

  return <main className="login-page">
    <section className="login-art">
      <a className="powered-brand" href="https://www.wetakefwd.online" target="_blank" rel="noreferrer" aria-label="Visit We Take FWD">
        <span className="powered-logo-frame"><img src="/wetakefwd-logo.png" alt="We Take FWD" /></span>
        <small>POWERED BY</small>
        <strong>WeTakeFWD ERP</strong>
        <em>www.wetakefwd.online</em>
      </a>
    </section>
    <section className="login-panel"><div className="login-box">
      <Link className="back" to="/"><ArrowLeft /> Back to school website</Link>
      <p className="eyebrow">SCHOOL ERP PORTAL</p>
      <h2>{mode === 'login' ? 'Welcome back.' : 'Reset your password.'}</h2>
      <p>{mode === 'login' ? 'Students can sign in with their admission number and DOB password.' : 'Enter your registered email and we’ll send reset instructions.'}</p>
      <form onSubmit={submit}>
        <label>Username, email, or admission number<div className="input-icon"><Mail /><input name="login" required placeholder="Student: enter admission number" /></div></label>
        {mode === 'login' && <label>Password<div className="input-icon"><Lock /><input name="password" type={show ? 'text' : 'password'} required placeholder="Student DOB: DDMMYYYY" /><button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</button></div></label>}
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <button className="primary wide">{mode === 'login' ? 'Sign in to portal' : 'Send reset instructions'}</button>
      </form>
      <button className="link-button" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}</button>
      <div className="demo"><b>Student login format</b><span>Admission number + DOB</span><span>Password format: DDMMYYYY</span></div>
    </div></section>
  </main>;
}
