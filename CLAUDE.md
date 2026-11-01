# LiveTrak L-20 Web Mixer

Architekturregeln, geprüft von `npm run audit` (scripts/audit.sh, läuft in CI):

1. `src/ui` spricht nur über den Store (`src/state`) mit dem Mixer, nie direkt mit `src/transport`.
2. `src/state` importiert nichts aus `src/ui`.
3. `src/transport` importiert weder `src/state` noch `src/ui`.

`src/lib` darf von überall importiert werden. Vor jedem Push: `npm run check`.
