import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";
import { chiamaAI } from "./ai.js";

await proteggiPagina();
collegaLogout();

const listaGiocatoriRapporti = document.getElementById("listaGiocatoriRapporti");
const dettaglioRapporti = document.getElementById("dettaglioRapporti");
const btnNuovoRapporto = document.getElementById("btnNuovoRapporto");
const overlayRapporto = document.getElementById("overlayRapporto");
const modaleTitoloRapp = document.getElementById("modaleTitoloRapp");
const campoGiocatoreRapp = document.getElementById("campoGiocatoreRapp");
const btnAnnullaRapporto = document.getElementById("btnAnnullaRapporto");
const btnSalvaRapporto = document.getElementById("btnSalvaRapporto");
const btnEliminaRapporto = document.getElementById("btnEliminaRapporto");

let playersCache = {};
let rapportiCache = {};
let giocatoreSelezionato = null;
let idRapportoCorrente = null;

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// ============================================
// CARICAMENTO
// ============================================
async function caricaDati() {
  try {
    const [snapPlayers, snapRapporti] = await Promise.all([
      get(ref(db, "players")),
      get(ref(db, "rapporti"))
    ]);
    playersCache = snapPlayers.exists() ? snapPlayers.val() : {};
    rapportiCache = snapRapporti.exists() ? snapRapporti.val() : {};

    popolaSelectGiocatori();
    renderListaGiocatori();
  } catch (err) {
    console.error(err);
    listaGiocatoriRapporti.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

function popolaSelectGiocatori() {
  const ids = Object.keys(playersCache).sort((a, b) => (playersCache[a].nome || "").localeCompare(playersCache[b].nome || ""));
  campoGiocatoreRapp.innerHTML = ids.map(id => `<option value="${id}">${playersCache[id].nome}</option>`).join("");
}

// ============================================
// LISTA GIOCATORI CON RAPPORTI (colonna sinistra)
// ============================================
function renderListaGiocatori() {
  // Raggruppo i rapporti per giocatoreKey
  const perGiocatore = {};
  Object.keys(rapportiCache).forEach(idRapp => {
    const r = rapportiCache[idRapp];
    const key = r.giocatoreKey || "sconosciuto";
    if (!perGiocatore[key]) perGiocatore[key] = [];
    perGiocatore[key].push(idRapp);
  });

  const chiavi = Object.keys(perGiocatore);

  if (chiavi.length === 0) {
    listaGiocatoriRapporti.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun rapporto ancora inserito.</p>`;
    return;
  }

  // Ordino per nome giocatore
  chiavi.sort((a, b) => {
    const nomeA = playersCache[a]?.nome || rapportiCache[perGiocatore[a][0]]?.giocatoreNome || "";
    const nomeB = playersCache[b]?.nome || rapportiCache[perGiocatore[b][0]]?.giocatoreNome || "";
    return nomeA.localeCompare(nomeB);
  });

  listaGiocatoriRapporti.innerHTML = chiavi.map(key => {
    const p = playersCache[key];
    const idsRapp = perGiocatore[key];
    const ultimaData = idsRapp.map(id => rapportiCache[id].data || "").sort().reverse()[0];
    const nome = p?.nome || rapportiCache[idsRapp[0]]?.giocatoreNome || "Giocatore";
    const foto = p?.foto || "";
    return `
      <div class="rapporti-giocatore-riga ${key === giocatoreSelezionato ? "selezionato" : ""}" data-key="${key}">
        <img src="${foto}" alt="${nome}" onerror="this.style.opacity=0">
        <div class="rg-info">
          <div class="rg-nome">${nome}</div>
          <div class="rg-meta">${idsRapp.length} rapport${idsRapp.length === 1 ? "o" : "i"} · ultimo ${formattaData(ultimaData)}</div>
        </div>
      </div>
    `;
  }).join("");

  listaGiocatoriRapporti.querySelectorAll(".rapporti-giocatore-riga").forEach(riga => {
    riga.addEventListener("click", () => {
      giocatoreSelezionato = riga.dataset.key;
      renderListaGiocatori();
      renderDettaglioGiocatore(giocatoreSelezionato);
    });
  });
}

// ============================================
// DETTAGLIO RAPPORTI DI UN GIOCATORE (colonna destra)
// ============================================
function renderDettaglioGiocatore(key) {
  const p = playersCache[key];
  const idsRapp = Object.keys(rapportiCache).filter(id => (rapportiCache[id].giocatoreKey || "sconosciuto") === key);
  idsRapp.sort((a, b) => (rapportiCache[b].data || "").localeCompare(rapportiCache[a].data || "")); // dal più recente

  const nome = p?.nome || rapportiCache[idsRapp[0]]?.giocatoreNome || "Giocatore";
  const foto = p?.foto || "";
  const ruolo = p?.ruolo || "";

  const cardsHtml = idsRapp.map(id => {
    const r = rapportiCache[id];
    return `
      <div class="rapporto-card" data-id="${id}">
        <div class="rc-header">
          <strong>${formattaData(r.data)}</strong>
          <span class="tag-cat">${r.contesto || "-"}</span>
          <span class="rc-voto">Voto: ${r.voto || "-"}/5</span>
          <button class="btn-secondary btn-modifica-rapp" data-id="${id}" style="margin-left:auto;">Modifica</button>
        </div>
        ${r.comportamento ? `<div class="rc-sezione"><div class="rc-label">Comportamento</div><p>${r.comportamento}</p></div>` : ""}
        ${r.tecnica ? `<div class="rc-sezione"><div class="rc-label">Tecnica</div><p>${r.tecnica}</p></div>` : ""}
        ${r.migliorare ? `<div class="rc-sezione"><div class="rc-label">Da migliorare</div><p>${r.migliorare}</p></div>` : ""}
        ${r.note ? `<div class="rc-sezione"><div class="rc-label">Note</div><p>${r.note}</p></div>` : ""}
      </div>
    `;
  }).join("");

  dettaglioRapporti.innerHTML = `
    <div class="rapporti-dettaglio-header">
      <img src="${foto}" alt="${nome}" onerror="this.style.opacity=0">
      <div style="flex:1;">
        <h3 style="font-size:1.1rem;">${nome}</h3>
        <div style="font-size:0.85rem; color:var(--testo-chiaro);">${ruolo} · ${idsRapp.length} rapporti totali</div>
      </div>
      <button class="btn-secondary" id="btnConsigliAI">💡 Chiedi consigli all'AI</button>
    </div>
    <div id="risultatoConsigliAI"></div>
    ${cardsHtml}
  `;

  document.getElementById("btnConsigliAI").addEventListener("click", () => chiediConsigliAI(key, idsRapp));

  dettaglioRapporti.querySelectorAll(".btn-modifica-rapp").forEach(btn => {
    btn.addEventListener("click", () => apriModificaRapporto(btn.dataset.id));
  });
}

// ============================================
// MODALE NUOVO / MODIFICA RAPPORTO
// ============================================
function apriNuovoRapporto() {
  idRapportoCorrente = null;
  modaleTitoloRapp.textContent = "Nuovo rapporto";
  if (giocatoreSelezionato && playersCache[giocatoreSelezionato]) {
    campoGiocatoreRapp.value = giocatoreSelezionato;
  }
  const oggi = new Date();
  const dataOggiLocale = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
  document.getElementById("campoDataRapp").value = dataOggiLocale;
  document.getElementById("campoContestoRapp").value = "";
  document.getElementById("campoVotoRapp").value = 3;
  document.getElementById("campoComportamentoRapp").value = "";
  document.getElementById("campoTecnicaRapp").value = "";
  document.getElementById("campoMigliorareRapp").value = "";
  document.getElementById("campoNoteRapp").value = "";
  campoGiocatoreRapp.disabled = false;
  btnEliminaRapporto.style.display = "none";
  overlayRapporto.classList.add("attivo");
}

function apriModificaRapporto(id) {
  idRapportoCorrente = id;
  const r = rapportiCache[id];
  modaleTitoloRapp.textContent = "Modifica rapporto";
  if (r.giocatoreKey) campoGiocatoreRapp.value = r.giocatoreKey;
  document.getElementById("campoDataRapp").value = r.data || "";
  document.getElementById("campoContestoRapp").value = r.contesto || "";
  document.getElementById("campoVotoRapp").value = r.voto || 3;
  document.getElementById("campoComportamentoRapp").value = r.comportamento || "";
  document.getElementById("campoTecnicaRapp").value = r.tecnica || "";
  document.getElementById("campoMigliorareRapp").value = r.migliorare || "";
  document.getElementById("campoNoteRapp").value = r.note || "";
  campoGiocatoreRapp.disabled = true; // non cambio giocatore in modifica, solo i contenuti
  btnEliminaRapporto.style.display = "inline-block";
  overlayRapporto.classList.add("attivo");
}

function chiudiModale() {
  overlayRapporto.classList.remove("attivo");
  idRapportoCorrente = null;
}

async function salvaRapporto() {
  const giocatoreKey = campoGiocatoreRapp.value;
  const giocatoreNome = playersCache[giocatoreKey]?.nome || "";

  const dati = {
    giocatoreKey,
    giocatoreNome,
    data: document.getElementById("campoDataRapp").value,
    contesto: document.getElementById("campoContestoRapp").value.trim(),
    voto: Number(document.getElementById("campoVotoRapp").value) || null,
    comportamento: document.getElementById("campoComportamentoRapp").value.trim(),
    tecnica: document.getElementById("campoTecnicaRapp").value.trim(),
    migliorare: document.getElementById("campoMigliorareRapp").value.trim(),
    note: document.getElementById("campoNoteRapp").value.trim()
  };

  if (!giocatoreKey || !dati.data) {
    alert("Giocatore e data sono obbligatori.");
    return;
  }

  btnSalvaRapporto.disabled = true;
  btnSalvaRapporto.textContent = "Salvataggio...";

  try {
    if (idRapportoCorrente) {
      await update(ref(db, `rapporti/${idRapportoCorrente}`), dati);
      rapportiCache[idRapportoCorrente] = { ...rapportiCache[idRapportoCorrente], ...dati };
    } else {
      dati.ts = Date.now();
      const nuovoRef = push(ref(db, "rapporti"));
      await set(nuovoRef, dati);
      rapportiCache[nuovoRef.key] = dati;
    }
    giocatoreSelezionato = giocatoreKey;
    renderListaGiocatori();
    renderDettaglioGiocatore(giocatoreKey);
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaRapporto.disabled = false;
    btnSalvaRapporto.textContent = "Salva";
  }
}

async function eliminaRapporto() {
  if (!idRapportoCorrente) return;
  if (!confirm("Sei sicuro di voler eliminare questo rapporto? L'operazione è irreversibile.")) return;

  const key = rapportiCache[idRapportoCorrente]?.giocatoreKey;

  try {
    await remove(ref(db, `rapporti/${idRapportoCorrente}`));
    delete rapportiCache[idRapportoCorrente];
    renderListaGiocatori();
    if (key) renderDettaglioGiocatore(key);
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

// ============================================
// CONSIGLI AI SUL GIOCATORE
// ============================================
async function chiediConsigliAI(key, idsRapp) {
  const contenitore = document.getElementById("risultatoConsigliAI");
  const btn = document.getElementById("btnConsigliAI");
  const nome = playersCache[key]?.nome || rapportiCache[idsRapp[0]]?.giocatoreNome || "il giocatore";

  btn.disabled = true;
  btn.textContent = "Analisi in corso...";
  contenitore.innerHTML = `<div class="rapporto-card" style="color:var(--testo-chiaro);">🤖 Sto analizzando i rapporti di ${nome}...</div>`;

  try {
    const rapportiOrdinati = [...idsRapp].sort((a, b) => (rapportiCache[a].data || "").localeCompare(rapportiCache[b].data || ""));
    const testoRapporti = rapportiOrdinati.map(id => {
      const r = rapportiCache[id];
      return `Data ${formattaData(r.data)} (voto ${r.voto || "-"}/5, contesto: ${r.contesto || "-"}):
Comportamento: ${r.comportamento || "-"}
Tecnica: ${r.tecnica || "-"}
Da migliorare: ${r.migliorare || "-"}
Note: ${r.note || "-"}`;
    }).join("\n\n");

    const promptSistema = `Sei un mister esperto di settore giovanile del calcio, categoria "Primi Calci" (bambini di 6-7 anni), con approccio pedagogico ispirato ad Atalanta, Milan e Juventus.
Analizza la cronologia di osservazioni su un singolo bambino e fornisci consigli pratici e concreti al coach: cosa allenare nelle prossime sessioni, come valorizzare i punti di forza, come lavorare con delicatezza sugli aspetti da migliorare (ricorda che sono bambini piccoli, l'approccio dev'essere sempre positivo e mai punitivo).
Rispondi in italiano, con un breve paragrafo introduttivo e poi un elenco puntato di 3-5 consigli concreti. Non usare markdown con asterischi, scrivi in testo semplice.`;

    const promptUtente = `Cronologia rapporti su ${nome}:\n\n${testoRapporti}`;

    const risposta = await chiamaAI(promptSistema, promptUtente);

    contenitore.innerHTML = `
      <div class="rapporto-card" style="border-left:4px solid var(--rosso);">
        <div class="rc-label" style="margin-bottom:8px;">💡 Consigli AI per ${nome}</div>
        <p style="white-space:pre-wrap; line-height:1.6;">${risposta}</p>
      </div>
    `;
  } catch (err) {
    contenitore.innerHTML = `<div class="rapporto-card" style="color:var(--rosso);">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "💡 Chiedi consigli all'AI";
  }
}

btnNuovoRapporto.addEventListener("click", apriNuovoRapporto);
btnAnnullaRapporto.addEventListener("click", chiudiModale);
btnSalvaRapporto.addEventListener("click", salvaRapporto);
btnEliminaRapporto.addEventListener("click", eliminaRapporto);
overlayRapporto.addEventListener("click", (e) => {
  if (e.target === overlayRapporto) chiudiModale();
});

caricaDati();
