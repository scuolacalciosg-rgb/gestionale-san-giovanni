import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

// ============================================
// ELEMENTI DOM
// ============================================
const titoloMese = document.getElementById("titoloMese");
const btnMesePrec = document.getElementById("btnMesePrec");
const btnMeseSucc = document.getElementById("btnMeseSucc");
const calendarioGrid = document.getElementById("calendarioGrid");
const titoloGiornoSelezionato = document.getElementById("titoloGiornoSelezionato");
const listaEventiGiorno = document.getElementById("listaEventiGiorno");
const btnNuovoEvento = document.getElementById("btnNuovoEvento");

const overlayEvento = document.getElementById("overlayEvento");
const modaleTitoloEvento = document.getElementById("modaleTitoloEvento");
const campoTipoEvento = document.getElementById("campoTipoEvento");
const btnAnnullaEvento = document.getElementById("btnAnnullaEvento");
const btnSalvaEvento = document.getElementById("btnSalvaEvento");
const btnEliminaEvento = document.getElementById("btnEliminaEvento");
const listaConvocatiPartita = document.getElementById("listaConvocatiPartita");
const listaPartiteTorneo = document.getElementById("listaPartiteTorneo");
const btnAggiungiPartitaTorneo = document.getElementById("btnAggiungiPartitaTorneo");

// ============================================
// STATO
// ============================================
let playersCache = {};
let trainingsCache = {};
let newsCache = {};
let partiteCache = {};
let torneiCache = {};
let riunioniCache = {};

let meseVisualizzato = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let giornoSelezionato = isoDaData(new Date());

let eventoInModifica = null; // { tipo, id } oppure null per nuovo

// ============================================
// UTILITY DATE
// ============================================
function formattaDataISO(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// Converte una data in formato "DD/MM/YYYY" (usata da news) in "YYYY-MM-DD"
function convertiDataItalianaISO(dataItaliana) {
  if (!dataItaliana) return "";
  const parti = dataItaliana.split("/");
  if (parti.length !== 3) return "";
  const [giorno, mese, anno] = parti;
  return `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
}

function isoDaData(d) {
  // Uso le componenti locali (non UTC) per evitare lo sfasamento di un giorno
  // che si verifica in Italia con toISOString() vicino alla mezzanotte
  const anno = d.getFullYear();
  const mese = String(d.getMonth() + 1).padStart(2, "0");
  const giorno = String(d.getDate()).padStart(2, "0");
  return `${anno}-${mese}-${giorno}`;
}

// ============================================
// CARICAMENTO DATI
// ============================================
async function caricaTutto() {
  try {
    const [snapPlayers, snapTrainings, snapNews, snapPartite, snapTornei, snapRiunioni] = await Promise.all([
      get(ref(db, "players")),
      get(ref(db, "trainings")),
      get(ref(db, "news")),
      get(ref(db, "partite")),
      get(ref(db, "tornei")),
      get(ref(db, "riunioni"))
    ]);
    playersCache = snapPlayers.exists() ? snapPlayers.val() : {};
    trainingsCache = snapTrainings.exists() ? snapTrainings.val() : {};
    newsCache = snapNews.exists() ? snapNews.val() : {};
    partiteCache = snapPartite.exists() ? snapPartite.val() : {};
    torneiCache = snapTornei.exists() ? snapTornei.val() : {};
    riunioniCache = snapRiunioni.exists() ? snapRiunioni.val() : {};

    renderCalendario();
    renderEventiGiorno();
  } catch (err) {
    console.error(err);
    listaEventiGiorno.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento: ${err.message}</p>`;
  }
}

