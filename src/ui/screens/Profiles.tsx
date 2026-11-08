import { useState, type ReactNode } from 'react'
import { useMixerStore } from '@/state/mixerStore'
import { Btn } from '../components/controls'

function Modal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-md">
      <div
        role="dialog"
        aria-label={label}
        className="bg-surf flex max-h-[90dvh] w-[640px] flex-col rounded-xl border border-white/12 p-5 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
      >
        {children}
      </div>
    </div>
  )
}

/** Profiles = named copies of all mixer settings, kept by the app (unlike the L-20's scenes 1–9). */
export function ProfilesDialog({ onClose }: { onClose: () => void }) {
  const s = useMixerStore()
  const [name, setName] = useState('')
  const save = () => {
    s.saveProfile(name.trim() || `Profil ${s.profiles.length + 1}`)
    setName('')
  }

  return (
    <Modal label="Profile">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Profile</h2>
        <Btn className="h-9 px-3" onClick={onClose}>
          Fertig
        </Btn>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          aria-label="Name für neues Profil"
          placeholder="Name, z. B. Probe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-line bg-raised h-10 flex-1 rounded border px-3 text-sm"
        />
        <Btn kind="on" className="h-10 px-4" type="submit">
          Aktuellen Stand speichern
        </Btn>
      </form>

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {s.profiles.length === 0 && (
          <p className="text-fg2 py-8 text-center">
            Noch kein Profil. Profile liegen in der App (nicht im Mixer) und enthalten alle
            Einstellungen außer Gain, Kompressor und Recorder.
          </p>
        )}
        {s.profiles.map((p) => {
          const isDefault = s.defaultProfileId === p.id
          return (
            <div key={p.id} className="card flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                aria-label={isDefault ? 'Standard-Profil, nicht mehr Standard' : 'Als Standard'}
                aria-pressed={isDefault}
                title="Standard-Profil: wird beim Verbinden angeboten"
                className={isDefault ? 'text-warn text-xl' : 'text-fg3 text-xl'}
                onClick={() => s.setDefaultProfile(isDefault ? null : p.id)}
              >
                {isDefault ? '★' : '☆'}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{p.name}</div>
                <div className="text-fg3 text-xs">
                  {new Date(p.savedAt).toLocaleString('de-DE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {isDefault && ' · Standard'}
                </div>
              </div>
              <Btn
                kind="on"
                className="h-9 px-3"
                onClick={() =>
                  confirm(
                    `Mixer auf „${p.name}“ setzen? Die jetzigen Einstellungen werden überschrieben.`,
                  ) && s.loadProfile(p.id)
                }
              >
                Laden
              </Btn>
              <Btn
                className="h-9 px-3"
                onClick={() =>
                  confirm(`„${p.name}“ mit dem aktuellen Stand überschreiben?`) &&
                  s.saveProfile(p.name, p.id)
                }
              >
                Überschreiben
              </Btn>
              <Btn
                className="h-9 px-3"
                onClick={() => {
                  const n = prompt('Neuer Name', p.name)?.trim()
                  if (n) s.renameProfile(p.id, n)
                }}
              >
                Umbenennen
              </Btn>
              <Btn
                className="h-9 px-3"
                onClick={() => confirm(`„${p.name}“ löschen?`) && s.deleteProfile(p.id)}
              >
                Löschen
              </Btn>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/** After each connect to the mixer: offer the default profile, never load it without asking (Ron, Nov 8). */
export function DefaultProfilePrompt() {
  const status = useMixerStore((s) => s.status)
  const profile = useMixerStore((s) => s.profiles.find((p) => p.id === s.defaultProfileId))
  const loadProfile = useMixerStore((s) => s.loadProfile)
  const [ask, setAsk] = useState(false)
  const [seen, setSeen] = useState(status)
  // ask again on every new connect (React's "adjust state on prop change" pattern)
  if (seen !== status) {
    setSeen(status)
    setAsk(status === 'connected' && !!profile)
  }
  if (!ask || !profile) return null

  return (
    <Modal label="Standard-Profil laden">
      <h2 className="text-lg font-semibold">Standard-Profil „{profile.name}“ laden?</h2>
      <p className="text-fg2 mt-2">
        Der Mixer wird auf die gespeicherten Einstellungen gesetzt. Wenn gerade gespielt wird,
        lieber so lassen.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Btn className="h-10 px-4" onClick={() => setAsk(false)}>
          Mixer so lassen
        </Btn>
        <Btn
          kind="on"
          className="h-10 px-4"
          onClick={() => {
            loadProfile(profile.id)
            setAsk(false)
          }}
        >
          Laden
        </Btn>
      </div>
    </Modal>
  )
}
