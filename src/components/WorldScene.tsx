import { worldAssets } from '../assets/registry'

export function WorldScene() {
  return (
    <div className="scene" role="img" aria-label="A little cottage glowing on a grassy island beneath a starry night sky">
      <div className="moon" />
      <div className="stars" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 19 + 3) % 62}%`, animationDelay: `${i * -0.17}s`, animationDuration: `${2 + (i % 4) * 0.6}s` }} />)}
      </div>
      <div className="cloud cloud--one" /><div className="cloud cloud--two" />
      <div className="island">
        <div className="pond" />
        <div className="path"><i /><i /><i /></div>
        <div className="tree tree--left"><b /><span /></div>
        <div className="tree tree--right"><b /><span /></div>
        <div className="cottage" aria-hidden="true">
          <div className="roof" /><div className="house"><i /><i /><b /></div>
        </div>
        <div className="flower flower--one">✿</div><div className="flower flower--two">✿</div><div className="flower flower--three">✿</div>
      </div>
      <div className="fireflies" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>
      <span className="sr-only">Illustration style: {worldAssets.cottage}, {worldAssets.island}, {worldAssets.fireflies}</span>
    </div>
  )
}
