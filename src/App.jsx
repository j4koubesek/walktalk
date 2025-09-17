import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// ENV
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || ''
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''

const sb = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

// Helpers
function uid(p='id'){ return p + '_' + Math.random().toString(36).slice(2,10) }
function fmtDateTime(dt){ return new Date(dt).toLocaleString([], {dateStyle:'short', timeStyle:'short'}) }
async function notify(event, data){
  if(!WEBHOOK_URL) return
  try{
    await fetch(WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:'walktalk',event,data,ts:Date.now()})})
  }catch(e){ console.warn('Webhook fail', e) }
}

// Types doc
/** @typedef {{ id:string, name:string, email:string }} User */
/** @typedef {{ id:string, title:string, host_name:string, host_email:string, start_time:string, end_time:string, pace:string, terrain:string, convo_mode:string, dog_allowed:string, non_smokers_only:boolean, capacity:number, area_label:string, status:string, created_at:string }} Walk */

export default function App(){
  const [user,setUser] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('wt_user_v3')||'null') }catch{return null} })
  const [tab,setTab] = useState('find')
  const dbOn = !!sb, mailOn = !!WEBHOOK_URL

  useEffect(()=>{ try{ localStorage.setItem('wt_user_v3', JSON.stringify(user)) }catch{} }, [user])

  return (
    <div className="page">
      <header className="hero">
        <div className="badge">MVP • Supabase</div>
        <h1>WalkTalk</h1>
        <p className="claim">Poznej lidi v pohybu, ne na fotce.</p>
        <div className="toolbar">
          <span className="ind">{dbOn?'Databáze: ON (Supabase)':'Databáze: OFF (nastav v env)'}</span>
          <span className="ind">{mailOn?'E-maily: ON':'E-maily: OFF'}</span>
          {user && <span className="ind">Ahoj, {user.name}</span>}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={()=>setTab('find')}>Najít procházku</button>
          <button className="btn" onClick={()=>setTab('create')}>Vytvořit procházku</button>
          <button className="btn" onClick={()=>setTab('me')}>Můj profil</button>
        </div>
      </header>

      <main className="content">
        {!user ? <Onboarding onDone={setUser} /> : <MainApp user={user} tab={tab} setTab={setTab} />}
      </main>

      <footer className="footer">© {new Date().getFullYear()} WalkTalk — triády, žádné fotky, jen kroky a rozhovor.</footer>
    </div>
  )
}

function Onboarding({ onDone }){
  const [name,setName] = useState(''), [email,setEmail] = useState('')
  function submit(e){
    e.preventDefault()
    if(!name.trim()) return alert('Zadej jméno.')
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Zadej platný e-mail.')
    onDone({ id: uid('u'), name:name.trim(), email:email.trim() })
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Začneme rychle</h2>
      <div className="row">
        <input className="input" placeholder="Křestní jméno" value={name} onChange={e=>setName(e.target.value)} />
        <input className="input" placeholder="E-mail (na potvrzení)" value={email} onChange={e=>setEmail(e.target.value)} />
      </div>
      <button className="btn primary" type="submit">Pokračovat</button>
      <div className="small">Žádné fotky, žádné hodnocení vzhledu.</div>
    </form>
  )
}

function MainApp({ user, tab, setTab }){
  const [walks,setWalks] = useState(/** @type {Walk[]} */([]))

  useEffect(()=>{
    if(!sb) return
    load()
    const ch1 = sb.channel('public:walks').on('postgres_changes',{event:'*',schema:'public',table:'walks'}, load).subscribe()
    const ch2 = sb.channel('public:walk_participants').on('postgres_changes',{event:'*',schema:'public',table:'walk_participants'}, load).subscribe()
    return ()=>{ sb.removeChannel(ch1); sb.removeChannel(ch2) }
  },[])

  async function load(){
    const { data, error } = await sb.from('walks').select('*').order('start_time',{ascending:true})
    if(error){ console.error(error); return }
    setWalks(data||[])
  }

  async function createWalk(f){
    if(!sb) return alert('DB OFF')
    const ins = {
      title: f.title || 'Procházka',
      host_name: user.name,
      host_email: user.email,
      start_time: new Date(f.startISO).toISOString(),
      end_time: new Date(f.endISO).toISOString(),
      pace: f.pace,
      terrain: f.terrain,
      convo_mode: f.convoMode,
      dog_allowed: f.dogAllowed,
      non_smokers_only: !!f.nonSmokersOnly,
      capacity: 3,
      area_label: f.areaLabel || 'oblast ve městě',
      status: 'scheduled',
    }
    const { error } = await sb.from('walks').insert(ins)
    if(error){ alert('Chyba při založení'); console.error(error); return }
    setTab('find')
  }

  async function joinWalk(w){
    if(!sb) return
    const { count } = await sb.from('walk_participants').select('*', {count:'exact', head:true}).eq('walk_id', w.id)
    const nowCount = (count||0) + 1
    if(nowCount > w.capacity) return alert('Už je plno.')
    const ins = { walk_id:w.id, joiner_name:user.name, joiner_email:user.email }
    const { error } = await sb.from('walk_participants').insert(ins)
    if(error){ alert('Nepodařilo se přidat.'); console.error(error); return }
    await notify('joined',{ walk: pickPublic(w), host:{name:w.host_name, email:w.host_email}, joiner:{name:user.name, email:user.email}, counts:{now:nowCount, max:w.capacity} })
    if(nowCount>=w.capacity){
      await notify('capacity_reached',{ walk: pickPublic(w), host:{name:w.host_name, email:w.host_email}, lastJoiner:{name:user.name, email:user.email}, counts:{now:nowCount, max:w.capacity} })
      await sb.from('walks').update({status:'confirmed'}).eq('id', w.id)
    }
  }

  return (
    <>
      {tab==='find' && <Find walks={walks} onJoin={joinWalk} />}
      {tab==='create' && <Create onCreate={createWalk} />}
      {tab==='me' && <Profile me={user} />}
    </>
  )
}

