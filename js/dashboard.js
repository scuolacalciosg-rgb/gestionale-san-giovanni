import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const cardsGrid = document.getElementById("cardsGrid");
const prossimoAllenamentoDiv = document.getElementById("prossimoAllenamento");

function formattaData(dataStr) {
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

async function caricaDashboard() {
  try {
    // ---- Carico giocatori ----
    const playersSnap = await get(ref(db, "players"));
    const players = playersSnap.exists() ? Object.values(playersSnap.val()) : [];

    const totaleGiocatori = players.length;
    const disponibili = players.filter(p => p.stato === "Disponibile").length;
    const infortunati = players.filter(p => p.stato === "Infortunato").length;

    // ---- Carico allenamenti ----
    const trainingsSnap = await get(ref(db, "trainings"));
    const trainings = trainingsSnap.exists() ? Object.values(trainingsSnap.val()) : [];

    const oggi = new Date().toISOString().split("T")[0];
    const futuri = trainings
      .filter(t => t.data >= oggi)
      .sort((a, b) => a.data.localeCompare(b.data));

    // ---- Renderizzo le card numeriche ----
    cardsGrid.innerHTML = `
      <div class="card">
        <div class="numero">${totaleGiocatori}</div>
        <div class="etichetta">Giocatori totali</div>
      </div>
      <div class="card">
        <div class="numero">${disponibili}</div>
        <div class="etichetta">Disponibili</div>
      </div>
      <div class="card">
        <div class="numero">${infortunati}</div>
        <div class="etichetta">Infortunati</div>
      </div>
      <div class="card">
        <div class="numero">${trainings.length}</div>
        <div class="etichetta">Allenamenti totali</div>
      </div>
    `;

    // ---- Renderizzo il prossimo allenamento ----
    if (futuri.length > 0) {
      const prox = futuri[0];
      const durataTotale = (prox.esercizi || []).reduce((somma, e) => somma + Number(e.dur || 0), 0);
      prossimoAllenamentoDiv.innerHTML = `
        <div class="allenamento-card">
          <div class="data-riga">
            <h3>${prox.titolo || "Allenamento"}</h3>
            <span class="tag-cat">${formattaData(prox.data)} - ore ${prox.ora || "--"}</span>
          </div>
          <p style="margin-bottom:8px; color:var(--testo-chiaro); font-size:0.9rem;">
            📍 ${prox.luogo || "-"} · ⏱️ ${durataTotale} min totali
          </p>
          ${(prox.esercizi || []).map(e => `
            <div class="esercizio-riga">
              <span>${e.nome}</span>
              <span class="tag-cat">${e.cat} · ${e.dur}'</span>
            </div>
          `).join("")}
        </div>
      `;
    } else {
      prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun allenamento futuro in programma.</p>`;
    }

  } catch (err) {
    console.error(err);
    cardsGrid.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento dei dati: ${err.message}</p>`;
  }
}

caricaDashboard();
