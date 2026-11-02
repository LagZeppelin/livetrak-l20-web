import { useEffect, useState } from 'react'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { useMixerStore } from '@/state/mixerStore'
import { ChannelDetail } from './screens/ChannelDetail'
import { MasterDetail } from './screens/MasterDetail'
import { Console, FxReturns, MasterStrip, MonitorPanel, STRIP_W } from './screens/Console'
import { Phone, PhoneEntry } from './screens/Phone'
import { isFixedStereo, type View } from './mixView'
import { Overview, Shell } from './screens/Shell'

// ?phone = a musician's phone (joins, waits for the admin); ?phone=C skips that for testing
const phoneParam = new URLSearchParams(location.search).get('phone')
const phoneMix = phoneParam?.toUpperCase() as MonitorMixId

export default function App() {
  const connect = useMixerStore((s) => s.connect)
  const source = useMixerStore((s) => s.source)
  useEffect(() => {
    // Bluetooth may only start from a click, so the real mixer connects via the status pill
    if (source === 'demo') void connect()
  }, [connect, source])
  if (MONITOR_MIXES.includes(phoneMix)) return <Phone mix={phoneMix} />
  return phoneParam === null ? <Ipad /> : <PhoneEntry />
}

function Ipad() {
  const [mix, setMix] = useState<View>('main')
  const [detail, setDetail] = useState<number | 'master' | null>(null)
  const [visible, setVisible] = useState<[number, number]>([1, 8])

  const scrollTo = (ch: number) =>
    document.getElementById(`strip-${ch}`)?.scrollIntoView({ inline: 'start', block: 'nearest' })

  return (
    <Shell
      screen={detail === 'master' ? 'master' : mix}
      onScreen={(s) => {
        if (s === 'master') return setDetail('master')
        setMix(s)
        setDetail(null)
      }}
      aside={
        mix === 'main' || detail === 'master' ? (
          <>
            <FxReturns />
            <MasterStrip onOpenEq={() => setDetail('master')} />
          </>
        ) : (
          <MonitorPanel mix={mix} />
        )
      }
      overview={
        <Overview
          highlight={typeof detail === 'number' ? [detail, detail] : visible}
          onOpen={(ch) => setDetail(isFixedStereo(ch - 1) ? ch - 1 : ch)}
          onScroll={(dx) => document.getElementById('strips')?.scrollBy({ left: dx * STRIP_W })}
        />
      }
    >
      {detail === 'master' ? (
        <MasterDetail onBack={() => setDetail(null)} />
      ) : detail ? (
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
