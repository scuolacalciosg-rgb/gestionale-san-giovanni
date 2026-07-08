import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";

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

let allenamentiCache = {};
let idAllenamentoCorrente = null;

const CATEGORIE_ESERCIZIO = ["Riscaldamento", "Velocità", "Coordinativo", "Passaggi", "Conduzione", "Tiro", "Situazioni"];

// ============================================
// CARICAMENTO E RENDER LISTA
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

function renderLista() {
  const ids = Object.keys(allenamentiCache);
  if (ids.length === 0) {
    listaAllenamenti.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun allenamento ancora inserito.</p>`;
    return;
  }

  // Ordino dal più recente/futuro al più vecchio
  ids.sort((a, b) => (allenamentiCache[b].data || "").localeCompare(allenamentiCache[a].data || ""));

  const oggi = new Date().toISOString().split("T")[0];

  listaAllenamenti.innerHTML = ids.map(id => {
    const a = allenamentiCache[id];
    const esercizi = a.esercizi || [];
    const durataTotale = esercizi.reduce((s, e) => s + Number(e.dur || 0), 0);
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
        ${esercizi.map(e => `
          <div class="esercizio-riga">
            <span>${e.nome}</span>
            <span class="tag-cat">${e.cat} · ${e.dur}'</span>
          </div>
        `).join("")}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn-secondary btn-modifica" data-id="${id}">Modifica</button>
        </div>
      </div>
    `;
  }).join("");

  listaAllenamenti.querySelectorAll(".btn-modifica").forEach(btn => {
    btn.addEventListener("click", () => apriModificaAllenamento(btn.dataset.id));
  });
}

// ============================================
// FORM ESERCIZI DINAMICO
// ============================================
function creaRigaEsercizio(esercizio = {}) {
  const riga = document.createElement("div");
  riga.className = "esercizio-form-riga";
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
    dur: riga.querySelector(".es-dur").value.trim()
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
