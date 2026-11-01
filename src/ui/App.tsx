import { useMixerStore } from '@/state/mixerStore'

export default function App() {
  const status = useMixerStore((s) => s.status)
  const connect = useMixerStore((s) => s.connect)
  const disconnect = useMixerStore((s) => s.disconnect)
  const connected = status === 'connected'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">LiveTrak L-20 Mixer</h1>
      <p className="text-neutral-400">Transport: Mock · Status: {status}</p>
      <button
        type="button"
        onClick={() => void (connected ? disconnect() : connect())}
        disabled={status === 'connecting'}
        className="rounded-md bg-neutral-800 px-4 py-2 hover:bg-neutral-700 disabled:opacity-50"
      >
        {connected ? 'Trennen' : 'Verbinden'}
      </button>
    </main>
  )
}