// ============================================
// COSTRUZIONE ELENCO EVENTI PER DATA (YYYY-MM-DD -> lista eventi)
// ============================================
function costruisciMappaEventi() {
  const mappa = {}; // dataISO -> [{tipo, id, titolo, ...}]

  function aggiungi(dataISO, evento) {
    if (!dataISO) return;
    if (!mappa[dataISO]) mappa[dataISO] = [];
    mappa[dataISO].push(evento);
  }

  Object.keys(trainingsCache).forEach(id => {
    const t = trainingsCache[id];
    aggiungi(t.data, { tipo: "allenamento", id, titolo: t.titolo || "Allenamento", ora: t.ora, extra: t.luogo });
  });

  Object.keys(newsCache).forEach(id => {
    const n = newsCache[id];
    const dataISO = convertiDataItalianaISO(n.data);
    aggiungi(dataISO, { tipo: "comunicazione", id, titolo: n.titolo || "Comunicazione", extra: n.autore });
  });

  Object.keys(partiteCache).forEach(id => {
    const p = partiteCache[id];
    const risultato = (p.golNostri !== null && p.golNostri !== undefined && p.golAvversario !== null && p.golAvversario !== undefined)
      ? ` (${p.golNostri}-${p.golAvversario})` : "";
    aggiungi(p.data, { tipo: "partita", id, titolo: `vs ${p.avversario || "?"}${risultato}`, ora: p.orarioInizio, extra: p.campo });
  });

  Object.keys(torneiCache).forEach(id => {
    const t = torneiCache[id];
    aggiungi(t.data, { tipo: "torneo", id, titolo: t.titolo || "Torneo", extra: t.luogo });
  });

  Object.keys(riunioniCache).forEach(id => {
    const r = riunioniCache[id];
    aggiungi(r.data, { tipo: "riunione", id, titolo: r.titolo || "Riunione", ora: r.ora, extra: r.luogo });
  });

  return mappa;
}

// ============================================
// RENDER CALENDARIO MENSILE
// ============================================
function renderCalendario() {
  const anno = meseVisualizzato.getFullYear();
  const mese = meseVisualizzato.getMonth();

  const nomeMese = meseVisualizzato.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  titoloMese.textContent = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);

  const mappaEventi = costruisciMappaEventi();

  const primoGiorno = new Date(anno, mese, 1);
  const ultimoGiorno = new Date(anno, mese + 1, 0);
  const offsetIniziale = (primoGiorno.getDay() + 6) % 7; // lunedì = 0

  const oggiISO = isoDaData(new Date());

  let celle = "";
  for (let i = 0; i < offsetIniziale; i++) {
    celle += `<div class="calendario-cella vuota"></div>`;
  }

  for (let giorno = 1; giorno <= ultimoGiorno.getDate(); giorno++) {
    const dataCorrente = new Date(anno, mese, giorno);
    const dataISO = isoDaData(dataCorrente);
    const eventiGiorno = mappaEventi[dataISO] || [];

    const classiExtra = [
      dataISO === oggiISO ? "oggi" : "",
      dataISO === giornoSelezionato ? "selezionata" : ""
    ].join(" ");

    const puntiniUnici = [...new Set(eventiGiorno.map(e => e.tipo))];

    celle += `
      <div class="calendario-cella ${classiExtra}" data-data="${dataISO}">
        <span class="numero-giorno">${giorno}</span>
        <span class="puntini">
          ${puntiniUnici.map(tipo => `<span class="dot dot-${tipo}"></span>`).join("")}
        </span>
      </div>
    `;
  }

  calendarioGrid.innerHTML = celle;

  calendarioGrid.querySelectorAll(".calendario-cella:not(.vuota)").forEach(cella => {
    cella.addEventListener("click", () => {
      giornoSelezionato = cella.dataset.data;
      renderCalendario();
      renderEventiGiorno();
    });
  });
}

