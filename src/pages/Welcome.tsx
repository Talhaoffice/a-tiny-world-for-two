import { Button } from '../components/Button'
import { WorldScene } from '../components/WorldScene'

export function Welcome({ onEnter, onExplore }: { onEnter: () => void; onExplore: () => void }) {
  return (
    <main className="page welcome">
      <div className="welcome__art"><WorldScene /></div>
      <section className="welcome__copy" aria-labelledby="welcome-title">
        <p className="eyebrow">A little place, just for us</p>
        <h1 id="welcome-title">A Tiny World<br /><span>for Two</span></h1>
        <p className="subtitle">Two people. One little world.</p>
        <Button onClick={onEnter}>Enter our world <span aria-hidden="true">→</span></Button>
        <button className="explore-link" onClick={onExplore}>Take a little walk <span aria-hidden="true">✦</span></button>
      </section>
      <footer className="footer">Made with love by Talha <span aria-hidden="true">✦</span></footer>
    </main>
  )
}
