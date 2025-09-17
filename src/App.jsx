import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || ''
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''
const sb = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

function uid(p='id'){ return p + '_' + Math.random().toString(36).slice(2,10) }
function fmt(dt){ return new Date(dt).toLocaleString([], {dateStyle:'short', timeStyle:'short'}) }
function icsFor(w){
  const fmtZ = (iso)=> new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WalkTalk//CZ',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${w.id}@walktalk`,
    `DTSTAMP:${fmtZ(new Date().toISOString())}`,
    `DTSTART:${fmtZ(w.start_time)}`,
    `DTEND:${fmtZ(w.end_time)}`,
    `SUMMARY:WalkTalk – ${w.title}`,
    `DESCRIPTION:Triáda. Sejdeme se poblíž: ${w.area_label}.`,
    `LOCATION:${w.area_label}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\\n')
}
async function notify(event, data){
  if(!WEBHOOK_URL) return
  try{ await fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:'walktalk',event,data,ts:Date.now()})}) }catch{}
}

export default function App(){
  const [user,setUser] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('wt_user_v7')||'null') }catch{return null} })
  const [tab,setTab] = useState('find')
  useEffect(()=>{ try{ localStorage.setItem('wt_user_v7', JSON.stringify(user)) }catch{} }, [user])
  return (
    <div className="page">
      <header className="hero">
        <div className="badge">MVP • Supabase</div>
        <h1>WalkTalk</h1>
        <p className="claim">Poznej lidi v pohybu, ne na fotce. Triády, veřejná místa, lehkost bez tlaku.</p>
        <div className="toolbar">
          <span className="ind">{sb?'Databáze: ON (Supabase)':'Databáze: OFF (env)'}</span>
          <span className="ind">{WEBHOOK_URL?'E-maily: ON':'E-maily: OFF'}</span>
          {user && <span className="ind">👋 {user.name}</span>}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={()=>setTab('create')}>+ Založit procházku</button>
          <button className="btn" onClick={()=>setTab('find')}>Najít poblíž</button>
          <button className="btn" onClick={()=>setTab('me')}>Můj profil</button>
        </div>
      </header>
      <main className="content">
        <Main user={user} setUser={setUser} tab={tab} setTab={setTab} />
      </main>
      <footer className="footer">© {new Date().getFullYear()} WalkTalk — žádné fotky, jen kroky a rozhovor.</footer>
    </div>
  )
}

function Main({ user, setUser, tab, setTab }){
  const [walks,setWalks] = useState([])
  const [counts,setCounts] = useState({})
  const [pendingJoin,setPendingJoin] = useState(null)

  useEffect(()=>{
    if(!sb) return
    loadWalks(); loadCounts();
    const ch1 = sb.channel('public:walks').on('postgres_changes',{event:'*',schema:'public',table:'walks'}, ()=>{loadWalks();loadCounts();}).subscribe()
    const ch2 = sb.channel('public:walk_participants').on('postgres_changes',{event:'*',schema:'public',table:'walk_participants'}, loadCounts).subscribe()
    return ()=>{ sb.removeChannel(ch1); sb.removeChannel(ch2) }
  },[])

  async function loadWalks(){
    const { data } = await sb.from('walks').select('*').order('start_time',{ascending:true})
    setWalks(data||[])
  }
  async function loadCounts(){
    const { data } = await sb.from('walk_participants').select('walk_id')
    const c = {}; for(const r of (data||[])) c[r.walk_id]=(c[r.walk_id]||0)+1; setCounts(c)
  }

  async function createWalk(f){
    if(!sb) return alert('DB není připojena.')
    if(!user) return setTab('me')
    const ins = {
      title: f.title || 'Procházka', host_name: user.name, host_email: user.email,
      start_time: new Date(f.startISO).toISOString(), end_time: new Date(f.endISO).toISOString(),
      pace: f.pace, terrain: f.terrain, convo_mode: f.convoMode, dog_allowed: f.dogAllowed,
      non_smokers_only: !!f.nonSmokersOnly, capacity: 3, area_label: f.areaLabel || 'oblast ve městě', status:'scheduled'
    }
    const { error } = await sb.from('walks').insert(ins)
    if(error){ alert('Chyba při založení'); console.error(error); return }
    setTab('find')
  }

  async function doJoin(w, u){
    const current = (counts[w.id]||0)
    if(current+1 > w.capacity) return alert('Už je plno.')
    const ins = { walk_id:w.id, joiner_name:u.name, joiner_email:u.email }
    const { error } = await sb.from('walk_participants').insert(ins)
    if(error){ alert('Nepovedlo se přidat.'); console.error(error); return }

    const { data: plist } = await sb.from('walk_participants').select('joiner_email,joiner_name').eq('walk_id', w.id)
    const participantsEmails = (plist||[]).map(p=>p.joiner_email)

    await notify('joined',{
      walk: pickPublic(w),
      host:{name:w.host_name,email:w.host_email},
      joiner:{name:u.name,email:u.email},
      participantsEmails,
      counts:{now:current+1, max:w.capacity}
    })

    if(current+1 >= w.capacity){
      await notify('capacity_reached',{
        walk: pickPublic(w),
        host:{name:w.host_name,email:w.host_email},
        lastJoiner:{name:u.name,email:u.email},
        participantsEmails,
        counts:{now:current+1, max:w.capacity},
        ics: icsFor(w)
      })
      await sb.from('walks').update({status:'confirmed'}).eq('id', w.id)
    }
    alert('Přihlášen/a.')
  }

  function handleJoinClick(w){
    if(user){ doJoin(w, user); return }
    setPendingJoin(w)
  }
  function handleGateSubmit(name,email){
    const cleanName = name.trim(), cleanEmail = email.trim()
    if(!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return alert('Zadej platné údaje.')
    const u = { id: uid('u'), name: cleanName, email: cleanEmail }
    setUser(u)
    if(pendingJoin){ doJoin(pendingJoin, u); setPendingJoin(null) }
  }

  return (
    <>
      {tab==='find' && <Find walks={walks} counts={counts} onJoin={handleJoinClick} />}
      {tab==='create' && <Create onCreate={createWalk} requireProfile={!user} />}
      {tab==='me' && <Profile me={user} setMe={setUser} />}
      {!user && pendingJoin && <JoinGate onClose={()=>setPendingJoin(null)} onSubmit={handleGateSubmit} />}
    </>
  )
}

function Find({ walks, counts, onJoin }){
  if(!walks.length) return <div className="card">Zatím žádné procházky.</div>
  return (
    <div className="list">
      {walks.map(w => (
        <div key={w.id} className="card">
          <div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}>
            <h3 style={{margin:0}}>{w.title}</h3>
            <span className="tag">{w.status==='confirmed'?'✅ potvrzeno':`${(counts[w.id]||0)}/${w.capacity}`}</span>
          </div>
          <div className="spacer"></div>
          <div className="row small">
            <span>📅 {fmt(w.start_time)} – {fmt(w.end_time)}</span>
            <span>•</span>
            <span>📍 {w.area_label}</span>
          </div>
          <div className="row small">
            <span>Tempo: {w.pace}</span>
            <span>•</span>
            <span>Terén: {w.terrain}</span>
            <span>•</span>
            <span>Režim: {w.convo_mode}</span>
          </div>
          <div className="spacer"></div>
          <div className="row" style={{justifyContent:'flex-end'}}>
            <button className="btn primary" onClick={()=>onJoin(w)}>Přidat se</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Create({ onCreate, requireProfile }){
  const [title,setTitle] = useState('Večerní okruh')
  const [start,setStart] = useState(()=> new Date(Date.now()+60*60000).toISOString().slice(0,16))
  const [end,setEnd] = useState(()=> new Date(Date.now()+90*60000).toISOString().slice(0,16))
  const [pace,setPace] = useState('medium')
  const [terrain,setTerrain] = useState('mixed')
  const [convo,setConvo] = useState('light')
  const [dog,setDog] = useState('indifferent')
  const [nonSmokers,setNonSmokers] = useState(false)
  const [area,setArea] = useState('veřejné místo v tvé čtvrti')

  function submit(e){
    e.preventDefault()
    onCreate({ title, startISO:start, endISO:end, pace, terrain, convoMode:convo, dogAllowed:dog, nonSmokersOnly:nonSmokers, areaLabel:area })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Založit procházku</h2>
      {requireProfile && <div className="small">Než publikuješ, vyplň prosím jméno a e‑mail (záložka „Můj profil“).</div>}
      <div className="spacer"></div>
      <div className="row">
        <label>Nadpis</label>
        <input className="input" value={title} onChange={e=>setTitle(e.target.value)} style={{flex:1}}/>
      </div>
      <div className="row">
        <label>Od</label><input className="input" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} />
        <label>Do</label><input className="input" type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} />
      </div>
      <div className="row">
        <label>Tempo</label>
        <select value={pace} onChange={e=>setPace(e.target.value)}>
          <option value="slow">pomalé</option>
          <option value="medium">střední</option>
          <option value="fast">svižné</option>
        </select>
        <label>Terén</label>
        <select value={terrain} onChange={e=>setTerrain(e.target.value)}>
          <option value="city">město</option>
          <option value="nature">příroda</option>
          <option value="mixed">kombinace</option>
        </select>
        <label>Režim</label>
        <select value={convo} onChange={e=>setConvo(e.target.value)}>
          <option value="silent">tichá</option>
          <option value="light">lehká</option>
          <option value="talk">konverzační</option>
        </select>
      </div>
      <div className="row">
        <label>Psi</label>
        <select value={dog} onChange={e=>setDog(e.target.value)}>
          <option value="indifferent">nezáleží</option>
          <option value="yes">se psem OK</option>
          <option value="no">nechci psa</option>
        </select>
        <label className="small"><input type="checkbox" checked={nonSmokers} onChange={e=>setNonSmokers(e.target.checked)} /> Jen nekuřáci</label>
      </div>
      <div className="row">
        <label>Oblast startu</label>
        <input className="input" value={area} onChange={e=>setArea(e.target.value)} style={{flex:1}} />
      </div>
      <div className="row" style={{justifyContent:'flex-end'}}>
        <button className="btn primary" type="submit">Publikovat</button>
      </div>
    </form>
  )
}

function Profile({ me, setMe }){
  if(!me){
    const [name,setName] = React.useState('')
    const [email,setEmail] = React.useState('')
    function submit(e){ e.preventDefault(); if(!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert('Zadej platné údaje.'); setMe({ id: uid('u'), name:name.trim(), email:email.trim() }) }
    return (
      <form className="card" onSubmit={submit}>
        <h2>Vytvořit profil</h2>
        <div className="spacer"></div>
        <div className="row"><input className="input" placeholder="Křestní jméno" value={name} onChange={e=>setName(e.target.value)} /><input className="input" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div className="row" style={{justifyContent:'flex-end'}}><button className="btn primary">Uložit</button></div>
        <div className="small">Profil slouží jen k zasílání potvrzení a koordinaci.</div>
      </form>
    )
  }
  return (
    <div className="card">
      <h2>Můj profil</h2>
      <div className="spacer"></div>
      <div className="row">
        <input className="input" value={me.name} onChange={e=>setMe({...me, name:e.target.value})} />
        <input className="input" value={me.email} onChange={e=>setMe({...me, email:e.target.value})} />
      </div>
      <div className="small">Údaje slouží jen k zasílání potvrzení a koordinaci.</div>
    </div>
  )
}

function JoinGate({ onClose, onSubmit }){
  const [name,setName] = useState('')
  const [email,setEmail] = useState('')
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="panel">
        <h3>Rychlé potvrzení</h3>
        <p className="small">Zadej prosím jméno a e‑mail, ať ti můžeme poslat potvrzení a případné změny.</p>
        <div className="row"><input className="input" placeholder="Křestní jméno" value={name} onChange={e=>setName(e.target.value)} /><input className="input" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div className="row" style={{justifyContent:'flex-end'}}>
          <button className="btn" onClick={onClose}>Zavřít</button>
          <button className="btn primary" onClick={()=>onSubmit(name,email)}>Potvrdit a přidat se</button>
        </div>
      </div>
    </div>
  )
}

function pickPublic(w){
  const {id,title,start_time,end_time,area_label,capacity} = w
  return {id,title,startISO:start_time,endISO:end_time,areaLabel:area_label,maxSize:capacity}
}
