import React, { useEffect, useMemo, useState } from 'react'

// WalkTalk MVP — bez fotek, bez swipů; e-mailové notifikace přes webhook.
// DŮLEŽITÉ: ve Vercelu nastav proměnnou prostředí VITE_WEBHOOK_URL na URL z Make.com
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''

/** @typedef {{ id:string, name:string, email:string, ageBracket:string, languages:string[], nonSmoker:boolean, bringsDog:boolean, accessibilityOk:boolean, convoMode:'silent'|'light'|'talk', reliability:number, attended:number }} User */
/** @typedef {{ id:string, title:string, hostId:string, hostName:string, hostEmail:string, startISO:string, endISO:string, pace:'slow'|'medium'|'fast', terrain:'city'|'nature'|'mixed', convoMode:'silent'|'light'|'talk', dogAllowed:'yes'|'no'|'indifferent', nonSmokersOnly:boolean, maxSize:number, participants:string[], areaLabel:string, status:'scheduled'|'confirmed'|'started'|'done'|'canceled', createdAt:string }} Walk */

const LS = {
  user: 'wt_user_v1',
  walks: 'wt_walks_v1',
}

function uid(p='id'){ return p + '_' + Math.random().toString(36).slice(2,10) }
function nowISO(){ return new Date().toISOString() }
function fmt(dt){ return new Date(dt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }
function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} }
function load(k,f){ try{ const x=localStorage.getItem(k); return x?JSON.parse(x):f }catch{ return f } }

async function notify(event, data){
  if(!WEBHOOK_URL) return
  try{
    await fetch(WEBHOOK_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ app:'walktalk', event, data, ts: Date.now() }) })
  }catch(e){
    console.warn('Webhook selhal', e)
  }
}

export default function App(){
  const [user, setUser] = useState(/** @type {User|null} */(load(LS.user, null)))
  const [walks, setWalks] = useState(/** @type {Walk[]} */(load(LS.walks, [])))
  const [tab, setTab] = useState('find')

  useEffect(()=>save(LS.user, user), [user])
  useEffect(()=>save(LS.walks, walks), [walks])

  // seed ukázkové procházky po vytvoření uživatele
  useEffect(()=>{
    if(user && walks.length===0){
      const start = new Date(Date.now() + 60*60000)
      const end = new Date(start.getTime() + 45*60000)
      setWalks([{
        id: uid('w'),
        title: 'Zkušební okruh u parku',
        hostId: user.id,
        hostName: user.name,
        hostEmail: user.email,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        pace:'medium',
        terrain:'mixed',
        convoMode: user.convoMode || 'light',
        dogAllowed:'indifferent',
        nonSmokersOnly:false,
        maxSize:3,
        participants:[],
        areaLabel:'oblíbená čtvrť',
        status:'scheduled',
        createdAt: nowISO(),
      }])
    }
  }, [user])

  const visible = useMemo(()=> walks.slice().sort((a,b)=>new Date(a.startISO)-new Date(b.startISO)), [walks])

  function createWalk(f){
    if(!user) return
    const w = /** @type {Walk} */({
      id: uid('w'),
      title: f.title || 'Procházka',
      hostId: user.id,
      hostName: user.name,
      hostEmail: user.email,
      startISO: new Date(f.startISO).toISOString(),
      endISO: new Date(f.endISO).toISOString(),
      pace: f.pace,
      terrain: f.terrain,
      convoMode: f.convoMode,
      dogAllowed: f.dogAllowed,
      nonSmokersOnly: !!f.nonSmokersOnly,
      maxSize: 3,
      participants: [],
      areaLabel: f.areaLabel || 'veřejné místo',
      status: 'scheduled',
      createdAt: nowISO(),
    })
    setWalks(ws=>[...ws, w])
    setTab('find')
  }

  function joinWalk(id){
    if(!user) return
    setWalks(ws => ws.map(w => {
      if(w.id!==id) return w
      if(w.participants.includes(user.id) || w.participants.length>=w.maxSize) return w
      const newCount = w.participants.length + 1
      const willFill = newCount>=w.maxSize
      // Notifikace
      notify('joined', {
        walk: pickPublic(w),
        host: {name:w.hostName, email:w.hostEmail},
        joiner: {name:user.name, email:user.email},
        counts: { now:newCount, max:w.maxSize }
      })
      if(willFill){
        notify('capacity_reached', {
          walk: pickPublic(w),
          host: {name:w.hostName, email:w.hostEmail},
          lastJoiner: {name:user.name, email:user.email},
          counts: { now:newCount, max:w.maxSize }
        })
        return { ...w, participants: [...w.participants, user.id], status:'confirmed' }
      }
      return { ...w, participants: [...w.participants, user.id] }
    }))
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="badge">MVP • Pilot</div>
        <h1>WalkTalk</h1>
        <p className="claim">Poznej lidi v pohybu, ne na fotce.</p>
        <div className="toolbar">
          <span className="ind">{WEBHOOK_URL ? 'Emaily: ON' : 'Emaily: OFF (doplníme v Krok 3)'}</span>
          {user && <span className="ind">Ahoj, {user.name}</span>}
        </div>
        <div className="toolbar">
          <button className="btn" onClick={()=>setTab('find')}>Najít procházku</button>
          <button className="btn" onClick={()=>setTab('create')}>Vytvořit procházku</button>
          <button className="btn" onClick={()=>setTab('me')}>Můj profil</button>
        </div>
      </header>

      <main className="content">
        {!user ? <Onboarding onDone={setUser} /> : (
          <>
            {tab==='find' && <Find walks={visible} me={user} onJoin={joinWalk} />}
            {tab==='create' && <Create me={user} onCreate={createWalk} />}
            {tab==='me' && <Profile me={user} setMe={setUser} />}
          </>
        )}
      </main>

      <footer className="footer">© {new Date().getFullYear()} WalkTalk — žádné fotky, žádné swipy. Jen kroky a rozhovor.</footer>
    </div>
  )
}