// ============================================
// RENDER EVENTI DEL GIORNO SELEZIONATO
// ============================================
function renderEventiGiorno() {
  const mappaEventi = costruisciMappaEventi();
  const eventi = mappaEventi[giornoSelezionato] || [];

  const [anno, mese, giorno] = giornoSelezionato.split("-");
  titoloGiornoSelezionato.textContent = `Eventi del ${giorno}/${mese}/${anno}`;

  if (eventi.length === 0) {
    listaEventiGiorno.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun evento in questo giorno.</p>`;
    return;
  }

  const iconeTipo = { allenamento: "📋", partita: "⚽", torneo: "🏆", riunione: "🗣️", comunicazione: "📰" };
  const nomiTipo = { allenamento: "Allenamento", partita: "Partita", torneo: "Torneo", riunione: "Riunione", comunicazione: "Comunicazione" };

  listaEventiGiorno.innerHTML = eventi.map(ev => `
    <div class="evento-riga-giorno tipo-${ev.tipo}" data-tipo="${ev.tipo}" data-id="${ev.id}">
      <div class="er-header">
        <div>
          <div class="er-tipo">${iconeTipo[ev.tipo]} ${nomiTipo[ev.tipo]}</div>
          <strong>${ev.titolo}</strong>
        </div>
        <span class="tag-cat">${ev.ora ? "ore " + ev.ora : ""} ${ev.extra ? "· " + ev.extra : ""}</span>
      </div>
    </div>
  `).join("");

  listaEventiGiorno.querySelectorAll(".evento-riga-giorno").forEach(riga => {
    riga.addEventListener("click", () => {
      const tipo = riga.dataset.tipo;
      const id = riga.dataset.id;
      if (tipo === "allenamento") {
        window.location.href = `allenamenti.html?id=${id}`;
      } else if (tipo === "comunicazione") {
        apriModificaComunicazione(id);
      } else if (tipo === "partita") {
        apriModificaPartita(id);
      } else if (tipo === "torneo") {
        apriModificaTorneo(id);
      } else if (tipo === "riunione") {
        apriModificaRiunione(id);
      }
    });
  });
}

// ============================================
// NAVIGAZIONE MESE
// ============================================
btnMesePrec.addEventListener("click", () => {
  meseVisualizzato.setMonth(meseVisualizzato.getMonth() - 1);
  renderCalendario();
});

btnMeseSucc.addEventListener("click", () => {
  meseVisualizzato.setMonth(meseVisualizzato.getMonth() + 1);
  renderCalendario();
});

// ============================================
// LISTA CONVOCATI (riutilizzabile per Partita e Torneo)
// ============================================
function creaListaConvocati(convocatiEsistenti = []) {
  const container = document.createElement("div");
  container.className = "lista-convocati";

  const mappaEsistenti = {};
  convocatiEsistenti.forEach(c => { mappaEsistenti[c.giocatoreKey] = c; });

  const ids = Object.keys(playersCache).sort((a, b) => (playersCache[a].nome || "").localeCompare(playersCache[b].nome || ""));

  container.innerHTML = ids.map(id => {
    const p = playersCache[id];
    const esistente = mappaEsistenti[id];
    const checked = !!esistente;
    return `
      <label class="convocato-riga">
        <input type="checkbox" class="conv-check" data-id="${id}" data-nome="${p.nome}" ${checked ? "checked" : ""}>
        <span class="conv-nome">${p.nome}</span>
        <input type="number" class="conv-gol" placeholder="Gol" min="0" value="${esistente?.gol || 0}" style="display:${checked ? "inline-block" : "none"};">
        <input type="number" class="conv-assist" placeholder="Assist" min="0" value="${esistente?.assist || 0}" style="display:${checked ? "inline-block" : "none"};">
      </label>
    `;
  }).join("");

  container.querySelectorAll(".conv-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const riga = chk.closest(".convocato-riga");
      const golInput = riga.querySelector(".conv-gol");
      const assistInput = riga.querySelector(".conv-assist");
      golInput.style.display = chk.checked ? "inline-block" : "none";
      assistInput.style.display = chk.checked ? "inline-block" : "none";
    });
  });

  return container;
}

function leggiConvocati(container) {
  return Array.from(container.querySelectorAll(".conv-check"))
    .filter(chk => chk.checked)
    .map(chk => {
      const riga = chk.closest(".convocato-riga");
      return {
        giocatoreKey: chk.dataset.id,
        giocatoreNome: chk.dataset.nome,
        gol: Number(riga.querySelector(".conv-gol").value) || 0,
        assist: Number(riga.querySelector(".conv-assist").value) || 0
      };
    });
}

// ============================================
// BLOCCHI PARTITA-DEL-TORNEO (dinamici)
// ============================================
function creaBloccoPartitaTorneo(datiPartita = {}) {
  const blocco = document.createElement("div");
  blocco.className = "torneo-partita-block";

  const header = document.createElement("div");
  header.className = "tpb-header";
  header.innerHTML = `
    <input type="text" class="tpb-avversario" placeholder="Nome squadra avversaria" value="${datiPartita.avversario || ""}">
    <button type="button" class="btn-rimuovi-tpb">✕</button>
  `;
  header.querySelector(".btn-rimuovi-tpb").addEventListener("click", () => blocco.remove());

  const listaConv = creaListaConvocati(datiPartita.convocati || []);
  listaConv.classList.add("tpb-convocati");

  blocco.appendChild(header);
  blocco.appendChild(listaConv);
  return blocco;
}

btnAggiungiPartitaTorneo.addEventListener("click", () => {
  listaPartiteTorneo.appendChild(creaBloccoPartitaTorneo());
});

function leggiPartiteTorneo() {
  return Array.from(listaPartiteTorneo.querySelectorAll(".torneo-partita-block")).map(blocco => ({
    avversario: blocco.querySelector(".tpb-avversario").value.trim(),
    convocati: leggiConvocati(blocco.querySelector(".tpb-convocati"))
  })).filter(p => p.avversario);
}

// ============================================
// FORMAZIONE E ROTAZIONI (per le partite)
// ============================================
const listaTempiFormazione = document.getElementById("listaTempiFormazione");
const btnAggiungiTempo = document.getElementById("btnAggiungiTempo");
const btnAggiornaSchema = document.getElementById("btnAggiornaSchema");
const numPortiereForm = document.getElementById("numPortiereForm");
const numDifensoriForm = document.getElementById("numDifensoriForm");
const numCentrocampistiForm = document.getElementById("numCentrocampistiForm");
const numAttaccantiForm = document.getElementById("numAttaccantiForm");

function elencoConvocatiCorrente() {
  return leggiConvocati(listaConvocatiPartita);
}

function creaSlotSelect(convocati, valoreSelezionato) {
  const select = document.createElement("select");
  select.className = "slot-select";
  select.innerHTML = `<option value="">—</option>` +
    convocati.map(c => `<option value="${c.giocatoreKey}" ${c.giocatoreKey === valoreSelezionato ? "selected" : ""}>${c.giocatoreNome}</option>`).join("");
  return select;
}

function creaRigaRuolo(etichetta, quantita, valoriSalvati = []) {
  const riga = document.createElement("div");
  riga.className = "riga-ruolo-campo";
  riga.dataset.ruolo = etichetta;
  const convocati = elencoConvocatiCorrente();
  for (let i = 0; i < quantita; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "slot-giocatore";
    wrapper.appendChild(creaSlotSelect(convocati, valoriSalvati[i] || ""));
    riga.appendChild(wrapper);
  }
  return riga;
}

function creaBloccoTempo(datiTempo = {}) {
  const blocco = document.createElement("div");
  blocco.className = "blocco-tempo";

  const header = document.createElement("div");
  header.className = "blocco-tempo-header";
  header.innerHTML = `
    <input type="text" class="nome-tempo" value="${datiTempo.nome || "1° tempo"}">
    <button type="button" class="btn-rimuovi-tempo">✕ Rimuovi tempo</button>
  `;
  header.querySelector(".btn-rimuovi-tempo").addEventListener("click", () => blocco.remove());

  const campo = document.createElement("div");
  campo.className = "campo-calcio";

  const numPortiere = Number(numPortiereForm.value);
  const numDifensori = Number(numDifensoriForm.value);
  const numCentrocampisti = Number(numCentrocampistiForm.value);
  const numAttaccanti = Number(numAttaccantiForm.value);

  campo.appendChild(creaRigaRuolo("attaccanti", numAttaccanti, datiTempo.attaccanti || []));
  campo.appendChild(creaRigaRuolo("centrocampisti", numCentrocampisti, datiTempo.centrocampisti || []));
  campo.appendChild(creaRigaRuolo("difensori", numDifensori, datiTempo.difensori || []));
  campo.appendChild(creaRigaRuolo("portiere", numPortiere, datiTempo.portiere ? [datiTempo.portiere] : []));

  blocco.appendChild(header);
  blocco.appendChild(campo);
  return blocco;
}

btnAggiungiTempo.addEventListener("click", () => {
  const numeroTempo = listaTempiFormazione.children.length + 1;
  listaTempiFormazione.appendChild(creaBloccoTempo({ nome: `${numeroTempo}° tempo` }));
});

// Quando cambio lo schema (numero giocatori per ruolo), ricreo tutti i blocchi tempo mantenendo i nomi
btnAggiornaSchema.addEventListener("click", () => {
  const bloccchiEsistenti = Array.from(listaTempiFormazione.querySelectorAll(".blocco-tempo"));
  const nomiTempi = bloccchiEsistenti.map(b => b.querySelector(".nome-tempo").value);
  listaTempiFormazione.innerHTML = "";
  if (nomiTempi.length === 0) nomiTempi.push("1° tempo");
  nomiTempi.forEach(nome => listaTempiFormazione.appendChild(creaBloccoTempo({ nome })));
});

function leggiFormazione() {
  const numPortiere = Number(numPortiereForm.value);
  const numDifensori = Number(numDifensoriForm.value);
  const numCentrocampisti = Number(numCentrocampistiForm.value);
  const numAttaccanti = Number(numAttaccantiForm.value);

  const tempi = Array.from(listaTempiFormazione.querySelectorAll(".blocco-tempo")).map(blocco => {
    const leggiRuolo = (ruolo) => Array.from(blocco.querySelectorAll(`.riga-ruolo-campo[data-ruolo="${ruolo}"] select`)).map(s => s.value).filter(Boolean);
    return {
      nome: blocco.querySelector(".nome-tempo").value.trim() || "Tempo",
      portiere: leggiRuolo("portiere")[0] || "",
      difensori: leggiRuolo("difensori"),
      centrocampisti: leggiRuolo("centrocampisti"),
      attaccanti: leggiRuolo("attaccanti")
    };
  });

  return { numPortiere, numDifensori, numCentrocampisti, numAttaccanti, tempi };
}

function precompilaFormazione(formazione) {
  numPortiereForm.value = formazione?.numPortiere ?? 1;
  numDifensoriForm.value = formazione?.numDifensori ?? 2;
  numCentrocampistiForm.value = formazione?.numCentrocampisti ?? 2;
  numAttaccantiForm.value = formazione?.numAttaccanti ?? 1;
  listaTempiFormazione.innerHTML = "";
  const tempi = formazione?.tempi?.length ? formazione.tempi : [{ nome: "1° tempo" }];
  tempi.forEach(t => listaTempiFormazione.appendChild(creaBloccoTempo(t)));
}

// ============================================
// GESTIONE MODALE: TOGGLE SEZIONI IN BASE AL TIPO
// ============================================
const sezioni = {
  allenamento: document.getElementById("sezioneAllenamento"),
  comunicazione: document.getElementById("sezioneComunicazione"),
  partita: document.getElementById("sezionePartita"),
  torneo: document.getElementById("sezioneTorneo"),
  riunione: document.getElementById("sezioneRiunione")
};

function mostraSezione(tipo) {
  Object.keys(sezioni).forEach(t => {
    sezioni[t].style.display = t === tipo ? "block" : "none";
  });
  btnSalvaEvento.style.display = tipo === "allenamento" ? "none" : "inline-block";
}

campoTipoEvento.addEventListener("change", () => mostraSezione(campoTipoEvento.value));

function apriNuovoEvento() {
  eventoInModifica = null;
  modaleTitoloEvento.textContent = "Nuovo evento";
  campoTipoEvento.disabled = false;
  campoTipoEvento.value = "partita";
  mostraSezione("partita");

  document.getElementById("campoAvversarioPar").value = "";
  document.getElementById("campoDataPar").value = giornoSelezionato;
  document.getElementById("campoCampoPar").value = "";
  document.getElementById("campoRitrovoPar").value = "";
  document.getElementById("campoInizioPar").value = "";
  document.getElementById("campoNotePar").value = "";
  document.getElementById("campoGolNostriPar").value = "";
  document.getElementById("campoGolAvversarioPar").value = "";
  listaConvocatiPartita.innerHTML = "";
  listaConvocatiPartita.appendChild(creaListaConvocati());
  precompilaFormazione(null);

  document.getElementById("campoTitoloTor").value = "";
  document.getElementById("campoDataTor").value = giornoSelezionato;
  document.getElementById("campoLuogoTor").value = "";
  document.getElementById("campoNoteTor").value = "";
  listaPartiteTorneo.innerHTML = "";
  listaPartiteTorneo.appendChild(creaBloccoPartitaTorneo());

  document.getElementById("campoTitoloCom").value = "";
  document.getElementById("campoDataCom").value = giornoSelezionato;
  document.getElementById("campoBodyCom").value = "";
  document.getElementById("campoAutoreCom").value = "";

  document.getElementById("campoTitoloRiu").value = "";
  document.getElementById("campoDataRiu").value = giornoSelezionato;
  document.getElementById("campoOraRiu").value = "";
  document.getElementById("campoLuogoRiu").value = "";
  document.getElementById("campoNoteRiu").value = "";

  btnEliminaEvento.style.display = "none";
  overlayEvento.classList.add("attivo");
}

function apriModificaPartita(id) {
  eventoInModifica = { tipo: "partita", id };
  const p = partiteCache[id];
  modaleTitoloEvento.textContent = "Modifica partita";
  campoTipoEvento.value = "partita";
  campoTipoEvento.disabled = true;
  mostraSezione("partita");

  document.getElementById("campoAvversarioPar").value = p.avversario || "";
  document.getElementById("campoDataPar").value = p.data || "";
  document.getElementById("campoCampoPar").value = p.campo || "";
  document.getElementById("campoRitrovoPar").value = p.orarioRitrovo || "";
  document.getElementById("campoInizioPar").value = p.orarioInizio || "";
  document.getElementById("campoNotePar").value = p.note || "";
  document.getElementById("campoGolNostriPar").value = (p.golNostri !== null && p.golNostri !== undefined) ? p.golNostri : "";
  document.getElementById("campoGolAvversarioPar").value = (p.golAvversario !== null && p.golAvversario !== undefined) ? p.golAvversario : "";
  listaConvocatiPartita.innerHTML = "";
  listaConvocatiPartita.appendChild(creaListaConvocati(p.convocati || []));
  precompilaFormazione(p.formazione);

  btnEliminaEvento.style.display = "inline-block";
  overlayEvento.classList.add("attivo");
}

function apriModificaComunicazione(id) {
  eventoInModifica = { tipo: "comunicazione", id };
  const n = newsCache[id];
  modaleTitoloEvento.textContent = "Comunicazione";
  campoTipoEvento.value = "comunicazione";
  campoTipoEvento.disabled = true;
  mostraSezione("comunicazione");

  document.getElementById("campoTitoloCom").value = n.titolo || "";
  document.getElementById("campoDataCom").value = convertiDataItalianaISO(n.data);
  document.getElementById("campoBodyCom").value = n.body || "";
  document.getElementById("campoAutoreCom").value = n.autore || "";

  btnEliminaEvento.style.display = "inline-block";
  overlayEvento.classList.add("attivo");
}

function apriModificaRiunione(id) {
  eventoInModifica = { tipo: "riunione", id };
  const r = riunioniCache[id];
  modaleTitoloEvento.textContent = "Modifica riunione";
  campoTipoEvento.value = "riunione";
  campoTipoEvento.disabled = true;
  mostraSezione("riunione");

  document.getElementById("campoTitoloRiu").value = r.titolo || "";
  document.getElementById("campoDataRiu").value = r.data || "";
  document.getElementById("campoOraRiu").value = r.ora || "";
  document.getElementById("campoLuogoRiu").value = r.luogo || "";
  document.getElementById("campoNoteRiu").value = r.note || "";

  btnEliminaEvento.style.display = "inline-block";
  overlayEvento.classList.add("attivo");
}

function apriModificaTorneo(id) {
  eventoInModifica = { tipo: "torneo", id };
  const t = torneiCache[id];
  modaleTitoloEvento.textContent = "Modifica torneo";
  campoTipoEvento.value = "torneo";
  campoTipoEvento.disabled = true;
  mostraSezione("torneo");

  document.getElementById("campoTitoloTor").value = t.titolo || "";
  document.getElementById("campoDataTor").value = t.data || "";
  document.getElementById("campoLuogoTor").value = t.luogo || "";
  document.getElementById("campoNoteTor").value = t.note || "";
  listaPartiteTorneo.innerHTML = "";
  (t.partite || []).forEach(p => listaPartiteTorneo.appendChild(creaBloccoPartitaTorneo(p)));
  if ((t.partite || []).length === 0) listaPartiteTorneo.appendChild(creaBloccoPartitaTorneo());

  btnEliminaEvento.style.display = "inline-block";
  overlayEvento.classList.add("attivo");
}

function chiudiModale() {
  overlayEvento.classList.remove("attivo");
  eventoInModifica = null;
}

// ============================================
// SALVA EVENTO (in base al tipo selezionato)
// ============================================
async function salvaEvento() {
  const tipo = campoTipoEvento.value;

  btnSalvaEvento.disabled = true;
  btnSalvaEvento.textContent = "Salvataggio...";

  try {
    if (tipo === "comunicazione") {
      const dati = {
        titolo: document.getElementById("campoTitoloCom").value.trim(),
        data: formattaDataISO(document.getElementById("campoDataCom").value),
        body: document.getElementById("campoBodyCom").value.trim(),
        autore: document.getElementById("campoAutoreCom").value.trim(),
        ts: Date.now()
      };
      if (!dati.titolo) { alert("Il titolo è obbligatorio."); return; }
      if (eventoInModifica?.tipo === "comunicazione") {
        await update(ref(db, `news/${eventoInModifica.id}`), dati);
        newsCache[eventoInModifica.id] = dati;
      } else {
        const nuovoRef = push(ref(db, "news"));
        await set(nuovoRef, dati);
        newsCache[nuovoRef.key] = dati;
      }
    }

    else if (tipo === "partita") {
      const dati = {
        avversario: document.getElementById("campoAvversarioPar").value.trim(),
        data: document.getElementById("campoDataPar").value,
        campo: document.getElementById("campoCampoPar").value.trim(),
        orarioRitrovo: document.getElementById("campoRitrovoPar").value,
        orarioInizio: document.getElementById("campoInizioPar").value,
        note: document.getElementById("campoNotePar").value.trim(),
        golNostri: document.getElementById("campoGolNostriPar").value !== "" ? Number(document.getElementById("campoGolNostriPar").value) : null,
        golAvversario: document.getElementById("campoGolAvversarioPar").value !== "" ? Number(document.getElementById("campoGolAvversarioPar").value) : null,
        convocati: leggiConvocati(listaConvocatiPartita),
        formazione: leggiFormazione()
      };
      if (!dati.avversario || !dati.data) { alert("Avversario e data sono obbligatori."); return; }
      if (eventoInModifica?.tipo === "partita") {
        await update(ref(db, `partite/${eventoInModifica.id}`), dati);
        partiteCache[eventoInModifica.id] = dati;
      } else {
        const nuovoRef = push(ref(db, "partite"));
        await set(nuovoRef, dati);
        partiteCache[nuovoRef.key] = dati;
      }
    }

    else if (tipo === "torneo") {
      const dati = {
        titolo: document.getElementById("campoTitoloTor").value.trim(),
        data: document.getElementById("campoDataTor").value,
        luogo: document.getElementById("campoLuogoTor").value.trim(),
        note: document.getElementById("campoNoteTor").value.trim(),
        partite: leggiPartiteTorneo()
      };
      if (!dati.titolo || !dati.data) { alert("Nome torneo e data sono obbligatori."); return; }
      if (eventoInModifica?.tipo === "torneo") {
        await update(ref(db, `tornei/${eventoInModifica.id}`), dati);
        torneiCache[eventoInModifica.id] = dati;
      } else {
        const nuovoRef = push(ref(db, "tornei"));
        await set(nuovoRef, dati);
        torneiCache[nuovoRef.key] = dati;
      }
    }

    else if (tipo === "riunione") {
      const dati = {
        titolo: document.getElementById("campoTitoloRiu").value.trim(),
        data: document.getElementById("campoDataRiu").value,
        ora: document.getElementById("campoOraRiu").value,
        luogo: document.getElementById("campoLuogoRiu").value.trim(),
        note: document.getElementById("campoNoteRiu").value.trim()
      };
      if (!dati.titolo || !dati.data) { alert("Titolo e data sono obbligatori."); return; }
      if (eventoInModifica?.tipo === "riunione") {
        await update(ref(db, `riunioni/${eventoInModifica.id}`), dati);
        riunioniCache[eventoInModifica.id] = dati;
      } else {
        const nuovoRef = push(ref(db, "riunioni"));
        await set(nuovoRef, dati);
        riunioniCache[nuovoRef.key] = dati;
      }
    }

    renderCalendario();
    renderEventiGiorno();
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaEvento.disabled = false;
    btnSalvaEvento.textContent = "Salva";
  }
}

async function eliminaEvento() {
  if (!eventoInModifica) return;
  if (!confirm("Sei sicuro di voler eliminare questo evento? L'operazione è irreversibile.")) return;

  const { tipo, id } = eventoInModifica;
  const mappaNodi = { partita: "partite", torneo: "tornei", riunione: "riunioni", comunicazione: "news" };
  const nodo = mappaNodi[tipo] || "news";

  try {
    await remove(ref(db, `${nodo}/${id}`));
    if (tipo === "partita") delete partiteCache[id];
    if (tipo === "torneo") delete torneiCache[id];
    if (tipo === "riunione") delete riunioniCache[id];
    if (tipo === "comunicazione") delete newsCache[id];
    renderCalendario();
    renderEventiGiorno();
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

// ============================================
// EVENTI GENERALI
// ============================================
btnNuovoEvento.addEventListener("click", apriNuovoEvento);
btnAnnullaEvento.addEventListener("click", chiudiModale);
btnSalvaEvento.addEventListener("click", salvaEvento);
btnEliminaEvento.addEventListener("click", eliminaEvento);
overlayEvento.addEventListener("click", (e) => {
  if (e.target === overlayEvento) chiudiModale();
});

// Se arrivo da un link diretto (es. dalla Dashboard) con ?data=AAAA-MM-GG,
// apro il calendario direttamente su quel giorno/mese
const parametriURL = new URLSearchParams(window.location.search);
const dataDaAprire = parametriURL.get("data");
if (dataDaAprire && /^\d{4}-\d{2}-\d{2}$/.test(dataDaAprire)) {
  giornoSelezionato = dataDaAprire;
  const [annoP, meseP] = dataDaAprire.split("-").map(Number);
  meseVisualizzato = new Date(annoP, meseP - 1, 1);
}

caricaTutto();
