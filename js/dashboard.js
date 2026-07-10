import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const dataOggiEl = document.getElementById("dataOggi");
const visiteScadenzaDiv = document.getElementById("visiteScadenza");
const prossimoAllenamentoDiv = document.getElementById("prossimoAllenamento");
const ultimeNotizieDiv = document.getElementById("ultimeNotizie");

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// ============================================
// DATA DI OGGI (si aggiorna da sola ogni giorno)
// ============================================
function mostraDataOggi() {
  const oggi = new Date();
  const formattata = oggi.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  dataOggiEl.textContent = formattata;
}

// ============================================
// VISITE MEDICHE IN SCADENZA (avviso compatto)
// ============================================
async function caricaVisiteScadenza() {
  try {
    const snap = await get(ref(db, "players"));
    const players = snap.exists() ? Object.values(snap.val()) : [];

    const tra30gg = new Date();
    tra30gg.setDate(tra30gg.getDate() + 30);
    const tra30ggStr = tra30gg.toISOString().split("T")[0];

    const inScadenza = players.filter(p => p.visita && p.visita <= tra30ggStr);

    if (inScadenza.length === 0) {
      visiteScadenzaDiv.innerHTML = "";
      return;
    }

    const nomi = inScadenza.map(p => p.nome).join(", ");
    visiteScadenzaDiv.innerHTML = `
      <div class="avviso-scadenza">
        ⚠️ Visite mediche in scadenza (30gg): ${nomi}
      </div>
    `;
  } catch (err) {
    console.error(err);
  }
}

// ============================================
// PROSSIMI 3 ALLENAMENTI (mini card cliccabili)
// ============================================
async function caricaProssimiAllenamenti() {
  try {
    const snap = await get(ref(db, "trainings"));
    const trainings = snap.exists() ? snap.val() : {};

    const oggi = new Date().toISOString().split("T")[0];
    const ids = Object.keys(trainings)
      .filter(id => trainings[id].data >= oggi)
      .sort((a, b) => trainings[a].data.localeCompare(trainings[b].data))
      .slice(0, 3);

    if (ids.length === 0) {
      prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun allenamento futuro in programma.</p>`;
      return;
    }

    prossimoAllenamentoDiv.innerHTML = ids.map(id => {
      const t = trainings[id];
      return `
        <a class="mini-card" href="allenamenti.html?id=${id}">
          <h3>${t.titolo || "Allenamento"}</h3>
          <div class="mini-meta">📅 ${formattaData(t.data)} · ore ${t.ora || "--"} · 📍 ${t.luogo || "-"}</div>
        </a>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

// ============================================
// ULTIME 3 NOTIZIE/COMUNICAZIONI (mini card)
// ============================================
async function caricaNotizie() {
  try {
    const snap = await get(ref(db, "news"));
    const notizie = snap.exists() ? Object.values(snap.val()) : [];

    if (notizie.length === 0) {
      ultimeNotizieDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessuna comunicazione pubblicata.</p>`;
      return;
    }

    notizie.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));

    ultimeNotizieDiv.innerHTML = notizie.slice(0, 3).map(n => `
      <div class="mini-card">
        <h3>${n.titolo || "Comunicazione"}</h3>
        <div class="mini-meta">${n.data || ""}${n.autore ? " · " + n.autore : ""}</div>
        ${n.body ? `<div class="mini-testo">${n.body}</div>` : ""}
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    ultimeNotizieDiv.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

mostraDataOggi();
caricaVisiteScadenza();
caricaProssimiAllenamenti();
caricaNotizie();
