import type { Destination } from '../destinations/types'
import type { IslandPlace } from './IslandScene'

type Props = {
  step: number
  nearby: IslandPlace | null
  destination: Destination | null
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onFinish: () => void
  inline?: boolean
}

const STEP_COUNT = 4

function stepCopy(step: number, nearby: IslandPlace | null, destination: Destination | null) {
  if (step === 0) {
    return {
      title: 'Find your way around',
      body: 'Walk with W, A, S, D or the arrow keys. On a touch screen, use the arrow pad. Move toward a gold E marker, then press E or choose Explore nearby place.',
    }
  }
  if (step === 1) {
    const hint = destination === 'home'
      ? 'You’re at Our Home. Here you can leave shared notes and keepsakes.'
      : nearby?.id === 'home'
        ? 'You’re close to the cottage. Press E or choose Explore Our Home.'
        : 'Follow the path back to the cottage and look for its gold E marker. Press E or choose Explore when you are nearby.'
    return { title: 'Our Home', body: `${hint} The welcome letter is always available to reopen here.` }
  }
  if (step === 2) {
    const hint = destination === 'garden'
      ? 'You’re in the Memory Garden. This is where you can plant a shared memory.'
      : nearby?.id === 'garden'
        ? 'The Memory Garden is nearby. Press E or choose Explore Memory Garden.'
        : 'Follow the path to the flower marker for the Memory Garden. Press E or choose Explore when you are nearby.'
    return { title: 'Memory Garden', body: hint }
  }
  const hint = destination === 'mailbox'
    ? 'You’re at the Mailbox. Send a letter to your person, read their replies, and mark received letters as opened.'
    : nearby?.id === 'mailbox'
      ? 'The Mailbox is nearby. Press E or choose Explore Mailbox.'
      : 'Follow the path to the mailbox marker. Press E or choose Explore when you are nearby.'
  return { title: 'Mailbox', body: hint }
}

export function TutorialGuide({ step, nearby, destination, onBack, onNext, onSkip, onFinish, inline = false }: Props) {
  const content = stepCopy(step, nearby, destination)
  const isLastStep = step === STEP_COUNT - 1

  return (
    <aside className={`tutorial-guide${inline ? ' tutorial-guide--inline' : ''}`} aria-label="Guided island tutorial">
      <section className="tutorial-guide__card" aria-live="polite" aria-atomic="true">
        <p className="tutorial-guide__eyebrow">A little tour · {step + 1} of {STEP_COUNT}</p>
        <h2>{content.title}</h2>
        <p>{content.body}</p>
        <div className="tutorial-guide__actions">
          {step > 0 && <button type="button" className="tutorial-guide__secondary" onClick={onBack}>Back</button>}
          <button type="button" className="tutorial-guide__secondary" onClick={onSkip}>Skip tour</button>
          {isLastStep
            ? <button type="button" onClick={onFinish}>Finish</button>
            : <button type="button" onClick={onNext}>Next</button>}
        </div>
      </section>
    </aside>
  )
}