function pickPublic(w){
  const {id,title,startISO,endISO,areaLabel,maxSize} = w
  return {id,title,startISO,endISO,areaLabel,maxSize}
}

function Onboarding({ onDone }){
  const [name,setName] = useState('')
  const [email,setEmail] = useState('')
  const [age,setAge] = useState('18-27')
  const [langs, setLangs] = useState(['cs'])
  const [nonSmoker,setNonSmoker] = useState(true)
  const [bringsDog,setBringsDog] = useState(false)
  const [access,setAccess] = useState(true)
  const [convo,setConvo] = useState('light')

  function toggleLang(code){ setLangs(arr => arr.includes(code) ? arr.filter(x=>x!==code) : [...arr, code]) }

  function submit(e){
    e.preventDefault()
    if(!name.trim()) return alert('Zadej křestní jméno.')
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert('Zadej platný e‑mail.')
    /** @type {User} */
    const u = { id:uid('u'), name:name.trim(), email:email.trim(), ageBracket:age, languages:langs, nonSmoker, bringsDog, accessibilityOk:access, convoMode:convo, reliability:0, attended:0 }
    onDone(u)
  }

  return (
    <form className="card grid" onSubmit={submit}>
      <h2>Začneme rychle</h2>
      <div className="row">
        <input className="input" placeholder="Křestní jméno" value={name} onChange={e=>setName(e.target.value)} />
        <input className="input" placeholder="E‑mail (na potvrzení)" value={email} onChange={e=>setEmail(e.target.value)} />
        <select value={age} onChange={e=>setAge(e.target.value)}>
          <option>18-27</option><option>28-37</option><option>38-47</option><option>48-57</option><option>58+</option>
        </select>
      </div>
      <div className="row">
        <label className="small">Jazyky:</label>
        <label><input type="checkbox" checked={langs.includes('cs')} onChange={()=>toggleLang('cs')} /> Česky</label>
        <label><input type="checkbox" checked={langs.includes('en')} onChange={()=>toggleLang('en')} /> English</label>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={nonSmoker} onChange={e=>setNonSmoker(e.target.checked)} /> Nekuřák</label>
        <label><input type="checkbox" checked={bringsDog} onChange={e=>setBringsDog(e.target.checked)} /> Mám psa</label>
        <label><input type="checkbox" checked={access} onChange={e=>setAccess(e.target.checked)} /> Bez bariér OK</label>
      </div>
      <div className="row">
        <label>Režim hovoru:</label>
        <select value={convo} onChange={e=>setConvo(e.target.value)}>
          <option value="silent">tichá</option>
          <option value="light">lehká (výchozí)</option>
          <option value="talk">konverzační</option>
        </select>
      </div>
      <button className="btn primary" type="submit">Pokračovat</button>
      <div className="small">Data jen pro účely domluvy procházky. Žádné fotky, žádné hodnocení vzhledu.</div>
    </form>
  )
}

