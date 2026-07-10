import { auth, onAuthStateChanged, db, ref, get } from "./firebase-config.js";

const inputRicerca = document.getElementById("ricercaGlobale");
const risultatiDiv = document.getElementById("topbarRisultati");

if (inputRicerca) {
  let players = {};
  let trainings = {};
  let datiCaricati = false;

  // Carico i dati solo quando l'utente è autenticato, e solo una volta
  onAuthStateChanged(auth, async (user) => {
    if (!user || datiCaricati) return;
    try {
      const [snapPlayers, snapTrainings] = await Promise.all([
        get(ref(db, "players")),
        get(ref(db, "trainings"))
      ]);
      players = snapPlayers.exists() ? snapPlayers.val() : {};
      trainings = snapTrainings.exists() ? snapTrainings.val() : {};
      datiCaricati = true;
    } catch (err) {
      console.error("Errore caricamento dati ricerca:", err);
    }
  });

  function formattaData(dataStr) {
    if (!dataStr) return "-";
    const [anno, mese, giorno] = dataStr.split("-");
    return `${giorno}/${mese}/${anno}`;
  }

  function eseguiRicerca() {
    const testo = inputRicerca.value.trim().toLowerCase();
    if (!testo) {
      risultatiDiv.classList.remove("attivo");
      risultatiDiv.innerHTML = "";
      return;
    }

    const risultatiGiocatori = Object.keys(players)
      .filter(id => (players[id].nome || "").toLowerCase().includes(testo))
      .slice(0, 5);

    const risultatiAllenamenti = Object.keys(trainings)
      .filter(id => (trainings[id].titolo || "").toLowerCase().includes(testo))
      .slice(0, 5);

    if (risultatiGiocatori.length === 0 && risultatiAllenamenti.length === 0) {
      risultatiDiv.innerHTML = `<div class="nessun-risultato">Nessun risultato per "${testo}"</div>`;
      risultatiDiv.classList.add("attivo");
      return;
    }

    let html = "";

    risultatiGiocatori.forEach(id => {
      const p = players[id];
      html += `
        <a href="giocatori.html?id=${id}">
          <span>${p.nome}${p.ruolo ? " · " + p.ruolo : ""}</span>
          <span class="tipo-risultato">Giocatore</span>
        </a>
      `;
    });

    risultatiAllenamenti.forEach(id => {
      const t = trainings[id];
      html += `
        <a href="allenamenti.html?id=${id}">
          <span>${t.titolo}${t.data ? " · " + formattaData(t.data) : ""}</span>
          <span class="tipo-risultato">Allenamento</span>
        </a>
      `;
    });

    risultatiDiv.innerHTML = html;
    risultatiDiv.classList.add("attivo");
  }

  inputRicerca.addEventListener("input", eseguiRicerca);
  inputRicerca.addEventListener("focus", () => {
    if (inputRicerca.value.trim()) risultatiDiv.classList.add("attivo");
  });

  // Chiudo i risultati se clicco fuori
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar-ricerca")) {
      risultatiDiv.classList.remove("attivo");
    }
  });
}
