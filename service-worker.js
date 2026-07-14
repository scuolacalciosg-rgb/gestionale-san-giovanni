// ============================================
// SERVICE WORKER - Gestionale San Giovanni
// ============================================
// Permette all'app di essere "installata" sul telefono/computer e di aprirsi
// anche con connessione debole, mostrando le pagine già visitate una volta.
// NOTA: i dati veri (Firebase) richiedono sempre connessione internet:
// qui mettiamo in cache solo i file del sito (html, css, js, immagini).

const NOME_CACHE = "gestionale-sg-v1";

const FILE_DA_METTERE_IN_CACHE = [
  "dashboard.html",
  "giocatori.html",
  "allenamenti.html",
  "esercizi.html",
  "rapporti.html",
  "infortuni.html",
  "calendario.html",
  "galleria.html",
  "statistiche.html",
  "stagioni.html",
  "css/style.css",
  "assets/stemma.png"
];

// All'installazione, provo a salvare in cache le pagine principali
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(NOME_CACHE).then((cache) => {
      return cache.addAll(FILE_DA_METTERE_IN_CACHE).catch(() => {
        // Se qualche file non si carica, non blocco comunque l'installazione
      });
    })
  );
  self.skipWaiting();
});

// Pulisco le vecchie versioni della cache quando ne creo una nuova
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomiCache) => {
      return Promise.all(
        nomiCache.filter((nome) => nome !== NOME_CACHE).map((nome) => caches.delete(nome))
      );
    })
  );
  self.clients.claim();
});

// Strategia: per i file del nostro sito, prova prima la rete (dati sempre aggiornati),
// se non c'è connessione usa la copia salvata in cache.
// Per tutto il resto (Firebase, OpenRouter, ecc.) lascio passare direttamente alla rete.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Solo per richieste dello stesso sito (non Firebase/API esterne)
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((rispostaRete) => {
        // Aggiorno la cache con la versione più recente
        const copia = rispostaRete.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(event.request, copia));
        return rispostaRete;
      })
      .catch(() => {
        // Nessuna connessione: provo con la cache
        return caches.match(event.request);
      })
  );
});
