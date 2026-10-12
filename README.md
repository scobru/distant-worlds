# Distant Worlds

Premi **Genera mondo**: nasce un pianeta nuovo, con paesaggio e colonna sonora generativa.
Tutto deriva da un seed nell'URL (`…/#k3x9q2`): condividi il link e chi lo apre vede e sente lo stesso mondo.

- Ogni mondo pesca anche: epoca (antico … lontano futuro), civiltà (disabitato, umani, alieni, rovine) con i suoi abitanti, fauna (uccelli, branchi, meduse del cielo, giganti, balene volanti), flora (foresta, conifere, cristalli, funghi) e stile visivo (classico, neon, pastello, mono, seppia). Epoca e civiltà cambiano anche il suono.
- Statico, zero dipendenze, nessun build: `index.html` + `world.js`.
- Deterministico: `makeWorld(seed)` è una funzione pura (`node world.test.mjs` lo verifica).
- Gira ovunque si servano file statici: GitHub Pages, IPFS, o come web app su Freenet.

Locale: `python3 -m http.server` e apri http://localhost:8000.
