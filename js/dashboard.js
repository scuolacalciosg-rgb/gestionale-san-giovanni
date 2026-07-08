import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const visiteScadenzaDiv = document.getElementById("visiteScadenza");
const prossimoAllenamentoDiv = document.getElementById("prossimoAllenamento");
const ultimeNotizieDiv = document.getElementById("ultimeNotizie");

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// ============================================
// VISITE MEDICHE IN SCADENZA
// ============================================
async function caricaVisiteScadenza() {
  try {
    const snap = await get(ref(db, "players"));
    const players = snap.exists() ? Object.values(snap.val()) : [];

    const oggi = new Date().toISOString().split("T")[0];
    const tra30gg = new Date();
    tra30gg.setDate(tra30gg.getDate() + 30);
    const tra30ggStr = tra30gg.toISOString().split("T")[0];

    const inScadenza = players
      .filter(p => p.visita && p.visita <= tra30ggStr)
      .sort((a, b) => a.visita.localeCompare(b.visita));

    if (inScadenza.length === 0) {
      visiteScadenzaDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessuna visita medica in scadenza nei prossimi 30 giorni. ✅</p>`;
      return;
    }

    visiteScadenzaDiv.innerHTML = inScadenza.map(p => {
      const scaduta = p.visita < oggi;
      return `
        <div class="allenamento-card" style="border-left:4px solid ${scaduta ? "var(--rosso)" : "#e6a700"}; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${p.nome || "Giocatore"}</strong>
            <div style="font-size:0.85rem; color:var(--testo-chiaro);">${p.ruolo || "-"}</div>
          </div>
          <span class="tag-cat" style="color:${scaduta ? "var(--rosso)" : "#a67c00"};">
            ${scaduta ? "Scaduta il" : "Scade il"} ${formattaData(p.visita)}
          </span>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    visiteScadenzaDiv.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

// ============================================
// PROSSIMI 3 ALLENAMENTI
// ============================================
async function caricaProssimiAllenamenti() {
  try {
    const snap = await get(ref(db, "trainings"));
    const trainings = snap.exists() ? Object.values(snap.val()) : [];

    const oggi = new Date().toISOString().split("T")[0];
    const futuri = trainings
      .filter(t => t.data >= oggi)
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 3);

    if (futuri.length === 0) {
      prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun allenamento futuro in programma.</p>`;
      return;
    }

    prossimoAllenamentoDiv.innerHTML = futuri.map(prox => {
      const durataTotale = (prox.esercizi || []).reduce((s, e) => s + Number(e.dur || 0), 0);
      return `
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
    }).join("");
  } catch (err) {
    console.error(err);
    prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

// ============================================
// ULTIME NOTIZIE
// ============================================
async function caricaNotizie() {
  try {
    const snap = await get(ref(db, "news"));
    const notizie = snap.exists() ? Object.values(snap.val()) : [];

    if (notizie.length === 0) {
      ultimeNotizieDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessuna notizia pubblicata.</p>`;
      return;
    }

    // Ordino dalla più recente usando il timestamp
    notizie.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));

    ultimeNotizieDiv.innerHTML = notizie.slice(0, 5).map(n => `
      <div class="allenamento-card">
        <div class="data-riga">
          <h3>${n.titolo || "Notizia"}</h3>
          <span class="tag-cat">${n.data || ""}</span>
        </div>
        ${n.body ? `<p style="font-size:0.9rem; color:var(--testo-chiaro);">${n.body}</p>` : ""}
        ${n.autore ? `<p style="font-size:0.8rem; color:var(--testo-chiaro); margin-top:6px; text-align:right;">— ${n.autore}</p>` : ""}
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    ultimeNotizieDiv.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

caricaVisiteScadenza();
caricaProssimiAllenamenti();
caricaNotizie();
