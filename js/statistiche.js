import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const classificaMarcatori = document.getElementById("classificaMarcatori");
const classificaAssist = document.getElementById("classificaAssist");
const tabellaPresenze = document.getElementById("tabellaPresenze");

let playersCache = {};
let partiteCache = {};
let torneiCache = {};
let trainingsCache = {};
let presenzeCache = {};
let rapportiCache = {};

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// ============================================
// CARICAMENTO
// ============================================
async function caricaTutto() {
  try {
    const [snapPlayers, snapPartite, snapTornei, snapTrainings, snapPresenze, snapRapporti] = await Promise.all([
      get(ref(db, "players")),
      get(ref(db, "partite")),
      get(ref(db, "tornei")),
      get(ref(db, "trainings")),
      get(ref(db, "presenze")),
      get(ref(db, "rapporti"))
    ]);
    playersCache = snapPlayers.exists() ? snapPlayers.val() : {};
    partiteCache = snapPartite.exists() ? snapPartite.val() : {};
    torneiCache = snapTornei.exists() ? snapTornei.val() : {};
    trainingsCache = snapTrainings.exists() ? snapTrainings.val() : {};
    presenzeCache = snapPresenze.exists() ? snapPresenze.val() : {};
    rapportiCache = snapRapporti.exists() ? snapRapporti.val() : {};

    calcolaERender();
  } catch (err) {
    console.error(err);
    classificaMarcatori.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

// ============================================
// AGGREGAZIONE GOL / ASSIST / CONVOCAZIONI (da partite + tornei)
// ============================================
function aggregaStatistichePartite() {
  const stats = {}; // playerId -> {gol, assist, convocazioni}

  function aggiungiConvocati(convocati) {
    (convocati || []).forEach(c => {
      if (!c.giocatoreKey) return;
      if (!stats[c.giocatoreKey]) stats[c.giocatoreKey] = { gol: 0, assist: 0, convocazioni: 0 };
      stats[c.giocatoreKey].gol += Number(c.gol || 0);
      stats[c.giocatoreKey].assist += Number(c.assist || 0);
      stats[c.giocatoreKey].convocazioni += 1;
    });
  }

  Object.values(partiteCache).forEach(p => aggiungiConvocati(p.convocati));
  Object.values(torneiCache).forEach(t => (t.partite || []).forEach(p => aggiungiConvocati(p.convocati)));

  return stats;
}

// ============================================
// AGGREGAZIONE PRESENZE ALLENAMENTI
// ============================================
function aggregaPresenzeAllenamenti() {
  const stats = {}; // playerId -> {presente, assente, giustificato, totaleRegistrato}

  Object.keys(presenzeCache).forEach(chiaveTraining => {
    const registro = presenzeCache[chiaveTraining];
    Object.keys(registro).forEach(playerId => {
      const stato = registro[playerId];
      if (stato === "none" || !stato) return;
      if (!stats[playerId]) stats[playerId] = { presente: 0, assente: 0, giustificato: 0, totaleRegistrato: 0 };
      stats[playerId][stato] = (stats[playerId][stato] || 0) + 1;
      stats[playerId].totaleRegistrato += 1;
    });
  });

  return stats;
}

// ============================================
// RENDER CLASSIFICHE E TABELLA
// ============================================
function calcolaERender() {
  const statsPartite = aggregaStatistichePartite();
  const statsPresenze = aggregaPresenzeAllenamenti();

  // ---- Classifica marcatori ----
  const idsGol = Object.keys(statsPartite).filter(id => statsPartite[id].gol > 0).sort((a, b) => statsPartite[b].gol - statsPartite[a].gol);
  classificaMarcatori.innerHTML = idsGol.length === 0
    ? `<p style="color:var(--testo-chiaro);">Nessun gol registrato ancora.</p>`
    : idsGol.map((id, i) => `
        <div class="classifica-riga">
          <span class="posizione">${i + 1}</span>
          <span class="nome-riga">${playersCache[id]?.nome || "Giocatore"}</span>
          <span class="valore-riga">${statsPartite[id].gol} gol</span>
        </div>
      `).join("");

  // ---- Classifica assist ----
  const idsAssist = Object.keys(statsPartite).filter(id => statsPartite[id].assist > 0).sort((a, b) => statsPartite[b].assist - statsPartite[a].assist);
  classificaAssist.innerHTML = idsAssist.length === 0
    ? `<p style="color:var(--testo-chiaro);">Nessun assist registrato ancora.</p>`
    : idsAssist.map((id, i) => `
        <div class="classifica-riga">
          <span class="posizione">${i + 1}</span>
          <span class="nome-riga">${playersCache[id]?.nome || "Giocatore"}</span>
          <span class="valore-riga">${statsPartite[id].assist} assist</span>
        </div>
      `).join("");

  // ---- Tabella presenze + pulsante report ----
  const idsGiocatori = Object.keys(playersCache).sort((a, b) => (playersCache[a].nome || "").localeCompare(playersCache[b].nome || ""));

  tabellaPresenze.innerHTML = `
    <table class="tabella-presenze">
      <thead>
        <tr>
          <th>Giocatore</th>
          <th>Presenze allenamenti</th>
          <th>Partite convocato</th>
          <th>Gol / Assist</th>
          <th>Report</th>
        </tr>
      </thead>
      <tbody>
        ${idsGiocatori.map(id => {
          const p = statsPresenze[id];
          const percentuale = p && p.totaleRegistrato > 0 ? Math.round((p.presente / p.totaleRegistrato) * 100) : null;
          const sp = statsPartite[id] || { gol: 0, assist: 0, convocazioni: 0 };
          return `
            <tr>
              <td>${playersCache[id].nome}</td>
              <td>
                ${percentuale !== null
                  ? `<span class="barra-presenza"><span class="barra-presenza-riempimento" style="width:${percentuale}%;"></span></span>${percentuale}% (${p.presente}/${p.totaleRegistrato})`
                  : `<span style="color:var(--testo-chiaro);">N/D</span>`}
              </td>
              <td>${sp.convocazioni}</td>
              <td>${sp.gol} / ${sp.assist}</td>
              <td><button class="btn-secondary btn-report" data-id="${id}">🖨️ Report</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  tabellaPresenze.querySelectorAll(".btn-report").forEach(btn => {
    btn.addEventListener("click", () => stampaReportGiocatore(btn.dataset.id, statsPartite[btn.dataset.id], statsPresenze[btn.dataset.id]));
  });
}

// ============================================
// REPORT STAMPABILE PER GIOCATORE
// ============================================
function stampaReportGiocatore(playerId, statPartite, statPresenze) {
  const p = playersCache[playerId];
  if (!p) return;

  const sp = statPartite || { gol: 0, assist: 0, convocazioni: 0 };
  const pr = statPresenze || { presente: 0, assente: 0, giustificato: 0, totaleRegistrato: 0 };
  const percentuale = pr.totaleRegistrato > 0 ? Math.round((pr.presente / pr.totaleRegistrato) * 100) : null;

  const idsRapp = Object.keys(rapportiCache)
    .filter(id => rapportiCache[id].giocatoreKey === playerId)
    .sort((a, b) => (rapportiCache[a].data || "").localeCompare(rapportiCache[b].data || ""));

  const rapportiHtml = idsRapp.map(id => {
    const r = rapportiCache[id];
    return `
      <div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid #ddd;">
        <div style="font-weight:bold; margin-bottom:4px;">${formattaData(r.data)} — ${r.contesto || "-"} (voto ${r.voto || "-"}/5)</div>
        ${r.comportamento ? `<div><strong>Comportamento:</strong> ${r.comportamento}</div>` : ""}
        ${r.tecnica ? `<div><strong>Tecnica:</strong> ${r.tecnica}</div>` : ""}
        ${r.migliorare ? `<div><strong>Da migliorare:</strong> ${r.migliorare}</div>` : ""}
        ${r.note ? `<div><strong>Note:</strong> ${r.note}</div>` : ""}
      </div>
    `;
  }).join("") || "<p>Nessun rapporto registrato.</p>";

  const html = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <title>Report ${p.nome}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 30px; color: #1c1c1c; max-width: 800px; margin: 0 auto; }
        h1 { color: #000; border-bottom: 3px solid #d6362e; padding-bottom: 10px; margin-bottom: 4px; }
        .sub { color: #555; margin-bottom: 20px; font-size: 14px; }
        .stats-grid { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .stat-box { background: #f4f4f2; border-radius: 8px; padding: 12px 18px; text-align: center; min-width: 100px; }
        .stat-box .n { font-size: 22px; font-weight: bold; color: #1a1a1a; }
        .stat-box .l { font-size: 11px; color: #666; }
        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-top: 28px; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <h1>${p.nome}</h1>
      <div class="sub">${p.ruolo || "-"} · #${p.numero || "-"} · Report generato il ${new Date().toLocaleDateString("it-IT")}</div>

      <div class="stats-grid">
        <div class="stat-box"><div class="n">${sp.convocazioni}</div><div class="l">Partite convocato</div></div>
        <div class="stat-box"><div class="n">${sp.gol}</div><div class="l">Gol</div></div>
        <div class="stat-box"><div class="n">${sp.assist}</div><div class="l">Assist</div></div>
        <div class="stat-box"><div class="n">${percentuale !== null ? percentuale + "%" : "N/D"}</div><div class="l">Presenza allenamenti</div></div>
      </div>

      <h2>Cronologia rapporti (${idsRapp.length})</h2>
      ${rapportiHtml}
    </body>
    </html>
  `;

  const finestra = window.open("", "_blank");
  finestra.document.write(html);
  finestra.document.close();
  finestra.focus();
  setTimeout(() => finestra.print(), 300);
}

caricaTutto();
