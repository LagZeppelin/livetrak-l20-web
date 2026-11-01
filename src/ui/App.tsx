import { useEffect, useState } from 'react'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { useMixerStore } from '@/state/mixerStore'
import { ChannelDetail } from './screens/ChannelDetail'
import { Console, STRIP_W } from './screens/Console'
import { Phone } from './screens/Phone'
import type { View } from './mixView'
import { Overview, Shell } from './screens/Shell'

// shortcut: the phone view is picked by URL (?phone=C); the Pi will hand out the mix per phone later
const phoneMix = new URLSearchParams(location.search).get('phone')?.toUpperCase() as MonitorMixId

export default function App() {
  const connect = useMixerStore((s) => s.connect)
  useEffect(() => {
    void connect()
  }, [connect])
  return MONITOR_MIXES.includes(phoneMix) ? <Phone mix={phoneMix} /> : <Ipad />
}

function Ipad() {
  const [mix, setMix] = useState<View>('main')
  const [detail, setDetail] = useState<number | null>(null)
  const [visible, setVisible] = useState<[number, number]>([1, 8])

  const scrollTo = (ch: number) =>
    document.getElementById(`strip-${ch}`)?.scrollIntoView({ inline: 'start', block: 'nearest' })

  return (
    <Shell
      mix={mix}
      onMix={(m) => {
        setMix(m)
        setDetail(null)
      }}
      overview={
        <Overview
          fx={mix === 'main' && detail === null}
          highlight={detail ? [detail, detail] : visible}
          onOpen={(ch) => (ch > 20 ? scrollTo(ch) : setDetail(ch))}
          onScroll={(dx) => document.getElementById('strips')?.scrollBy({ left: dx * STRIP_W })}
        />
      }
    >
      {detail ? (
        <ChannelDetail
          ch={detail}
          onBack={() => {
            setDetail(null)
            requestAnimationFrame(() => scrollTo(detail))
          }}
        />
      ) : (
        <Console mix={mix} onOpen={setDetail} onVisible={setVisible} />
      )}
    </Shell>
  )
}
