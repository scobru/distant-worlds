# Distant Worlds

Premi **Genera mondo**: nasce un pianeta nuovo, con paesaggio e colonna sonora generativa.
Tutto deriva da un seed nell'URL (`…/#k3x9q2`): condividi il link e chi lo apre vede e sente lo stesso mondo.

- Ogni mondo pesca anche: epoca (antico … lontano futuro), civiltà (disabitato, umani, alieni, rovine) con i suoi abitanti, fauna (uccelli, branchi, meduse del cielo, giganti, balene volanti), flora (foresta, conifere, cristalli, funghi) e stile visivo (classico, neon, pastello, mono, seppia). Epoca e civiltà cambiano anche il suono.
- Ogni mondo si percorre all'infinito (frecce / A-D, trascinamento o **Cammina**): terreno, strutture, creature e reperti rari sono generati a pezzi man mano che servono. Il link condiviso include la posizione (`#seed@12.5`).
- **Galassia**: ogni mondo generato è una stella su una mappa (10.000 × 10.000 settori, `#v1-<x>_<y>_<n>`); regioni come la Nebulosa aliena o i Mari del cielo cambiano ciò che vi nasce.
- **Specie componibili**: gli animali sono costruiti da parti (zampe, collo, testa, corna, coda, motivo) e finiscono nel bestiario.
- **Musica** (`audio.js`): ogni mondo ha il suo strumento solista (campana, vetro, pizzico, marimba, flauto), bordone (organo, vento, coro), eventuali pad / basso / percussioni e un riverbero; si arricchisce quando sullo schermo succede di più.
- Gioco, tutto nel browser (`localStorage`, niente server):
  - **rarità**: ogni tratto ha un peso, il mondo è comune / raro / epico / leggendario;
  - **atlante**: tratti e combinazioni civiltà × epoca scoperti, traguardi, diario dei mondi salvati;
  - **mondo del giorno** (`#v1-giorno-AAAA-MM-GG`) con missione giornaliera e serie di giorni consecutivi.
- I seed hanno la versione del generatore (`v1-…`): una v2 futura deve continuare a generare i `v1` allo stesso modo.
- Statico, zero dipendenze, nessun build: `index.html` + `world.js`.
- Deterministico: `makeWorld(seed)` è una funzione pura (`node world.test.mjs && node atlas.test.mjs`).
- Gira ovunque si servano file statici: GitHub Pages, IPFS, o come web app su Freenet.

Locale: `python3 -m http.server` e apri http://localhost:8000.
