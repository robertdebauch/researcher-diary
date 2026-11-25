# Researcher's Diary

A local-first PWA for recording walks and collecting small discoveries along the way.

During a walk, the app traces your route on a map. When something catches your eye, you can photograph it, add a short note, and keep it as a finding — tied to the place and time where you found it. Each walk has a goal; afterwards the diary shows where you went, what you found, and when. Past walks remain in the archive.

- Route recording with pause and resume
- Photo findings with notes, places, and times
- A goal for each walk and a summary afterwards
- Archive of previous walks
- Optional photo recognition with your own API key
- Installable PWA that works offline (map tiles need a network)

Walks and photos are stored locally in the browser: no accounts, no server, no analytics. Photo recognition is optional and only runs when you ask for it.

Built with React, Leaflet, and IndexedDB. A personal, experimental project.
