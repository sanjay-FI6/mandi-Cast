import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown, Heart, Home as HomeIcon, Info, Leaf, LocateFixed, MapPin, MessageCircle, Send, Sprout, TrendingUp, UserRound, Users, X } from 'lucide-react';
import { clearUser, getUser, saveUser } from './auth';
import { copy, languages } from './data';
import { fetchCrops, fetchMarkets, fetchTrends, money } from './api';
import './styles.css';
import './enhanced.css';

// Live backend replaces data.js's static crops/markets arrays.
// Default market + coordinates used until real geolocation/market-picking is added.
const DEFAULT_MARKET = 'Mattuthavani Mandi';
const DEFAULT_LAT = 9.9252;
const DEFAULT_LNG = 78.1198;

const emptyCrop = (id) => ({ id, name: id, icon: '🌾', price: 0, change: 0, recommendation: 'WAIT', confidence: 0 });
const emptyMarket = { id: '', name: 'Loading...', city: '', state: '', distance: null, prices: {} };

const cropById = (crops, id) => crops.find((crop) => crop.id === id) || emptyCrop(id);
const marketById = (markets, id) => markets.find((market) => market.id === id) || markets[0] || emptyMarket;

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('mandi-mitra-language') || 'English');
  const [user, setUser] = useState(getUser);
  const [cropId, setCropId] = useState('tomato');
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('mandi-mitra-saved') || '{"crops":[],"markets":[]}'));
  const [crops, setCrops] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const t = copy[language];

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2500); };
  const changeLanguage = (value) => { setLanguage(value); localStorage.setItem('mandi-mitra-language', value); notify(value === 'English' ? 'Language changed' : value === 'தமிழ்' ? 'மொழி மாற்றப்பட்டது' : 'भाषा बदल गई'); };
  const login = (nextUser) => { saveUser(nextUser); setUser(nextUser); };
  const logout = () => { clearUser(); setUser(null); notify('Logged out'); };
  const toggleSaved = (type, id) => { const next = { ...saved, [type]: saved[type].includes(id) ? saved[type].filter((item) => item !== id) : [...saved[type], id] }; setSaved(next); localStorage.setItem('mandi-mitra-saved', JSON.stringify(next)); notify(next[type].includes(id) ? 'Saved' : 'Removed'); };

  // Live crops (prices + AI recommendation) for the default market - powers Home/Dashboard/Fpo.
  useEffect(() => {
    let cancelled = false;
    fetchCrops(DEFAULT_MARKET)
      .then((data) => { if (!cancelled) setCrops(data); })
      .catch((err) => console.error('Failed to load crops', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Live markets for the currently selected crop - refetches whenever cropId changes.
  useEffect(() => {
    let cancelled = false;
    fetchMarkets(cropId, DEFAULT_LAT, DEFAULT_LNG)
      .then((data) => { if (!cancelled) setMarkets(data); })
      .catch((err) => console.error('Failed to load markets', err));
    return () => { cancelled = true; };
  }, [cropId]);

  if (loading) {
    return <div className="app-shell"><div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading live mandi prices...</div></div>;
  }

  return <div className="app-shell"><Header t={t} language={language} changeLanguage={changeLanguage} user={user} logout={logout} /><main><Routes>
    <Route path="/" element={<Home t={t} cropId={cropId} setCropId={setCropId} notify={notify} user={user} crops={crops} markets={markets} />} />
    <Route path="/login" element={<Auth mode="login" t={t} onLogin={login} notify={notify} />} />
    <Route path="/signup" element={<Auth mode="signup" t={t} onLogin={login} notify={notify} />} />
    <Route path="/markets" element={<Markets t={t} cropId={cropId} setCropId={setCropId} notify={notify} crops={crops} />} />
    <Route path="/markets/:id" element={<MarketDetails t={t} cropId={cropId} setCropId={setCropId} crops={crops} markets={markets} />} />
    <Route path="/dashboard" element={<Dashboard t={t} user={user} saved={saved} toggleSaved={toggleSaved} notify={notify} crops={crops} markets={markets} logout={logout} cropId={cropId} setCropId={setCropId} />} />
    <Route path="/trends" element={<Trends t={t} crop={cropById(crops, cropId)} cropId={cropId} market={markets[0]?.name || DEFAULT_MARKET} />} />
    <Route path="/fpo" element={<Fpo t={t} notify={notify} crops={crops} markets={markets} />} />
    <Route path="/about" element={<About t={t} />} />
  </Routes></main><Footer t={t} /><BottomNav t={t} user={user} />{toast && <div className="toast"><Check size={16} /> {toast}</div>}</div>;
}

function Header({ t, language, changeLanguage, user, logout }) { return <header className="topbar"><Link to="/" className="brand"><span className="brand-mark"><Sprout size={22} /></span><span>Mandi <b>Cast</b></span></Link><nav className="desktop-nav"><NavLink to="/">{t.check}</NavLink><NavLink to="/markets">{t.markets}</NavLink><NavLink to="/trends">{t.trends}</NavLink><NavLink to="/about">{t.how}</NavLink></nav><div className="top-actions"><label className="language"><span>🌐</span><select value={language} onChange={(event) => changeLanguage(event.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>{user ? <><Link to="/dashboard" className="profile-chip"><span>{user.name?.[0] || 'U'}</span>{user.name || 'Profile'}</Link><button className="text-button" onClick={logout} style={{ marginLeft: 8 }}>{t.logout}</button></> : <Link className="desktop-login" to="/login">{t.login}</Link>}</div></header>; }
function BottomNav({ t, user }) { return <nav className="bottom-nav"><NavLink to="/"><HomeIcon size={18} /><span>{t.check}</span></NavLink><NavLink to="/markets"><MapPin size={18} /><span>{t.markets}</span></NavLink><NavLink to="/trends"><TrendingUp size={18} /><span>{t.trends}</span></NavLink><NavLink to={user ? '/dashboard' : '/about'}>{user ? <UserRound size={18} /> : <Info size={18} />}<span>{user ? t.dashboard : t.how}</span></NavLink></nav>; }
function Footer({ t }) { return <footer style={{ maxWidth:1320, margin:'0 auto', padding:'20px 30px 90px', display:'flex', justifyContent:'space-between', gap:16, color:'var(--muted)', fontSize:11 }}><span><Sprout size={16} /> Mandi Cast</span><small>AI-powered mandi intelligence for farmers · Demo Prototype · 2026</small></footer>; }
function PageTitle({ eyebrow, title, description }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }

function AnimatedPrice({ value }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useState(() => ({ current: value }))[0];
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    const duration = 550;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(Math.round(display))}</>;
}
function CropPicker({ cropId, setCropId, crops }) { return <div className="crop-scroller">{crops.map((crop) => <button key={crop.id} className={`crop-card ${cropId === crop.id ? 'selected' : ''}`} onClick={() => setCropId(crop.id)}><span className="crop-icon">{crop.icon}</span><span>{crop.name}</span>{cropId === crop.id && <Check size={16} />}</button>)}</div>; }

function Home({ t, cropId, setCropId, notify, user, crops, markets }) {
  const crop = cropById(crops, cropId);
  const selected = markets[0] || emptyMarket;
  const best = markets.length ? markets.reduce((a, b) => (b.prices[cropId] > a.prices[cropId] ? b : a), markets[0]) : emptyMarket;
  return <div className="page home-page"><section className="landing-hero"><div className="hero-copy"><p className="eyebrow">🌾 {t.check}</p><h1>{t.hero}</h1><p>{t.sub}</p><div className="hero-actions"><Link className="primary-button" to="#price">{t.cta} <ArrowUpRight size={17} /></Link><Link className="outline-button" to={user ? '/dashboard' : '/login'}>{user ? t.dashboard : t.login}</Link></div><div className="landing-points"><span><Check size={15} /> {t.sell}</span><span><MapPin size={15} /> {t.nearby}</span></div></div><div className="hero-visual"><span className="sun" /><div /></div></section><section id="price"><div className="section-heading"><div><span className="eyebrow">{t.crop}</span><h2>{t.selling || 'Choose your crop'}</h2></div></div><CropPicker cropId={cropId} setCropId={setCropId} crops={crops} /></section><section className="location-strip"><MapPin size={21} /><div><span>{t.location}</span><strong>{selected.name}</strong><small>{selected.city}, {selected.state}</small></div><Link className="outline-button" to="/markets">{t.markets}</Link></section><Recommendation crop={crop} price={selected.prices[cropId] ?? crop.price} t={t} /><NearbySection t={t} crop={crop} cropId={cropId} setCropId={setCropId} crops={crops} markets={markets} /><BestPlace t={t} crop={crop} best={best} base={selected} /><section className="home-grid lower-grid"><SellingSnapshot price={selected.prices[cropId] ?? crop.price} best={best.prices[cropId] ?? crop.price} /><TrendCard crop={crop} /></section><section className="trust-band"><div><MessageCircle size={20} /><strong>{t.alerts}</strong><p>Save your crops and receive useful price updates on your phone.</p></div><Link className="primary-button" to={user ? '/dashboard' : '/login'}>{user ? t.dashboard : 'Login for alerts'}</Link></section></div>;
}

function Recommendation({ crop, price, t }) {
  const sell = crop.recommendation === 'SELL';
  return <section className={`recommendation ${sell ? 'sell' : 'wait'}`}><div className="card-top"><span className="eyebrow">AI Market Insight</span><span className="updated"><span className="status-dot" /> Live prediction</span></div><div className="advice-main"><div><span className="advice-label">{sell ? '↑' : '→'} {sell ? t.sell : t.wait}</span><h2>{money(price)} <small>/ quintal</small></h2><p>{sell ? 'Prices are rising and are expected to remain strong over the next few days.' : 'Prices may improve soon. Waiting a few days may bring a better return.'}</p></div><div className="advice-orbit"><span>{crop.confidence}%</span><small>{t.confidence}</small></div></div><div className="confidence"><div><span>{t.confidence}</span><b>{crop.confidence}%</b></div><div className="confidence-bar"><i style={{ width: `${crop.confidence}%` }} /></div></div></section>;
}

function NearbySection({ t, crop, cropId, setCropId, crops, markets }) {
  const nearby = markets.slice(0, 3);
  const bestPrice = nearby.length ? Math.max(...nearby.map((market) => market.prices[cropId])) : 0;
  return <section className="section-band"><div className="section-heading"><div><span className="eyebrow">{t.location}</span><h2>{t.nearby}</h2><p className="lede">{t.nearbySub}</p></div><Link to="/markets" className="text-button">{t.view}</Link></div><CropPicker cropId={cropId} setCropId={setCropId} crops={crops} /><div className="market-grid">{nearby.map((market) => <MarketCard key={market.id} market={market} crop={crop} cropId={cropId} best={market.prices[cropId] === bestPrice} t={t} />)}</div></section>;
}

function MarketCard({ market, crop, cropId, best, t }) {
  const price = market.prices[cropId];
  return <article className={`market-card ${best ? 'best' : ''}`}><div className="market-top"><span className="crop-icon">{crop.icon}</span>{best && <em className="best-badge">🏆 BEST PRICE</em>}</div><h3>{market.name}</h3><p><MapPin size={12} /> {market.city}, {market.state}</p><div className="market-price">{money(price)} <small>/quintal</small></div><div className="market-meta"><span className="positive">↑ {crop.change}% today</span><span>{market.distance != null ? `${market.distance} km away` : '—'}</span></div><Link className="outline-button" to={`/markets/${market.id}`}>{t.view} <ArrowUpRight size={14} /></Link></article>;
}

function BestPlace({ t, crop, best, base }) {
  const difference = (best.prices[crop.id] ?? 0) - (base.prices[crop.id] ?? 0);
  return <section className="dashboard-card best-place"><div><span className="eyebrow">{t.best}</span><h2>{best.name}</h2><p>{best.distance != null ? `${best.distance} km away · ` : ''}{best.city}, {best.state}</p><strong>{money(best.prices[crop.id] ?? 0)} <small>/ quintal</small></strong></div><div className="potential"><span>Potential extra income</span><b>10 \u00d7 {money(difference)} = {money(difference * 10)}</b><small>Transport costs may reduce the final difference.</small></div></section>;
}

function SellingSnapshot({ price, best }) {
  const [quantity, setQuantity] = useState(10);
  return <section className="snapshot"><div className="card-top"><div><span className="eyebrow">🌾 Selling snapshot</span><h2>How much are you selling?</h2></div><input aria-label="Quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} /><span className="unit">quintals</span></div><div className="earnings"><div><span>Current value</span><b>{money(quantity * price)}</b></div><div><span>Best market</span><b>{money(quantity * best)}</b></div></div></section>;
}

function TrendCard({ crop }) { return <section className="trend-card"><div className="card-top"><div><span className="eyebrow">Price this week</span><h2>{money(crop.price)}</h2></div><span className="positive">↑ {crop.change}%</span></div><div className="mini-chart-placeholder"><span>▁▂▃▅▆▇</span></div></section>; }
function PriceSummary({ t, crop, price }) { return <div className="price-summary"><span className="eyebrow">{t.today}</span><strong>{money(price)} <small>/ quintal</small></strong><span className="positive">↑ {crop.change}% today</span></div>; }

function Markets({ t, cropId, setCropId, crops }) {
  const [sort, setSort] = useState('best');
  const [located, setLocated] = useState('Madurai, Tamil Nadu');
  const [markets, setMarkets] = useState([]);
  const crop = cropById(crops, cropId);

  useEffect(() => {
    let cancelled = false;
    fetchMarkets(cropId, DEFAULT_LAT, DEFAULT_LNG).then((data) => { if (!cancelled) setMarkets(data); }).catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [cropId]);

  const list = [...markets];
  if (sort === 'nearest') list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  if (sort === 'increase' || sort === 'best') list.sort((a, b) => b.prices[cropId] - a.prices[cropId]);
  const bestPrice = list.length ? Math.max(...list.map((market) => market.prices[cropId])) : 0;
  const useLocation = () => navigator.geolocation?.getCurrentPosition(() => setLocated('Your current location'), () => setLocated('Madurai, Tamil Nadu')) || setLocated('Madurai, Tamil Nadu');

  return <div className="page inner-page"><PageTitle eyebrow="Location-aware market intelligence" title={t.markets} description={t.nearbySub} /><div className="location-card"><LocateFixed size={22} /><div><strong>{located}</strong><small>{t.location}</small></div><button onClick={useLocation}>{t.useLocation}</button></div><div className="market-toolbar"><CropPicker cropId={cropId} setCropId={setCropId} crops={crops} /><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="best">Best Price</option><option value="nearest">Nearest</option><option value="increase">Highest Increase</option></select></div><div className="market-grid">{list.map((market) => <MarketCard key={market.id} market={market} crop={crop} cropId={cropId} best={market.prices[cropId] === bestPrice} t={t} />)}</div></div>;
}

function MarketDetails({ t, cropId, setCropId, crops, markets }) {
  const { id } = useParams();
  const crop = cropById(crops, cropId);
  const market = marketById(markets, id);
  const price = market.prices[cropId] ?? 0;
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    if (!market.name) return;
    let cancelled = false;
    fetchTrends(cropId, market.name, 30).then((data) => { if (!cancelled) setTrend(data); }).catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [cropId, market.name]);

  return <div className="page inner-page"><Link to="/markets" className="text-button">← {t.markets}</Link><div className="detail-header"><div><PageTitle eyebrow="Market detail" title={market.name} description={`📍 ${market.city}, ${market.state}${market.distance != null ? ` · ${market.distance} km from you` : ''}`} /></div><PriceSummary t={t} crop={crop} price={price} /></div><CropPicker cropId={cropId} setCropId={setCropId} crops={crops} /><section className="large-chart"><div className="chart-heading"><div><span className="eyebrow">30 day trend</span><h2>{money(trend ? trend.current : price)} <small>current price</small></h2></div></div><div className="large-chart-wrap"><Sparkline points={trend ? trend.days.map((d) => d.price) : null} height={160} color="#174A32" /></div></section><div className="metric-grid"><div className="metric"><span>Average (30d)</span><b>{trend ? money(trend.average) : '—'}</b></div><div className="metric"><span>Today</span><b className="positive">+{crop.change}%</b></div><div className="metric"><span>Market status</span><b>Open today</b></div></div><h2 className="subheading">{t.nearby}</h2><div className="market-grid">{markets.slice(0, 3).map((item, index) => <MarketCard key={item.id} market={item} crop={crop} cropId={cropId} best={item.id === id || index === 0} t={t} />)}</div></div>;
}

const API_BASE = 'http://127.0.0.1:8000';

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`; // assume Indian number if no country code given
  return `+${digits}`;
}

function Auth({ mode, t, onLogin, notify }) {
  const [step, setStep] = useState(mode === 'login' ? 'form' : 'signup');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendOtp = async () => {
    setError('');
    const normalized = normalizePhone(phone);
    if (normalized.replace('+', '').length < 10) {
      setError('Enter a valid mobile number.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send code');
      setPhone(normalized);
      setStep('otp');
      setResendIn(30);
      notify('Verification code sent');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    setError('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit code.');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Incorrect code');
      onLogin({ name: name.trim() || phone, phone, village: 'Madurai', crop: 'tomato' });
      notify('Mobile number verified');
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const submit = () => {
    if (step === 'form' || step === 'signup') { sendOtp(); return; }
    verify();
  };

  return <div className="auth-shell"><div className="auth-art"><Link className="brand" to="/"><span className="brand-mark"><Sprout size={22} /></span><span>Mandi <b>Cast</b></span></Link><div><h1>Smart prices.<br />Better decisions.</h1><p>Built for the people who grow India's food.</p></div><div className="hero-visual"><span className="sun" /></div></div><div className="auth-form"><h1>{step === 'otp' ? t.otp : mode === 'login' ? `${t.welcome} 👋` : `${t.create} 🌾`}</h1><p>{step === 'otp' ? `${t.sent} ${phone}` : mode === 'login' ? t.sub : 'Save your crops, mandis and useful price alerts.'}</p>{error && <p style={{ color: '#b42318', fontSize: 13, margin: '4px 0 0' }}>{error}</p>}{step === 'otp' ? <><div className="otp-row">{[0, 1, 2, 3, 4, 5].map((i) => <input key={i} maxLength="1" value={otp[i] || ''} onChange={(e) => setOtp(otp.slice(0, i) + e.target.value.replace(/\D/g, '') + otp.slice(i + 1))} aria-label={`OTP digit ${i + 1}`} />)}</div><button className="primary-button wide-button" onClick={submit} disabled={verifying}>{verifying ? 'Verifying...' : t.verify}</button><button className="outline-button wide-button" onClick={sendOtp} disabled={resendIn > 0 || sending}>{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}</button></> : <>{<div className="form-field"><label>{t.name}</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" /></div>}<div className="form-field"><label>{t.mobile}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" /></div>{mode === 'signup' && <><div className="form-field"><label>{t.village}</label><input placeholder="Madurai" /></div><div className="form-field"><label>{t.crop}</label><select><option>🍅 Tomato</option><option>🧅 Onion</option><option>🌾 Wheat</option></select></div><div className="form-field"><label>{t.language}</label><select><option>\u0ba4\u0bae\u0bbf\u0bb4\u0bcd</option><option>English</option><option>\u0939\u093f\u0902\u0926\u0940</option></select></div></>}<button className="primary-button wide-button" onClick={submit} disabled={sending}>{sending ? 'Sending code...' : mode === 'login' ? t.continue : t.create}</button><div className="auth-divider">OR</div><button className="outline-button wide-button">Continue with Google</button><p className="auth-switch">{mode === 'login' ? 'New to Mandi Cast?' : 'Already have an account?'} <Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? t.signup : t.login}</Link></p></>}</div></div>;
}

function Sparkline({ points, height = 44, color = '#FAEEDA' }) {
  const ref = React.useRef(null);
  const d = React.useMemo(() => {
    if (!points || points.length < 2) return '';
    const min = Math.min(...points), max = Math.max(...points), range = (max - min) || 1;
    return points.map((v, i) => {
      const x = (i / (points.length - 1)) * 216 + 2;
      const y = 40 - ((v - min) / range) * 34;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [points]);

  useEffect(() => {
    const line = ref.current;
    if (!line || !d) return;
    const len = line.getTotalLength();
    line.style.transition = 'none';
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    line.getBoundingClientRect();
    line.style.transition = 'stroke-dashoffset 0.7s cubic-bezier(.22,1,.36,1)';
    line.style.strokeDashoffset = 0;
  }, [d]);

  if (!d) return <div style={{ height, margin: '12px 0 10px' }} />;
  return <svg viewBox="0 0 220 44" preserveAspectRatio="none" style={{ width: '100%', height, margin: '12px 0 10px' }} aria-hidden="true"><polyline ref={ref} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={d} /></svg>;
}

function useCountUp(target, duration = 550) {
  const [value, setValue] = useState(target);
  const fromRef = React.useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Dashboard({ t, user, saved, toggleSaved, notify, crops, markets, logout, cropId, setCropId }) {
  const crop = cropById(crops, cropId);
  const [selectedMarketId, setSelectedMarketId] = useState(() => localStorage.getItem('mandi-mitra-selected-market') || '');
  const [trend, setTrend] = useState(null);
  const [fading, setFading] = useState(false);
  const [alert, setAlert] = useState(false);

  const market = markets.find((m) => m.id === selectedMarketId) || markets[0] || emptyMarket;
  const best = markets.length ? markets.reduce((a, b) => ((b.prices[cropId] ?? 0) > (a.prices[cropId] ?? 0) ? b : a), markets[0]) : emptyMarket;

  useEffect(() => { if (!selectedMarketId && markets.length) setSelectedMarketId(markets[0].id); }, [markets, selectedMarketId]);

  // Pull the real 7-day history for the sparkline whenever crop or market changes.
  useEffect(() => {
    if (!market.name || market.name === 'Loading...') return;
    let cancelled = false;
    setFading(true);
    fetchTrends(cropId, market.name, 7)
      .then((res) => { if (!cancelled) setTrend(res); })
      .catch(() => { if (!cancelled) setTrend(null); })
      .finally(() => { if (!cancelled) setTimeout(() => setFading(false), 170); });
    return () => { cancelled = true; };
  }, [cropId, market.name]);

  const marketPrice = market.prices[cropId] ?? crop.price ?? 0;
  const bestPrice = best.prices[cropId] ?? crop.price ?? 0;
  const animatedPrice = useCountUp(marketPrice);
  const animatedBest = useCountUp(bestPrice);

  const selectMarket = (id) => { setSelectedMarketId(id); localStorage.setItem('mandi-mitra-selected-market', id); };

  if (!user) return <div className="page inner-page" style={{ textAlign: 'center' }}><div style={{ width: 52, height: 52, borderRadius: '50%', background: '#174A32', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Leaf size={24} color="#FAEEDA" /></div><h1 style={{ margin: '0 0 6px' }}>Your dashboard is waiting</h1><p style={{ color: 'var(--muted)', maxWidth: 340, margin: '0 auto 28px' }}>Login to save crops, get sell alerts by SMS, and see your personal market snapshot.</p><div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}><div className="metric" style={{ width: 150, textAlign: 'left' }}><Heart size={18} color="#174A32" /><div style={{ fontWeight: 600, marginTop: 8 }}>Saved crops</div><small style={{ color: 'var(--muted)' }}>One tap away</small></div><div className="metric" style={{ width: 150, textAlign: 'left' }}><Bell size={18} color="#174A32" /><div style={{ fontWeight: 600, marginTop: 8 }}>SMS alerts</div><small style={{ color: 'var(--muted)' }}>Sent when it's time</small></div><div className="metric" style={{ width: 150, textAlign: 'left' }}><TrendingUp size={18} color="#174A32" /><div style={{ fontWeight: 600, marginTop: 8 }}>Snapshot</div><small style={{ color: 'var(--muted)' }}>Best price and advice</small></div></div><Link className="primary-button" to="/login">{t.login}</Link></div>;

  const points = trend ? trend.days.map((d) => d.price) : null;
  const weekChange = points && points.length > 1 ? ((points[points.length - 1] - points[0]) / points[0]) * 100 : null;
  const up = weekChange != null && weekChange >= 0;
  const sell = crop.recommendation === 'SELL';
  const gap = bestPrice - marketPrice;

  return <div className="page inner-page">
    <style>{`
      @keyframes mc-in { to { opacity: 1; transform: translateY(0); } }
      .mc-market { flex: 0 0 176px; border: 0.5px solid #E5E1D6; border-radius: 12px; padding: 14px; background: #fff; cursor: pointer; position: relative; opacity: 0; transform: translateY(8px); animation: mc-in .45s cubic-bezier(.22,1,.36,1) forwards; transition: transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s, border-color .3s; }
      .mc-market:hover { transform: translateY(-2px); }
      .mc-market.selected { border: 2px solid #174A32; transform: translateY(-5px) scale(1.03); box-shadow: 0 12px 28px rgba(23,74,50,.18); }
      .mc-btn { width: 100%; margin-top: 10px; font-size: 12px; padding: 7px 0; border-radius: 8px; border: .5px solid #C9C5B8; background: transparent; color: #17301F; transition: background .3s, color .3s, border-color .3s; }
      .mc-market.selected .mc-btn { background: #174A32; color: #FAEEDA; border-color: transparent; }
      .mc-tag { position: absolute; top: 10px; right: 10px; font-size: 10px; font-weight: 600; padding: 3px 7px; border-radius: 999px; background: #FAEEDA; color: #854F0B; }
      .mc-card { transition: opacity .35s ease; }
      .mc-card.fade { opacity: 0; }
    `}</style>

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}><PageTitle eyebrow={`${t.welcome}, ${user.name} 👋`} title={t.dashboard} description={t.snapshot} /><button className="outline-button" onClick={logout} style={{ whiteSpace: 'nowrap' }}>{t.logout}</button></div>

    <div style={{ marginBottom: 20 }}><CropPicker cropId={cropId} setCropId={setCropId} crops={crops} /></div>

    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><span className="eyebrow">Choose your market</span><small style={{ color: 'var(--muted)' }}>{markets.length} markets</small></div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 4px 12px' }}>{markets.map((m, i) => { const isSelected = m.id === selectedMarketId; return <div key={m.id} className={`mc-market${isSelected ? ' selected' : ''}`} style={{ animationDelay: `${i * 70}ms` }} onClick={() => selectMarket(m.id)}>{m.id === best.id && <span className="mc-tag">Best price</span>}<div style={{ fontWeight: 600 }}>{m.name}</div><small style={{ color: 'var(--muted)' }}>{m.city}</small><div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>{money(m.prices[cropId] ?? 0)}</div><button className="mc-btn" onClick={(e) => { e.stopPropagation(); selectMarket(m.id); }}>{isSelected ? 'Selected' : 'Select'}</button></div>; })}</div>
    </div>

    <div className="dash-grid">
      <div className={`dashboard-card mc-card${fading ? ' fade' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{crop.icon} {crop.name}</div><small style={{ opacity: 0.85 }}>{market.name} · {market.city}</small></div>
          {weekChange != null && <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999, background: 'rgba(250,238,218,.15)', color: '#FAEEDA', whiteSpace: 'nowrap' }}>{up ? '↑' : '↓'} {Math.abs(weekChange).toFixed(1)}% this week</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><h2 style={{ margin: 0 }}>{money(Math.round(animatedPrice))}</h2><small style={{ opacity: 0.85 }}>/ quintal</small></div>
        <Sparkline points={points} />
        <span className="advice-label">{sell ? '↑' : '→'} {sell ? t.sell : t.wait}</span>
      </div>

      <div>
        <div className="metric"><span>Nearby best</span><b>{best.name}</b><strong>{money(Math.round(animatedBest))}</strong><small style={{ color: gap > 0 ? '#3B6D11' : 'var(--muted)' }}>{gap > 0 ? `+${money(Math.round(gap))} / quintal` : 'You are at the best price'}</small></div>
        <div className="alert-card"><h3>🔔 {t.alerts}</h3><div className="alert-row"><input type="number" defaultValue="3000" /><button className="primary-button" onClick={() => { setAlert(true); notify('Price alert enabled') }}>{alert ? 'Enabled' : 'Enable'}</button></div></div>
      </div>
    </div>
  </div>;
}

function Trends({ t, crop, cropId, market }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrends(cropId, market, 30).then((res) => { if (!cancelled) setData(res); }).catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [cropId, market]);

  if (!data) return <div className="page inner-page"><PageTitle eyebrow="Market intelligence" title={t.trends} description={`${crop.name} · loading...`} /></div>;

  return <div className="page inner-page"><PageTitle eyebrow="Market intelligence" title={t.trends} description={`${crop.name} · 30 days of mandi movement`} /><section className="large-chart"><div className="chart-heading"><h2>{money(data.current)} <small>current</small></h2><span className="positive">↑ {crop.change}%</span></div><div className="large-chart-wrap"><Sparkline points={data.days.map((d) => d.price)} height={160} color="#174A32" /></div></section><div className="metric-grid"><div className="metric"><span>Current</span><b>{money(data.current)}</b></div><div className="metric"><span>Average</span><b>{money(data.average)}</b></div><div className="metric"><span>Highest</span><b>{money(data.highest)}</b></div><div className="metric"><span>Lowest</span><b>{money(data.lowest)}</b></div></div></div>;
}

function Fpo({ t, notify, crops, markets }) {
  const [filter, setFilter] = useState('ALL');
  const fpoRows = crops.slice(0, 5).map((crop, index) => ({ ...crop, mandi: (markets[index % (markets.length || 1)]?.name || '').replace(' Mandi', '') }));
  const rows = filter === 'ALL' ? fpoRows : fpoRows.filter((row) => row.recommendation === filter);
  return <div className="page inner-page"><PageTitle eyebrow="For farmer collectives" title="FPO Market Overview" description="Monitor crops, markets and farmer groups in one clear view." /><div className="stats-grid"><div className="metric"><span>Farmers</span><b>126</b></div><div className="metric"><span>Markets monitored</span><b>5</b></div><div className="metric"><span>Crops</span><b>7</b></div><div className="metric"><span>SELL NOW</span><b>72%</b></div></div><div className="fpo-toolbar"><h2>What needs attention today?</h2><div className="segmented"><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All</button><button className={filter === 'SELL' ? 'active' : ''} onClick={() => setFilter('SELL')}>Sell now</button><button className={filter === 'WAIT' ? 'active' : ''} onClick={() => setFilter('WAIT')}>Wait</button></div></div><div className="fpo-table-wrap"><table><thead><tr><th>Crop</th><th>Mandi</th><th>Price</th><th>Advice</th><th>Confidence</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.icon} {row.name}</strong></td><td>{row.mandi}</td><td><b>{money(row.price)}</b></td><td><span className={`advice-pill ${row.recommendation.toLowerCase()}`}>{row.recommendation === 'SELL' ? '↑ SELL NOW' : '→ WAIT'}</span></td><td>{row.confidence}%</td></tr>)}</tbody></table></div><button className="primary-button" onClick={() => notify('SMS broadcast simulated · 126 farmers notified')}><Send size={16} /> Broadcast SMS</button></div>;
}

function About({ t }) { return <div className="page inner-page about-page"><PageTitle eyebrow="A better way to read the market" title={t.how} description="From mandi data to a simple decision." /><div className="steps">{[['01', '📊', 'Track mandi prices'], ['02', '🤖', 'Predict the trend'], ['03', '🌾', 'Guide every sale']].map(([number, icon, title]) => <div className="step" key={number}><span>{number}</span><div className="step-icon">{icon}</div><h2>{title}</h2><p>We turn current and historical market movement into advice that is easy to understand.</p></div>)}</div></div>; }

createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);