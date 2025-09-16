import React from 'react'

export default function App() {
  return (
    <div className="page">
      <header className="hero">
        <div className="badge">MVP • Pilot</div>
        <h1>WalkTalk</h1>
        <p className="claim">Poznej lidi v pohybu, ne na fotce.</p>
        <a className="cta" href="#">(Zatím) ukázkový náhled</a>
      </header>
      <main className="content">
        <section>
          <h2>Co chystáme</h2>
          <ul>
            <li>Procházky s vlastnoručně nakreslenou trasou na mapě</li>
            <li>Triády jako výchozí, duo jen po oboustranném souhlasu</li>
            <li>Filtry: věkové dekády, tempo, délka, terén, psi, nekuřák</li>
            <li>E-mail potvrzení a připomínky s .ics</li>
          </ul>
        </section>
        <section className="note">
          <p>Tento build je jen start. Jakmile si potvrdíme nasazení na Vercel, nahradíme to skutečnou appkou.</p>
        </section>
      </main>
      <footer className="footer">© {new Date().getFullYear()} WalkTalk</footer>
    </div>
  )
}
