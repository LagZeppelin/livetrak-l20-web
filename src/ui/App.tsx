import { useEffect, useState } from 'react'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { useMixerStore } from '@/state/mixerStore'
import { ChannelDetail } from './screens/ChannelDetail'
import { MasterDetail } from './screens/MasterDetail'
import { Console, FxReturns, MasterStrip, MonitorPanel, STRIP_W } from './screens/Console'
import { Phone, PhoneEntry } from './screens/Phone'
import { shownBySelect, SLOT_COUNT, slotChannel, slotOf, type View } from './mixView'
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
  useEffect(() => {
    // keep the screen awake while the mixer is open; the lock drops when the tab hides, so take it again
    let lock: WakeLockSentinel | undefined
    const take = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {}) // unsupported or refused (e.g. low battery): the screen just locks as usual
    }
    take()
    document.addEventListener('visibilitychange', take)
    // some Safari versions only grant it after a tap
    document.addEventListener('pointerdown', take)
    return () => {
      document.removeEventListener('visibilitychange', take)
      document.removeEventListener('pointerdown', take)
      void lock?.release()
    }
  }, [])
  if (MONITOR_MIXES.includes(phoneMix)) return <Phone mix={phoneMix} />
  return phoneParam === null ? <Ipad /> : <PhoneEntry />
}

function Ipad() {
  const [mix, setMix] = useState<View>('main')
  const [detail, setDetail] = useState<number | 'master' | null>(null)
  const [visible, setVisible] = useState<[number, number]>([1, 8])
  const [onlySelected, setOnlySelected] = useState(false)
  const channels = useMixerStore((s) => s.mixer.channels)
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).filter(
    (slot) => !onlySelected || shownBySelect(channels, channels[slotChannel(slot) - 1]),
  )
  const detailPos = typeof detail === 'number' ? slots.indexOf(slotOf(detail)) + 1 : 0

  const scrollTo = (ch: number) =>
    document.getElementById(`strip-${ch}`)?.scrollIntoView({ inline: 'start', block: 'nearest' })

  return (
    <Shell
      onlySelected={onlySelected}
      onOnlySelected={setOnlySelected}
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
          slots={slots}
          highlight={typeof detail === 'number' ? [detailPos, detailPos] : visible}
          onOpen={(slot) => setDetail(slotChannel(slot))}
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
        <Console mix={mix} onOpen={setDetail} onVisible={setVisible} onlySelected={onlySelected} />
      )}
    </Shell>
  )
}
