import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";
import { chiamaAI, estraiJSON } from "./ai.js";

await proteggiPagina();
collegaLogout();

const listaAllenamenti = document.getElementById("listaAllenamenti");
const overlayAllenamento = document.getElementById("overlayAllenamento");
const modaleTitoloAll = document.getElementById("modaleTitoloAll");
const btnNuovoAllenamento = document.getElementById("btnNuovoAllenamento");
const btnAnnullaAllenamento = document.getElementById("btnAnnullaAllenamento");
const btnSalvaAllenamento = document.getElementById("btnSalvaAllenamento");
const btnEliminaAllenamento = document.getElementById("btnEliminaAllenamento");
const listaEserciziForm = document.getElementById("listaEserciziForm");
const btnAggiungiEsercizio = document.getElementById("btnAggiungiEsercizio");
const selCategoriaLibreria = document.getElementById("selCategoriaLibreria");
const selEsercizioLibreria = document.getElementById("selEsercizioLibreria");
const descEsercizioLibreria = document.getElementById("descEsercizioLibreria");
const btnAggiungiDaLibreria = document.getElementById("btnAggiungiDaLibreria");

let allenamentiCache = {};
let eserciziLibreria = {}; // id -> {nome, cat, dur, desc, ...}
let idAllenamentoCorrente = null;

const CATEGORIE_ESERCIZIO = ["Riscaldamento", "Velocità", "Coordinativo", "Passaggi", "Conduzione", "Tiro", "Situazioni"];

// ============================================
// CARICAMENTO LIBRERIA ESERCIZI (per il selettore a cascata)
// ============================================
async function caricaLibreriaEsercizi() {
  try {
    const snap = await get(ref(db, "exercises"));
    eserciziLibreria = snap.exists() ? snap.val() : {};

    // Popolo il menu categorie solo con quelle effettivamente presenti in libreria
    const categoriePresenti = [...new Set(Object.values(eserciziLibreria).map(e => e.cat).filter(Boolean))];
    const categorieOrdinate = [
      ...CATEGORIE_ESERCIZIO.filter(c => categoriePresenti.includes(c)),
      ...categoriePresenti.filter(c => !CATEGORIE_ESERCIZIO.includes(c))
    ];
    selCategoriaLibreria.innerHTML = `<option value="">Categoria...</option>` +
      categorieOrdinate.map(c => `<option value="${c}">${c}</option>`).join("");

    // Ri-renderizzo la lista allenamenti così i tooltip con la descrizione risultano completi
    renderLista();
  } catch (err) {
    console.error("Errore caricamento libreria esercizi:", err);
  }
}

selCategoriaLibreria.addEventListener("change", () => {
  const cat = selCategoriaLibreria.value;
  descEsercizioLibreria.textContent = "";

  if (!cat) {
    selEsercizioLibreria.innerHTML = `<option value="">Scegli prima la categoria</option>`;
    selEsercizioLibreria.disabled = true;
    return;
  }

  const idsCat = Object.keys(eserciziLibreria)
    .filter(id => eserciziLibreria[id].cat === cat)
    .sort((a, b) => (eserciziLibreria[a].nome || "").localeCompare(eserciziLibreria[b].nome || ""));

  selEsercizioLibreria.innerHTML = `<option value="">Seleziona esercizio (${idsCat.length})...</option>` +
    idsCat.map(id => `<option value="${id}">${eserciziLibreria[id].nome}</option>`).join("");
  selEsercizioLibreria.disabled = false;
});

selEsercizioLibreria.addEventListener("change", () => {
  const id = selEsercizioLibreria.value;
  descEsercizioLibreria.textContent = id ? (eserciziLibreria[id].desc || "Nessuna descrizione disponibile.") : "";
});

btnAggiungiDaLibreria.addEventListener("click", () => {
  const id = selEsercizioLibreria.value;
  if (!id) {
    alert("Seleziona prima un esercizio dalla libreria.");
    return;
  }
  const e = eserciziLibreria[id];
  listaEserciziForm.appendChild(creaRigaEsercizio({ nome: e.nome, cat: e.cat, dur: e.dur, desc: e.desc }));

  // Reset selettori per una nuova scelta
  selEsercizioLibreria.value = "";
  descEsercizioLibreria.textContent = "";
});