function Find({ walks, me, onJoin }){
  if(!walks.length) return <div className="card">Zatím žádné procházky. Vytvoř jednu a pozvi další!</div>
  return (
    <div className="list">
      {walks.map(w => <div key={w.id} className="card">
        <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
          <h3 style={{margin:0}}>{w.title}</h3>
          <span className="tag">{w.participants.length}/{w.maxSize}</span>
        </div>
        <div className="row small">
          <span>⏰ {fmt(w.startISO)}–{fmt(w.endISO)}</span>
          <span>•</span>
          <span>Oblast: {w.areaLabel}</span>
        </div>
        <div className="row small">
          <span>Pace: {w.pace}</span>
          <span>•</span>
          <span>Terén: {w.terrain}</span>
          <span>•</span>
          <span>Režim: {w.convoMode}</span>
        </div>
        {w.status==='confirmed' && <div className="small">✅ Potvrzeno – skupina je plná.</div>}
        {w.status==='scheduled' && !w.participants.includes(me.id) && w.participants.length<w.maxSize &&
          <button className="btn primary" onClick={()=>onJoin(w.id)}>Přidat se</button>}
        {w.participants.includes(me.id) && <div className="small">Jsi přihlášený/á.</div>}
      </div>)}
    </div>
  )
}

function Create({ me, onCreate }){
  const [title, setTitle] = useState('Večerní okruh')
  const [start, setStart] = useState(()=> new Date(Date.now()+60*60000).toISOString().slice(0,16))
  const [end, setEnd] = useState(()=> new Date(Date.now()+90*60000).toISOString().slice(0,16))
  const [pace,setPace] = useState('medium')
  const [terrain,setTerrain] = useState('mixed')
  const [convo,setConvo] = useState(me.convoMode || 'light')
  const [dog,setDog] = useState('indifferent')
  const [nonSmokers,setNonSmokers] = useState(false)
  const [area,setArea] = useState('veřejné místo v tvé čtvrti')

  function submit(e){
    e.preventDefault()
    onCreate({ title, startISO:start, endISO:end, pace, terrain, convoMode:convo, dogAllowed:dog, nonSmokersOnly:nonSmokers, areaLabel:area })
  }

  return (
    <form className="card grid" onSubmit={submit}>
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
      <div className="small">Přesný pin a trasa se zobrazí až potvrzeným účastníkům.</div>
    </form>
  )
}

function Profile({ me, setMe }){
  return (
    <div className="card grid">
      <h2>Můj profil</h2>
      <div className="row">
        <input className="input" value={me.name} onChange={e=>setMe({...me, name:e.target.value})} />
        <input className="input" value={me.email} onChange={e=>setMe({...me, email:e.target.value})} />
      </div>
      <div className="row small">
        <span>Spolehlivost: {me.reliability}</span>
        <span>•</span>
        <span>Účastí: {me.attended}</span>
      </div>
      <div className="small">Údaje slouží jen k zasílání potvrzení a koordinaci.</div>
    </div>
  )
}
