import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const cardsInfortuni = document.getElementById("cardsInfortuni");
const listaGiocatoriInfortuni = document.getElementById("listaGiocatoriInfortuni");
const dettaglioInfortuni = document.getElementById("dettaglioInfortuni");
const btnNuovoInfortunio = document.getElementById("btnNuovoInfortunio");
const overlayInfortunio = document.getElementById("overlayInfortunio");
const modaleTitoloInf = document.getElementById("modaleTitoloInf");
const campoGiocatoreInf = document.getElementById("campoGiocatoreInf");
const btnAnnullaInfortunio = document.getElementById("btnAnnullaInfortunio");
const btnSalvaInfortunio = document.getElementById("btnSalvaInfortunio");
const btnEliminaInfortunio = document.getElementById("btnEliminaInfortunio");

let playersCache = {};
let infortuniCache = {};
let giocatoreSelezionato = null;
let idInfortunioCorrente = null;

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

function giorniTra(dataInizio, dataFine) {
  const d1 = new Date(dataInizio);
  const d2 = dataFine ? new Date(dataFine) : new Date();
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

// ============================================
// CARICAMENTO
// ============================================
async function caricaDati() {
  try {
    const [snapPlayers, snapInfortuni] = await Promise.all([
      get(ref(db, "players")),
      get(ref(db, "infortuni"))
    ]);
    playersCache = snapPlayers.exists() ? snapPlayers.val() : {};
    infortuniCache = snapInfortuni.exists() ? snapInfortuni.val() : {};

    popolaSelectGiocatori();
    renderCardsRiepilogo();
    renderListaGiocatori();
  } catch (err) {
    console.error(err);
    listaGiocatoriInfortuni.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

function popolaSelectGiocatori() {
  const ids = Object.keys(playersCache).sort((a, b) => (playersCache[a].nome || "").localeCompare(playersCache[b].nome || ""));
  campoGiocatoreInf.innerHTML = ids.map(id => `<option value="${id}">${playersCache[id].nome}</option>`).join("");
}

// ============================================
// CARD RIEPILOGO
// ============================================
function renderCardsRiepilogo() {
  const tutti = Object.values(infortuniCache);
  const inCorso = tutti.filter(i => !i.dataFine);

  const conteggioPerGiocatore = {};
  tutti.forEach(i => {
    if (!i.giocatoreKey) return;
    conteggioPerGiocatore[i.giocatoreKey] = (conteggioPerGiocatore[i.giocatoreKey] || 0) + 1;
  });
  let giocatorePiuColpito = "-";
  let maxConteggio = 0;
  Object.keys(conteggioPerGiocatore).forEach(key => {
    if (conteggioPerGiocatore[key] > maxConteggio) {
      maxConteggio = conteggioPerGiocatore[key];
      giocatorePiuColpito = playersCache[key]?.nome || "?";
    }
  });

  cardsInfortuni.innerHTML = `
    <div class="card"><div class="numero">${tutti.length}</div><div class="etichetta">Infortuni totali registrati</div></div>
    <div class="card"><div class="numero">${inCorso.length}</div><div class="etichetta">Attualmente in corso</div></div>
    <div class="card"><div class="numero" style="font-size:1.3rem;">${maxConteggio > 0 ? giocatorePiuColpito : "-"}</div><div class="etichetta">${maxConteggio > 0 ? maxConteggio + " infortuni · più colpito" : "Nessun dato"}</div></div>
  `;
}

// ============================================
// LISTA GIOCATORI (colonna sinistra)
// ============================================
function renderListaGiocatori() {
  const perGiocatore = {};
  Object.keys(infortuniCache).forEach(id => {
    const inf = infortuniCache[id];
    const key = inf.giocatoreKey || "sconosciuto";
    if (!perGiocatore[key]) perGiocatore[key] = [];
    perGiocatore[key].push(id);
  });

  const chiavi = Object.keys(perGiocatore);
  if (chiavi.length === 0) {
    listaGiocatoriInfortuni.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun infortunio ancora registrato. Meglio così! ✅</p>`;
    return;
  }

  chiavi.sort((a, b) => {
    const nomeA = playersCache[a]?.nome || "";
    const nomeB = playersCache[b]?.nome || "";
    return nomeA.localeCompare(nomeB);
  });

  listaGiocatoriInfortuni.innerHTML = chiavi.map(key => {
    const p = playersCache[key];
    const idsInf = perGiocatore[key];
    const inCorso = idsInf.some(id => !infortuniCache[id].dataFine);
    const nome = p?.nome || "Giocatore";
    const foto = p?.foto || "";
    return `
      <div class="rapporti-giocatore-riga ${key === giocatoreSelezionato ? "selezionato" : ""}" data-key="${key}">
        <img src="${foto}" alt="${nome}" onerror="this.style.opacity=0">
        <div class="rg-info">
          <div class="rg-nome">${nome} ${inCorso ? "🩹" : ""}</div>
          <div class="rg-meta">${idsInf.length} infortuni${idsInf.length === 1 ? "o" : ""} ${inCorso ? "· in corso" : ""}</div>
        </div>
      </div>
    `;
  }).join("");

  listaGiocatoriInfortuni.querySelectorAll(".rapporti-giocatore-riga").forEach(riga => {
    riga.addEventListener("click", () => {
      giocatoreSelezionato = riga.dataset.key;
      renderListaGiocatori();
      renderDettaglioGiocatore(giocatoreSelezionato);
    });
  });
}

// ============================================
// DETTAGLIO INFORTUNI DI UN GIOCATORE
// ============================================
function renderDettaglioGiocatore(key) {
  const p = playersCache[key];
  const idsInf = Object.keys(infortuniCache).filter(id => (infortuniCache[id].giocatoreKey || "sconosciuto") === key);
  idsInf.sort((a, b) => (infortuniCache[b].dataInizio || "").localeCompare(infortuniCache[a].dataInizio || ""));

  const nome = p?.nome || "Giocatore";
  const foto = p?.foto || "";
  const ruolo = p?.ruolo || "";

  const cardsHtml = idsInf.map(id => {
    const inf = infortuniCache[id];
    const inCorso = !inf.dataFine;
    const durata = giorniTra(inf.dataInizio, inf.dataFine);
    return `
      <div class="rapporto-card" data-id="${id}" style="border-left:4px solid ${inCorso ? "var(--rosso)" : "var(--verde)"};">
        <div class="rc-header">
          <strong>${formattaData(inf.dataInizio)} → ${inf.dataFine ? formattaData(inf.dataFine) : "in corso"}</strong>
          <span class="tag-cat" style="color:${inCorso ? "var(--rosso)" : "var(--verde)"};">${inCorso ? "In corso" : "Guarito"} · ${durata} giorni</span>
          <button class="btn-secondary btn-modifica-inf" data-id="${id}" style="margin-left:auto;">Modifica</button>
        </div>
        ${inf.tipo ? `<div class="rc-sezione"><div class="rc-label">Tipo</div><p>${inf.tipo}</p></div>` : ""}
        ${inf.note ? `<div class="rc-sezione"><div class="rc-label">Note</div><p>${inf.note}</p></div>` : ""}
      </div>
    `;
  }).join("");

  dettaglioInfortuni.innerHTML = `
    <div class="rapporti-dettaglio-header">
      <img src="${foto}" alt="${nome}" onerror="this.style.opacity=0">
      <div>
        <h3 style="font-size:1.1rem;">${nome}</h3>
        <div style="font-size:0.85rem; color:var(--testo-chiaro);">${ruolo} · ${idsInf.length} infortuni totali</div>
      </div>
    </div>
    ${cardsHtml}
  `;

  dettaglioInfortuni.querySelectorAll(".btn-modifica-inf").forEach(btn => {
    btn.addEventListener("click", () => apriModificaInfortunio(btn.dataset.id));
  });
}

// ============================================
// MODALE
// ============================================
function apriNuovoInfortunio() {
  idInfortunioCorrente = null;
  modaleTitoloInf.textContent = "Nuovo infortunio";
  if (giocatoreSelezionato && playersCache[giocatoreSelezionato]) {
    campoGiocatoreInf.value = giocatoreSelezionato;
  }
  document.getElementById("campoDataInizioInf").value = new Date().toISOString().split("T")[0];
  document.getElementById("campoDataFineInf").value = "";
  document.getElementById("campoTipoInf").value = "";
  document.getElementById("campoNoteInf").value = "";
  campoGiocatoreInf.disabled = false;
  btnEliminaInfortunio.style.display = "none";
  overlayInfortunio.classList.add("attivo");
}

function apriModificaInfortunio(id) {
  idInfortunioCorrente = id;
  const inf = infortuniCache[id];
  modaleTitoloInf.textContent = "Modifica infortunio";
  if (inf.giocatoreKey) campoGiocatoreInf.value = inf.giocatoreKey;
  document.getElementById("campoDataInizioInf").value = inf.dataInizio || "";
  document.getElementById("campoDataFineInf").value = inf.dataFine || "";
  document.getElementById("campoTipoInf").value = inf.tipo || "";
  document.getElementById("campoNoteInf").value = inf.note || "";
  campoGiocatoreInf.disabled = true;
  btnEliminaInfortunio.style.display = "inline-block";
  overlayInfortunio.classList.add("attivo");
}

function chiudiModale() {
  overlayInfortunio.classList.remove("attivo");
  idInfortunioCorrente = null;
}

async function salvaInfortunio() {
  const giocatoreKey = campoGiocatoreInf.value;
  const giocatoreNome = playersCache[giocatoreKey]?.nome || "";

  const dati = {
    giocatoreKey,
    giocatoreNome,
    dataInizio: document.getElementById("campoDataInizioInf").value,
    dataFine: document.getElementById("campoDataFineInf").value || null,
    tipo: document.getElementById("campoTipoInf").value.trim(),
    note: document.getElementById("campoNoteInf").value.trim()
  };

  if (!giocatoreKey || !dati.dataInizio) {
    alert("Giocatore e data di inizio sono obbligatori.");
    return;
  }

  btnSalvaInfortunio.disabled = true;
  btnSalvaInfortunio.textContent = "Salvataggio...";

  try {
    if (idInfortunioCorrente) {
      await update(ref(db, `infortuni/${idInfortunioCorrente}`), dati);
      infortuniCache[idInfortunioCorrente] = { ...infortuniCache[idInfortunioCorrente], ...dati };
    } else {
      dati.ts = Date.now();
      const nuovoRef = push(ref(db, "infortuni"));
      await set(nuovoRef, dati);
      infortuniCache[nuovoRef.key] = dati;
    }
    giocatoreSelezionato = giocatoreKey;
    renderCardsRiepilogo();
    renderListaGiocatori();
    renderDettaglioGiocatore(giocatoreKey);
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaInfortunio.disabled = false;
    btnSalvaInfortunio.textContent = "Salva";
  }
}

async function eliminaInfortunio() {
  if (!idInfortunioCorrente) return;
  if (!confirm("Sei sicuro di voler eliminare questo infortunio? L'operazione è irreversibile.")) return;

  const key = infortuniCache[idInfortunioCorrente]?.giocatoreKey;

  try {
    await remove(ref(db, `infortuni/${idInfortunioCorrente}`));
    delete infortuniCache[idInfortunioCorrente];
    renderCardsRiepilogo();
    renderListaGiocatori();
    if (key) renderDettaglioGiocatore(key);
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

btnNuovoInfortunio.addEventListener("click", apriNuovoInfortunio);
btnAnnullaInfortunio.addEventListener("click", chiudiModale);
btnSalvaInfortunio.addEventListener("click", salvaInfortunio);
btnEliminaInfortunio.addEventListener("click", eliminaInfortunio);
overlayInfortunio.addEventListener("click", (e) => {
  if (e.target === overlayInfortunio) chiudiModale();
});

caricaDati();
