import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

const API=import.meta.env.VITE_API_URL??'http://localhost:4000/api'
type Profile={first_name:string;last_name:string;employee_no:string;email:string;position:string;department:string;work_location:string;role:string}
type Today={check_in:string|null;check_out:string|null;status:string}|null
type RequestRow={id:string;request_type:string;title:string;status:string;created_at:string}

function App() {
  const [token,setToken]=useState(()=>localStorage.getItem('mobile_token')??'')
  const [profile,setProfile]=useState<Profile|null>(null)
  const [today,setToday]=useState<Today>(null)
  const [requests,setRequests]=useState<RequestRow[]>([])
  const [loginError,setLoginError]=useState('')
  const checkedIn=Boolean(today?.check_in&&!today?.check_out)
  const [tab, setTab] = useState('Home')
  const [toast, setToast] = useState('')
  const load=()=>{if(!token)return;const authHeaders={Authorization:`Bearer ${token}`};Promise.all([fetch(`${API}/profile`,{headers:authHeaders}),fetch(`${API}/attendance/today`,{headers:authHeaders}),fetch(`${API}/requests?status=all`,{headers:authHeaders})]).then(async([p,a,r])=>{if(p.status===401){localStorage.removeItem('mobile_token');setToken('');return}setProfile(await p.json());setToday(await a.json());setRequests(await r.json())})}
  useEffect(load,[token])
  const login=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f.get('username'),password:f.get('password')})});if(!r.ok){setLoginError('Invalid username or password');return}const data=await r.json();localStorage.setItem('mobile_token',data.token);setToken(data.token)}
  const check=()=>navigator.geolocation.getCurrentPosition(async pos=>{const endpoint=checkedIn?'check-out':'check-in';const r=await fetch(`${API}/attendance/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({latitude:pos.coords.latitude,longitude:pos.coords.longitude})});if(r.ok){setToast(checkedIn?'Checked out successfully':'Checked in successfully');load();setTimeout(()=>setToast(''),2200)}},()=>setToast('Location permission is required'))
  if(!token)return <div className="mobile-login"><form onSubmit={login}><div>CP</div><small>COMPANY PORTAL</small><h1>Employee sign in</h1><p>Attendance and self-service portal</p><label>Username<input name="username" type="text" autoCapitalize="none" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{loginError&&<span>{loginError}</span>}<button>Sign in →</button></form></div>
  return <div className="page"><div className="phone">
    <div className="status"><span>9:41</span><span>● ᴡɪꜰɪ ▰</span></div>
    <header><div><small>Good morning</small><h1>{profile?.first_name} {profile?.last_name} 👋</h1></div><button className="notify">♢<i /></button><div className="photo">{profile?.first_name?.[0]}{profile?.last_name?.[0]}</div></header>
    <main>
      {tab!=='Home'&&<section className="mobile-module"><button className="back" onClick={()=>setTab('Home')}>← Home</button><h1>{tab}</h1>{tab==='Attendance'&&<div className="mobile-detail"><span>Today</span><b>{today?.status??'Not checked in'}</b><p>Check in: {today?.check_in?new Date(today.check_in).toLocaleTimeString():'—'}</p><p>Check out: {today?.check_out?new Date(today.check_out).toLocaleTimeString():'—'}</p></div>}{tab==='Requests'&&<div className="mobile-request-list">{requests.map(r=><article key={r.id}><i>◇</i><div><b>{r.title}</b><small>{r.request_type.replace('_',' ')} · {new Date(r.created_at).toLocaleDateString()}</small></div><span className={r.status}>{r.status}</span></article>)}</div>}{tab==='Profile'&&<div className="profile-card"><div>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</div><h2>{profile?.first_name} {profile?.last_name}</h2><span>{profile?.position}</span><p><b>Employee ID</b>{profile?.employee_no}</p><p><b>Department</b>{profile?.department}</p><p><b>Email</b>{profile?.email}</p><p><b>Location</b>{profile?.work_location}</p><button onClick={()=>{localStorage.removeItem('mobile_token');setToken('')}}>Sign out</button></div>}</section>}
      <div hidden={tab!=='Home'}>
      <section className="check-card"><div className="check-top"><div><small>THURSDAY, JULY 2</small><h2>{checkedIn ? 'You’re checked in' : 'Ready for your day?'}</h2><p>{checkedIn ? 'Since 8:47 AM · Yangon Office' : 'Tap below when you arrive at work'}</p></div><span className={checkedIn ? 'live on' : 'live'}>{checkedIn ? '● LIVE' : '○ OFF'}</span></div><button className={checkedIn ? 'check-button out' : 'check-button'} onClick={check}><i>{checkedIn ? '↗' : '✓'}</i><b>{checkedIn ? 'Check out' : 'Check in'}</b><small>{checkedIn ? 'End today’s work' : 'GPS will be recorded'}</small></button><div className="today"><div><small>CHECK IN</small><b>{checkedIn ? '8:47 AM' : '--:--'}</b></div><span>······</span><div><small>CHECK OUT</small><b>--:--</b></div><div><small>WORK HOURS</small><b>{checkedIn ? '1h 12m' : '0h 00m'}</b></div></div></section>

      <div className="section-title"><h2>Quick actions</h2></div><div className="quick"><button><i className="purple">▣</i><span>Leave</span></button><button><i className="orange">◷</i><span>Overtime</span></button><button><i className="blue">⇄</i><span>Correction</span></button><button><i className="green">↙</i><span>Early out</span></button></div>

      <div className="section-title"><h2>My summary</h2><button>View attendance →</button></div><section className="summary"><div><i>✓</i><b>19</b><small>Present</small></div><div><i>◷</i><b>2</b><small>Late</small></div><div><i>▣</i><b>8.5</b><small>Leave left</small></div><div><i>⌁</i><b>12h</b><small>Overtime</small></div></section>

      <div className="section-title"><h2>Recent requests</h2><button onClick={()=>setTab('Requests')}>View all →</button></div><section className="requests">{requests.slice(0,2).map(r => <div key={r.id}><i>◇</i><div><b>{r.title}</b><small>{r.request_type.replace('_',' ')} · {new Date(r.created_at).toLocaleDateString()}</small></div><span className={r.status}>{r.status}</span></div>)}</section>
      <section className="announcement"><span>📣</span><div><small>ANNOUNCEMENT</small><b>Office closed on Martyrs’ Day</b><p>Please note the company holiday on July 19.</p></div><button>›</button></section>
      </div>
    </main>
    <nav>{['Home','Attendance','Requests','Profile'].map((n,i)=><button className={tab===n?'active':''} onClick={()=>setTab(n)} key={n}><i>{['⌂','▦','◇','♙'][i]}</i><span>{n}</span>{n==='Requests'&&<b>2</b>}</button>)}</nav>
    {toast && <div className="mobile-toast">✓ {toast}</div>}
  </div></div>
}
export default App