function Find({ walks, onJoin }){
  if(!walks.length) return <div className="card">Zatím žádné procházky.</div>
  return (
    <div className="list">
      {walks.map(w => (
        <div key={w.id} className="card">
          <div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}>
            <h3 style={{margin:0}}>{w.title}</h3>
            <span className="tag">{w.status==='confirmed'?'✅ potvrzeno':`${w.capacity} místa`}</span>
          </div>
          <div className="row small">
            <span>📅 {fmtDateTime(w.start_time)} – {fmtDateTime(w.end_time)}</span>
            <span>•</span>
            <span>📍 {w.area_label}</span>
          </div>
          <div className="row small">
            <span>Pace: {w.pace}</span>
            <span>•</span>
            <span>Terén: {w.terrain}</span>
            <span>•</span>
            <span>Režim: {w.convo_mode}</span>
          </div>
          <button className="btn primary" onClick={()=>onJoin(w)}>Přidat se</button>
        </div>
      ))}
    </div>
  )
}

function Create({ onCreate }){
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
      <h2>Vytvořit procházku</h2>
      <input className="input" value={title} onChange={e=>setTitle(e.target.value)} />
      <div className="row">
        <label className="small">Od:</label><input className="input" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} />
        <label className="small">Do:</label><input className="input" type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} />
      </div>
      <div className="row">
        <label>Pace:</label>
        <select value={pace} onChange={e=>setPace(e.target.value)}>
          <option value="slow">pomalé</option>
          <option value="medium">střední</option>
          <option value="fast">svižné</option>
        </select>
        <label>Terén:</label>
        <select value={terrain} onChange={e=>setTerrain(e.target.value)}>
          <option value="city">město</option>
          <option value="nature">příroda</option>
          <option value="mixed">kombinace</option>
        </select>
        <label>Režim:</label>
        <select value={convo} onChange={e=>setConvo(e.target.value)}>
          <option value="silent">tichá</option>
          <option value="light">lehká</option>
          <option value="talk">konverzační</option>
        </select>
      </div>
      <div className="row">
        <label>Psi:</label>
        <select value={dog} onChange={e=>setDog(e.target.value)}>
          <option value="indifferent">nezáleží</option>
          <option value="yes">se psem OK</option>
          <option value="no">nechci psa</option>
        </select>
        <label><input type="checkbox" checked={nonSmokers} onChange={e=>setNonSmokers(e.target.checked)} /> Jen nekuřáci</label>
      </div>
      <input className="input" value={area} onChange={e=>setArea(e.target.value)} placeholder="oblast startu (rozmazaně)" />
      <button className="btn primary" type="submit">Publikovat</button>
      <div className="small">Po publikaci se karta objeví v „Najít procházku“.</div>
    </form>
  )
}

function Profile({ me }){
  return (
    <div className="card">
      <h2>Můj profil</h2>
      <div className="row">
        <input className="input" value={me.name} readOnly />
        <input className="input" value={me.email} readOnly />
      </div>
      <div className="small">Údaje slouží jen k zasílání potvrzení a koordinaci.</div>
    </div>
  )
}

function pickPublic(w){
  const {id,title,start_time,end_time,area_label,capacity} = w
  return {id,title,startISO:start_time,endISO:end_time,areaLabel:area_label,maxSize:capacity}
}
