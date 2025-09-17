import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || ''
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''

const sb = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

function uid(p='id'){ return p + '_' + Math.random().toString(36).slice(2,10) }
function fmt(dt){ return new Date(dt).toLocaleString([], {dateStyle:'short', timeStyle:'short'}) }

async function notify(event, data){
  if(!WEBHOOK_URL) return
  try{
    await fetch(WEBHOOK_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({app:'walktalk', event, data, ts: Date.now()})})
  }catch(e){ console.warn('Webhook fail', e) }
}

export default function App(){
  const [user, setUser] = useState(()=> {
    try{ return JSON.parse(localStorage.getItem('wt_user_v2')||'null') }catch{return null}
  })
  const [walks, setWalks] = useState([])
  const emailOn = !!WEBHOOK_URL
  const dbOn = !!sb

  useEffect(()=>{ try{ localStorage.setItem('wt_user_v2', JSON.stringify(user)) }catch{} }, [user])

  useEffect(()=>{
    if(!sb) return
    loadWalks()
    const ch1 = sb.channel('public:walks')
      .on('postgres_changes',{ event:'*', schema:'public', table:'walks' }, loadWalks)
      .subscribe()
    const ch2 = sb.channel('public:walk_participants')
      .on('postgres_changes',{ event:'*', schema:'public', table:'walk_participants' }, loadWalks)
      .subscribe()
    return ()=>{ sb.removeChannel(ch1); sb.removeChannel(ch2) }
  }, [])

  async function loadWalks(){
    const { data, error } = await sb.from('walks').select('*').order('start_time', {ascending:true})
    if(!error) setWalks(data || [])
  }

  async function createWalk(form){
    if(!sb || !user) return alert('Databáze není připojena.')
    const ins = {
      title: form.title || 'Procházka',
      host_name: user.name,
      host_email: user.email,
      start_time: new Date(form.startISO).toISOString(),
      end_time: new Date(form.endISO).toISOString(),
      pace: form.pace,
      terrain: form.terrain,
      convo_mode: form.convoMode,
      dog_allowed: form.dogAllowed,
      non_smokers_only: !!form.nonSmokersOnly,
      capacity: 3,
      area_label: form.areaLabel || 'oblast ve městě',
      status: 'scheduled',
    }
    const { error } = await sb.from('walks').insert(ins)
    if(error) alert('Chyba při založení procházky')
  }

  async function joinWalk(w){
    if(!sb || !user) return
    const { count } = await sb.from('walk_participants').select('*', {count:'exact', head:true}).eq('walk_id', w.id)
    const nowCount = (count||0)+1
    if(nowCount > w.capacity) return alert('Už je plno.')
    const ins = { walk_id: w.id, joiner_name: user.name, joiner_email: user.email }
    const { error } = await sb.from('walk_participants').insert(ins)
    if(error) return alert('Nepodařilo se přidat.')
    await notify('joined', { walk: pickPublic(w), host:{name:w.host_name, email:w.host_email}, joiner:{name:user.name, email:user.email}, counts:{now:nowCount, max:w.capacity} })
    if(nowCount>=w.capacity){
      await notify('capacity_reached', { walk: pickPublic(w), host:{name:w.host_name, email:w.host_email}, lastJoiner:{name:user.name, email:user.email}, counts:{now:nowCount, max:w.capacity} })
      await sb.from('walks').update({ status:'confirmed' }).eq('id', w.id)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="badge">MVP • Pilot</div>
        <h1>WalkTalk</h1>
        <p className="claim">Poznej lidi v pohybu, ne na fotce.</p>
        <div className="toolbar">
          <span className="ind">{dbOn ? 'Databáze: ON (Supabase)' : 'Databáze: OFF (nastavíme v Krok 4)'}</span>
          <span className="ind">{emailOn ? 'E-maily: ON' : 'E-maily: OFF'}</span>
          {user && <span className="ind">Ahoj, {user.name}</span>}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={()=>document.getElementById('find').scrollIntoView({behavior:'smooth'})}>Najít procházku</button>
          <button className="btn" onClick={()=>document.getElementById('create').scrollIntoView({behavior:'smooth'})}>Vytvořit procházku</button>
          <button className="btn" onClick={()=>setUser(null)}>Reset profilu</button>
        </div>
      </header>

      {!user ? <Onboarding onDone={setUser} /> : (
        <main className="content">
          <section id="create" className="card">
            <Create onCreate={createWalk} user={user} />
          </section>
          <section id="find" className="card">
            <Find walks={walks} me={user} onJoin={joinWalk} />
          </section>
        </main>
      )}

      <footer className="footer">© {new Date().getFullYear()} WalkTalk — triády, žádné fotky, jen kroky a rozhovor.</footer>
    </div>
  )
}

function Onboarding({ onDone }){
  const [name,setName] = useState('')
  const [email,setEmail] = useState('')

  function submit(e){
    e.preventDefault()
    if(!name.trim()) return alert('Zadej křestní jméno.')
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

function Create({ user, onCreate }){
  const [title, setTitle] = useState('Večerní okruh')
  const [start, setStart] = useState(()=> new Date(Date.now()+60*60000).toISOString().slice(0,16))
  const [end, setEnd] = useState(()=> new Date(Date.now()+90*60000).toISOString().slice(0,16))
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
    <form className="grid" onSubmit={submit}>
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
    </form>
  )
}

function Find({ walks, me, onJoin }){
  if(!walks.length) return <div className="small">Zatím žádné procházky.</div>
  return (
    <div className="list">
      {walks.map(w => <div key={w.id} className="card">
        <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
          <h3 style={{margin:0}}>{w.title}</h3>
          <span className="tag">{w.status==='confirmed'?'✅ potvrzeno':`${w.capacity} místa`}</span>
        </div>
        <div className="row small">
          <span>📅 {fmt(w.start_time)} – {fmt(w.end_time)}</span>
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
      </div>)}
    </div>
  )
}

function pickPublic(w){
  const {id,title,start_time,end_time,area_label,capacity} = w
  return {id,title,startISO:start_time,endISO:end_time,areaLabel:area_label,maxSize:capacity}
}
