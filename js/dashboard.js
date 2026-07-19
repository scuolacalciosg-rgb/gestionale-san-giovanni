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

// Converte una data in "YYYY-MM-DD" usando le componenti LOCALI (non UTC),
// per evitare lo sfasamento di un giorno che si verifica in Italia vicino alla mezzanotte
function isoLocale(d) {
  const anno = d.getFullYear();
  const mese = String(d.getMonth() + 1).padStart(2, "0");
  const giorno = String(d.getDate()).padStart(2, "0");
  return `${anno}-${mese}-${giorno}`;
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
    const tra30ggStr = isoLocale(tra30gg);

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
// PROSSIMI 3 EVENTI (allenamenti + partite + tornei, mini card cliccabili)
// ============================================
async function caricaProssimiEventi() {
  try {
    const [snapTrainings, snapPartite, snapTornei] = await Promise.all([
      get(ref(db, "trainings")),
      get(ref(db, "partite")),
      get(ref(db, "tornei"))
    ]);
    const trainings = snapTrainings.exists() ? snapTrainings.val() : {};
    const partite = snapPartite.exists() ? snapPartite.val() : {};
    const tornei = snapTornei.exists() ? snapTornei.val() : {};

    const oggi = isoLocale(new Date());
    const eventi = [];

    Object.keys(trainings).forEach(id => {
      const t = trainings[id];
      if (t.data >= oggi) eventi.push({ tipo: "allenamento", icona: "📋", data: t.data, ora: t.ora, titolo: t.titolo || "Allenamento", extra: t.luogo, link: `allenamenti.html?id=${id}` });
    });

    Object.keys(partite).forEach(id => {
      const p = partite[id];
      if (p.data >= oggi) eventi.push({ tipo: "partita", icona: "⚽", data: p.data, ora: p.orarioInizio, titolo: `vs ${p.avversario || "?"}`, extra: p.campo, link: `calendario.html?data=${p.data}` });
    });

    Object.keys(tornei).forEach(id => {
      const t = tornei[id];
      if (t.data >= oggi) eventi.push({ tipo: "torneo", icona: "🏆", data: t.data, ora: "", titolo: t.titolo || "Torneo", extra: t.luogo, link: `calendario.html?data=${t.data}` });
    });

    eventi.sort((a, b) => a.data.localeCompare(b.data));
    const prossimi = eventi.slice(0, 3);

    if (prossimi.length === 0) {
      prossimoAllenamentoDiv.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun evento futuro in programma.</p>`;
      return;
    }

    prossimoAllenamentoDiv.innerHTML = prossimi.map(ev => `
      <a class="mini-card" href="${ev.link}">
        <h3>${ev.icona} ${ev.titolo}</h3>
        <div class="mini-meta">📅 ${formattaData(ev.data)}${ev.ora ? " · ore " + ev.ora : ""}${ev.extra ? " · 📍 " + ev.extra : ""}</div>
      </a>
    `).join("");
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
caricaProssimiEventi();
caricaNotizie();