// ============================================
// CARICAMENTO E RENDER LISTA ALLENAMENTI
// ============================================
async function caricaAllenamenti() {
  try {
    const snap = await get(ref(db, "trainings"));
    allenamentiCache = snap.exists() ? snap.val() : {};
    renderLista();
  } catch (err) {
    console.error(err);
    listaAllenamenti.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento: ${err.message}</p>`;
  }
}

function formattaData(dataStr) {
  if (!dataStr) return "-";
  const [anno, mese, giorno] = dataStr.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// Recupera la descrizione di un esercizio: prima quella salvata nell'allenamento,
// altrimenti la cerca nella libreria per nome (utile per allenamenti creati prima di questa funzione)
function trovaDescrizioneEsercizio(nomeEsercizio, descSalvata) {
  if (descSalvata) return descSalvata;
  const trovato = Object.values(eserciziLibreria).find(
    ex => (ex.nome || "").trim().toLowerCase() === (nomeEsercizio || "").trim().toLowerCase()
  );
  return trovato ? (trovato.desc || "") : "";
}

function nomeMese(chiaveMese) {
  const [anno, mese] = chiaveMese.split("-");
  const data = new Date(Number(anno), Number(mese) - 1, 1);
  const nome = data.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function renderLista() {
  const ids = Object.keys(allenamentiCache);
  if (ids.length === 0) {
    listaAllenamenti.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun allenamento ancora inserito.</p>`;
    return;
  }

  // Ordino in ordine cronologico (dal più vecchio al più recente)
  ids.sort((a, b) => (allenamentiCache[a].data || "").localeCompare(allenamentiCache[b].data || ""));

  // Raggruppo per mese (chiave AAAA-MM)
  const gruppi = {};
  ids.forEach(id => {
    const data = allenamentiCache[id].data || "";
    const chiaveMese = data ? data.slice(0, 7) : "senza-data";
    if (!gruppi[chiaveMese]) gruppi[chiaveMese] = [];
    gruppi[chiaveMese].push(id);
  });

  const meseCorrente = new Date().toISOString().slice(0, 7);
  const chiaviMesi = Object.keys(gruppi).sort();

  listaAllenamenti.innerHTML = chiaviMesi.map(chiaveMese => {
    const idsMese = gruppi[chiaveMese];
    // Aperto di default: il mese corrente e i mesi futuri; chiuso quelli passati
    const apertoDiDefault = chiaveMese >= meseCorrente;
    const titoloMese = chiaveMese === "senza-data" ? "Senza data" : nomeMese(chiaveMese);

    const cardsHtml = idsMese.map(id => {
      const a = allenamentiCache[id];
      const esercizi = a.esercizi || [];
      const durataTotale = esercizi.reduce((s, e) => s + Number(e.dur || 0), 0);
      const oggi = new Date().toISOString().split("T")[0];
      const futuro = a.data >= oggi;
      return `
        <div class="allenamento-card" data-id="${id}" style="${futuro ? "border-left:4px solid var(--verde);" : "opacity:0.85;"}">
          <div class="data-riga">
            <h3>${a.titolo || "Allenamento"}</h3>
            <span class="tag-cat">${formattaData(a.data)} · ${a.ora || "--"}</span>
          </div>
          <p style="margin-bottom:8px; color:var(--testo-chiaro); font-size:0.9rem;">
            📍 ${a.luogo || "-"} · ⏱️ ${durataTotale} min · ${a.tipo || "Normale"}
          </p>
          ${a.note ? `<p style="font-size:0.85rem; color:var(--testo-chiaro); margin-bottom:8px; font-style:italic;">${a.note}</p>` : ""}
          ${esercizi.map(e => {
            const desc = trovaDescrizioneEsercizio(e.nome, e.desc) || "Nessuna descrizione disponibile.";
            const descAttr = desc.replace(/"/g, "&quot;").replace(/\n/g, " ");
            return `
              <div class="esercizio-riga" title="${descAttr}">
                <span>${e.nome}</span>
                <span class="tag-cat">${e.cat} · ${e.dur}'</span>
              </div>
            `;
          }).join("")}
          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn-secondary btn-modifica" data-id="${id}">Modifica</button>
            <button class="btn-secondary btn-stampa" data-id="${id}">🖨️ Stampa</button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="gruppo-mese ${apertoDiDefault ? "" : "collassato"}">
        <div class="gruppo-mese-titolo">
          <span class="freccia-mese">▾</span>
          <span>${titoloMese}</span>
          <span class="conteggio">${idsMese.length}</span>
        </div>
        <div class="gruppo-mese-contenuto">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join("");

  // Toggle apertura/chiusura mese
  listaAllenamenti.querySelectorAll(".gruppo-mese-titolo").forEach(titolo => {
    titolo.addEventListener("click", () => {
      titolo.closest(".gruppo-mese").classList.toggle("collassato");
    });
  });

  listaAllenamenti.querySelectorAll(".btn-modifica").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      apriModificaAllenamento(btn.dataset.id);
    });
  });

  listaAllenamenti.querySelectorAll(".btn-stampa").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      stampaAllenamento(btn.dataset.id);
    });
  });
}

// ============================================
// STAMPA ALLENAMENTO COMPLETO
// ============================================
function stampaAllenamento(id) {
  const a = allenamentiCache[id];
  if (!a) return;

  const esercizi = a.esercizi || [];
  const durataTotale = esercizi.reduce((s, e) => s + Number(e.dur || 0), 0);

  const righeEsercizi = esercizi.map((e, i) => {
    const desc = trovaDescrizioneEsercizio(e.nome, e.desc) || "Nessuna descrizione disponibile.";
    return `
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid #ddd;">
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
          <span>${i + 1}. ${e.nome}</span>
          <span>${e.cat} · ${e.dur} min</span>
        </div>
        <div style="font-size:13px; color:#333; margin-top:6px; white-space:pre-wrap; line-height:1.5;">${desc}</div>
      </div>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <title>${a.titolo || "Allenamento"}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 30px; color: #1c1c1c; max-width: 800px; margin: 0 auto; }
        h1 { color: #000; border-bottom: 3px solid #d6362e; padding-bottom: 10px; margin-bottom: 6px; }
        .meta { color: #555; margin-bottom: 18px; font-size: 14px; }
        .note { background: #f4f4f2; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 22px; font-style: italic; }
        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
        @media print {
          body { padding: 10px; }
        }
      </style>
    </head>
    <body>
      <h1>${a.titolo || "Allenamento"}</h1>
      <div class="meta">
        📅 ${formattaData(a.data)} · ore ${a.ora || "--"} · 📍 ${a.luogo || "-"} · ⏱️ ${durataTotale} min totali · ${a.tipo || "Normale"}
      </div>
      ${a.note ? `<div class="note">${a.note}</div>` : ""}
      <h2>Esercizi (${esercizi.length})</h2>
      ${righeEsercizi || "<p>Nessun esercizio inserito.</p>"}
    </body>
    </html>
  `;

  const finestra = window.open("", "_blank");
  finestra.document.write(html);
  finestra.document.close();
  finestra.focus();
  setTimeout(() => finestra.print(), 300);
}

// ============================================
// FORM ESERCIZI DINAMICO
// ============================================
function creaRigaEsercizio(esercizio = {}) {
  const riga = document.createElement("div");
  riga.className = "esercizio-form-riga";
  riga.dataset.desc = esercizio.desc || "";
  riga.innerHTML = `
    <input type="text" class="es-nome" placeholder="Nome esercizio" value="${esercizio.nome || ""}">
    <select class="es-cat">
      ${CATEGORIE_ESERCIZIO.map(c => `<option value="${c}" ${c === esercizio.cat ? "selected" : ""}>${c}</option>`).join("")}
    </select>
    <input type="number" class="es-dur" placeholder="Min" value="${esercizio.dur || 15}">
    <button type="button" class="btn-rimuovi" title="Rimuovi">✕</button>
  `;
  riga.querySelector(".btn-rimuovi").addEventListener("click", () => riga.remove());
  return riga;
}

btnAggiungiEsercizio.addEventListener("click", () => {
  listaEserciziForm.appendChild(creaRigaEsercizio());
});

function leggiEserciziDalForm() {
  return Array.from(listaEserciziForm.querySelectorAll(".esercizio-form-riga")).map(riga => ({
    nome: riga.querySelector(".es-nome").value.trim(),
    cat: riga.querySelector(".es-cat").value,
    dur: riga.querySelector(".es-dur").value.trim(),
    desc: riga.dataset.desc || ""
  })).filter(e => e.nome); // scarto righe vuote
}

// ============================================
// GESTIONE MODALE
// ============================================
function apriNuovoAllenamento() {
  idAllenamentoCorrente = null;
  modaleTitoloAll.textContent = "Nuovo allenamento";

  document.getElementById("campoTitolo").value = "";
  document.getElementById("campoData").value = "";
  document.getElementById("campoOra").value = "17:00";
  document.getElementById("campoLuogo").value = "San Giovanni";
  document.getElementById("campoTipo").value = "Normale";
  document.getElementById("campoNote").value = "";
  listaEserciziForm.innerHTML = "";
  listaEserciziForm.appendChild(creaRigaEsercizio());
  selCategoriaLibreria.value = "";
  selEsercizioLibreria.innerHTML = `<option value="">Scegli prima la categoria</option>`;
  selEsercizioLibreria.disabled = true;
  descEsercizioLibreria.textContent = "";

  btnEliminaAllenamento.style.display = "none";
  overlayAllenamento.classList.add("attivo");
}

function apriModificaAllenamento(id) {
  idAllenamentoCorrente = id;
  const a = allenamentiCache[id];
  modaleTitoloAll.textContent = a.titolo || "Modifica allenamento";

  document.getElementById("campoTitolo").value = a.titolo || "";
  document.getElementById("campoData").value = a.data || "";
  document.getElementById("campoOra").value = a.ora || "";
  document.getElementById("campoLuogo").value = a.luogo || "";
  document.getElementById("campoTipo").value = a.tipo || "Normale";
  document.getElementById("campoNote").value = a.note || "";

  listaEserciziForm.innerHTML = "";
  (a.esercizi || []).forEach(e => listaEserciziForm.appendChild(creaRigaEsercizio(e)));
  if ((a.esercizi || []).length === 0) listaEserciziForm.appendChild(creaRigaEsercizio());
  selCategoriaLibreria.value = "";
  selEsercizioLibreria.innerHTML = `<option value="">Scegli prima la categoria</option>`;
  selEsercizioLibreria.disabled = true;
  descEsercizioLibreria.textContent = "";

  btnEliminaAllenamento.style.display = "inline-block";
  overlayAllenamento.classList.add("attivo");
}

function chiudiModale() {
  overlayAllenamento.classList.remove("attivo");
  idAllenamentoCorrente = null;
}

// ============================================
// SALVA / ELIMINA
// ============================================
async function salvaAllenamento() {
  const dati = {
    titolo: document.getElementById("campoTitolo").value.trim(),
    data: document.getElementById("campoData").value,
    ora: document.getElementById("campoOra").value,
    luogo: document.getElementById("campoLuogo").value.trim(),
    tipo: document.getElementById("campoTipo").value,
    note: document.getElementById("campoNote").value.trim(),
    esercizi: leggiEserciziDalForm()
  };

  if (!dati.titolo || !dati.data) {
    alert("Titolo e data sono obbligatori.");
    return;
  }

  btnSalvaAllenamento.disabled = true;
  btnSalvaAllenamento.textContent = "Salvataggio...";

  try {
    if (idAllenamentoCorrente) {
      await update(ref(db, `trainings/${idAllenamentoCorrente}`), dati);
      allenamentiCache[idAllenamentoCorrente] = dati;
    } else {
      const nuovoRef = push(ref(db, "trainings"));
      await set(nuovoRef, dati);
      allenamentiCache[nuovoRef.key] = dati;
    }
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaAllenamento.disabled = false;
    btnSalvaAllenamento.textContent = "Salva";
  }
}

async function eliminaAllenamento() {
  if (!idAllenamentoCorrente) return;
  const titolo = allenamentiCache[idAllenamentoCorrente]?.titolo || "questo allenamento";
  if (!confirm(`Sei sicuro di voler eliminare "${titolo}"? L'operazione è irreversibile.`)) return;

  try {
    await remove(ref(db, `trainings/${idAllenamentoCorrente}`));
    delete allenamentiCache[idAllenamentoCorrente];
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

// ============================================
// EVENTI
// ============================================
btnNuovoAllenamento.addEventListener("click", apriNuovoAllenamento);
btnAnnullaAllenamento.addEventListener("click", chiudiModale);
btnSalvaAllenamento.addEventListener("click", salvaAllenamento);
btnEliminaAllenamento.addEventListener("click", eliminaAllenamento);
overlayAllenamento.addEventListener("click", (e) => {
  if (e.target === overlayAllenamento) chiudiModale();
});

caricaAllenamenti();
caricaLibreriaEsercizi();

// ============================================
// GENERA ALLENAMENTO CON AI
// ============================================
const overlayGeneraAI = document.getElementById("overlayGeneraAI");
const btnGeneraConAI = document.getElementById("btnGeneraConAI");
const btnAnnullaGeneraAI = document.getElementById("btnAnnullaGeneraAI");
const btnGeneraAllenamentoAI = document.getElementById("btnGeneraAllenamentoAI");
const btnUsaAllenamentoAI = document.getElementById("btnUsaAllenamentoAI");
const campoLineeGuidaAI = document.getElementById("campoLineeGuidaAI");
const campoUsaLibreriaAI = document.getElementById("campoUsaLibreriaAI");
const campoSalvaEserciziAI = document.getElementById("campoSalvaEserciziAI");
const risultatoAI = document.getElementById("risultatoAI");
const azioniRisultatoAI = document.getElementById("azioniRisultatoAI");

let allenamentoGeneratoAI = null;

btnGeneraConAI.addEventListener("click", () => {
  campoLineeGuidaAI.value = "";
  risultatoAI.innerHTML = "";
  azioniRisultatoAI.style.display = "none";
  allenamentoGeneratoAI = null;
  overlayGeneraAI.classList.add("attivo");
});

btnAnnullaGeneraAI.addEventListener("click", () => {
  overlayGeneraAI.classList.remove("attivo");
});

overlayGeneraAI.addEventListener("click", (e) => {
  if (e.target === overlayGeneraAI) overlayGeneraAI.classList.remove("attivo");
});

btnGeneraAllenamentoAI.addEventListener("click", async () => {
  const lineeGuida = campoLineeGuidaAI.value.trim();
  if (!lineeGuida) {
    alert("Scrivi qualche linea guida per l'AI prima di generare.");
    return;
  }

  btnGeneraAllenamentoAI.disabled = true;
  btnGeneraAllenamentoAI.textContent = "Generazione in corso...";
  risultatoAI.innerHTML = `<p style="color:var(--testo-chiaro);">🤖 Sto pensando all'allenamento...</p>`;
  azioniRisultatoAI.style.display = "none";

  try {
    const promptSistema = `Sei un assistente esperto di metodologia giovanile del calcio per la categoria "Primi Calci" (bambini di 6-7 anni), ispirato alle metodologie delle scuole calcio di Atalanta, Milan e Juventus.
La struttura di riferimento del coach è il "Mix Perfetto" in 4 fasi: Attivazione, Fase Tecnica, Situazionale, Partita Finale.
Genera una sessione di allenamento completa in base alle indicazioni del coach.
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, con esattamente questa struttura:
{"titolo": "...", "note": "...", "esercizi": [{"nome": "...", "cat": "Riscaldamento|Velocità|Coordinativo|Passaggi|Conduzione|Tiro|Situazioni", "dur": "15", "desc": "..."}]}
Le descrizioni devono essere chiare, pratiche e adatte a bambini di 6-7 anni (obiettivo e svolgimento in poche frasi).`;

    let promptUtente = `Linee guida del coach: ${lineeGuida}`;

    if (campoUsaLibreriaAI.checked) {
      const elencoLibreria = Object.values(eserciziLibreria)
        .map(e => `${e.nome} (${e.cat})`)
        .slice(0, 150)
        .join(", ");
      promptUtente += `\n\nEsercizi già disponibili nella libreria del coach (usali quando pertinenti, riscrivendo il nome esattamente uguale): ${elencoLibreria}`;
    }

    const rispostaTesto = await chiamaAI(promptSistema, promptUtente);
    const dati = estraiJSON(rispostaTesto);

    if (!dati.esercizi || !Array.isArray(dati.esercizi) || dati.esercizi.length === 0) {
      throw new Error("L'AI non ha generato esercizi validi. Riprova.");
    }

    allenamentoGeneratoAI = dati;

    const durataTotale = dati.esercizi.reduce((s, e) => s + Number(e.dur || 0), 0);
    risultatoAI.innerHTML = `
      <div class="allenamento-card">
        <h3>${dati.titolo || "Allenamento generato"}</h3>
        <p style="font-size:0.85rem; color:var(--testo-chiaro); margin-bottom:8px;">⏱️ ${durataTotale} min totali</p>
        ${dati.note ? `<p style="font-size:0.85rem; font-style:italic; margin-bottom:8px;">${dati.note}</p>` : ""}
        ${dati.esercizi.map(e => `
          <div class="esercizio-riga" title="${(e.desc || "").replace(/"/g, "&quot;")}">
            <span>${e.nome}</span>
            <span class="tag-cat">${e.cat} · ${e.dur}'</span>
          </div>
        `).join("")}
      </div>
    `;
    azioniRisultatoAI.style.display = "block";
  } catch (err) {
    risultatoAI.innerHTML = `<p style="color:var(--rosso);">${err.message}</p>`;
  } finally {
    btnGeneraAllenamentoAI.disabled = false;
    btnGeneraAllenamentoAI.textContent = "✨ Genera allenamento";
  }
});

btnUsaAllenamentoAI.addEventListener("click", async () => {
  if (!allenamentoGeneratoAI) return;

  // Se richiesto, salvo nella libreria i nuovi esercizi (quelli non già presenti per nome)
  if (campoSalvaEserciziAI.checked) {
    const nomiEsistenti = new Set(Object.values(eserciziLibreria).map(e => (e.nome || "").trim().toLowerCase()));
    for (const es of allenamentoGeneratoAI.esercizi) {
      const nomeNorm = (es.nome || "").trim().toLowerCase();
      if (nomeNorm && !nomiEsistenti.has(nomeNorm)) {
        try {
          const nuovoRef = push(ref(db, "exercises"));
          const nuovoEsercizio = { nome: es.nome, cat: es.cat, dur: es.dur, desc: es.desc || "", players: "", foto: "", ts: Date.now() };
          await set(nuovoRef, nuovoEsercizio);
          eserciziLibreria[nuovoRef.key] = nuovoEsercizio;
          nomiEsistenti.add(nomeNorm);
        } catch (err) {
          console.error("Errore salvataggio esercizio AI:", err);
        }
      }
    }
  }

  // Precompilo il modulo standard "nuovo allenamento" con i dati generati
  overlayGeneraAI.classList.remove("attivo");
  apriNuovoAllenamento();
  document.getElementById("campoTitolo").value = allenamentoGeneratoAI.titolo || "";
  document.getElementById("campoNote").value = allenamentoGeneratoAI.note || "";
  listaEserciziForm.innerHTML = "";
  allenamentoGeneratoAI.esercizi.forEach(e => listaEserciziForm.appendChild(creaRigaEsercizio(e)));
});

// Se arrivo da un link diretto (es. dalla Dashboard) con ?id=..., apro subito quella scheda
const parametriURL = new URLSearchParams(window.location.search);
const idDaAprire = parametriURL.get("id");
if (idDaAprire) {
  // Aspetto che i dati siano caricati prima di aprire il modale
  const attendiEApri = setInterval(() => {
    if (allenamentiCache[idDaAprire]) {
      clearInterval(attendiEApri);
      apriModificaAllenamento(idDaAprire);
    }
  }, 150);
  // Smetto di provare dopo 5 secondi per sicurezza
  setTimeout(() => clearInterval(attendiEApri), 5000);
}
