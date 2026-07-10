import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const listaGiocatori = document.getElementById("listaGiocatori");
const overlayGiocatore = document.getElementById("overlayGiocatore");
const modaleTitolo = document.getElementById("modaleTitolo");
const btnNuovoGiocatore = document.getElementById("btnNuovoGiocatore");
const btnAnnullaGiocatore = document.getElementById("btnAnnullaGiocatore");
const btnSalvaGiocatore = document.getElementById("btnSalvaGiocatore");
const btnEliminaGiocatore = document.getElementById("btnEliminaGiocatore");
const inputFoto = document.getElementById("inputFoto");
const previewFoto = document.getElementById("previewFoto");

let giocatoriCache = {}; // id -> dati giocatore
let idGiocatoreCorrente = null; // null = nuovo giocatore
let fotoBase64Corrente = "";

const STATI = ["Disponibile", "Infortunato", "Indisponibile", "Recuperato", "Convocato"];

// ============================================
// CARICAMENTO E RENDER LISTA
// ============================================
async function caricaGiocatori() {
  try {
    const snap = await get(ref(db, "players"));
    giocatoriCache = snap.exists() ? snap.val() : {};
    renderLista();
  } catch (err) {
    console.error(err);
    listaGiocatori.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento: ${err.message}</p>`;
  }
}

function renderLista() {
  const ids = Object.keys(giocatoriCache);
  if (ids.length === 0) {
    listaGiocatori.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun giocatore ancora inserito.</p>`;
    return;
  }

  // Ordino per numero di maglia
  ids.sort((a, b) => Number(giocatoriCache[a].numero || 0) - Number(giocatoriCache[b].numero || 0));

  listaGiocatori.innerHTML = ids.map(id => {
    const g = giocatoriCache[id];
    const statoClasse = (g.stato || "disponibile").toLowerCase();
    const foto = g.foto || "";
    return `
      <div class="giocatore-card" data-id="${id}">
        <img src="${foto}" alt="${g.nome || ''}" onerror="this.style.opacity=0">
        <div class="info">
          <h3>${g.nome || "Senza nome"}</h3>
          <div class="ruolo">#${g.numero || "-"} · ${g.ruolo || "-"}</div>
          <select class="select-stato" data-id="${id}" style="margin-top:8px; width:100%; padding:4px; border-radius:6px; border:1px solid var(--bordo);">
            ${STATI.map(s => `<option value="${s}" ${s === g.stato ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }).join("");

  // Click sulla card (ma non sul select) apre la scheda completa
  listaGiocatori.querySelectorAll(".giocatore-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.tagName === "SELECT") return;
      apriSchedaGiocatore(card.dataset.id);
    });
  });

  // Cambio rapido dello stato
  listaGiocatori.querySelectorAll(".select-stato").forEach(sel => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const nuovoStato = e.target.value;
      try {
        await update(ref(db, `players/${id}`), { stato: nuovoStato });
        giocatoriCache[id].stato = nuovoStato;
      } catch (err) {
        alert("Errore nel salvataggio dello stato: " + err.message);
      }
    });
  });
}

// ============================================
// GESTIONE MODALE SCHEDA GIOCATORE
// ============================================
function apriSchedaGiocatore(id) {
  idGiocatoreCorrente = id;
  const g = giocatoriCache[id];

  modaleTitolo.textContent = g.nome || "Scheda giocatore";
  document.getElementById("campoNome").value = g.nome || "";
  document.getElementById("campoNumero").value = g.numero || "";
  document.getElementById("campoRuolo").value = g.ruolo || "Difensore";
  document.getElementById("campoDataNascita").value = g.dataNascita || "";
  document.getElementById("campoAnno").value = g.anno || "";
  document.getElementById("campoCategoria").value = g.categoria || "";
  document.getElementById("campoStato").value = g.stato || "Disponibile";
  document.getElementById("campoGenitore").value = g.genitore || "";
  document.getElementById("campoContatto").value = g.contatto || "";
  document.getElementById("campoIndirizzo").value = g.indirizzo || "";
  document.getElementById("campoVisita").value = g.visita || "";
  document.getElementById("campoGol").value = g.gol || 0;
  document.getElementById("campoAssist").value = g.assist || 0;

  fotoBase64Corrente = g.foto || "";
  previewFoto.src = fotoBase64Corrente || "https://via.placeholder.com/120?text=Foto";
  inputFoto.value = "";

  btnEliminaGiocatore.style.display = "inline-block";
  overlayGiocatore.classList.add("attivo");
}

function apriNuovoGiocatore() {
  idGiocatoreCorrente = null;
  modaleTitolo.textContent = "Nuovo giocatore";

  document.getElementById("campoNome").value = "";
  document.getElementById("campoNumero").value = "";
  document.getElementById("campoRuolo").value = "Difensore";
  document.getElementById("campoDataNascita").value = "";
  document.getElementById("campoAnno").value = "";
  document.getElementById("campoCategoria").value = "";
  document.getElementById("campoStato").value = "Disponibile";
  document.getElementById("campoGenitore").value = "";
  document.getElementById("campoContatto").value = "";
  document.getElementById("campoIndirizzo").value = "";
  document.getElementById("campoVisita").value = "";
  document.getElementById("campoGol").value = 0;
  document.getElementById("campoAssist").value = 0;

  fotoBase64Corrente = "";
  previewFoto.src = "https://via.placeholder.com/120?text=Foto";
  inputFoto.value = "";

  btnEliminaGiocatore.style.display = "none";
  overlayGiocatore.classList.add("attivo");
}

function chiudiModale() {
  overlayGiocatore.classList.remove("attivo");
  idGiocatoreCorrente = null;
}

// ============================================
// UPLOAD E RIDUZIONE FOTO (per non appesantire il database)
// ============================================
inputFoto.addEventListener("change", () => {
  const file = inputFoto.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Ridimensiono l'immagine a max 300px di larghezza per non appesantire il database
      const maxLato = 300;
      let { width, height } = img;
      if (width > height && width > maxLato) {
        height = Math.round(height * (maxLato / width));
        width = maxLato;
      } else if (height > maxLato) {
        width = Math.round(width * (maxLato / height));
        height = maxLato;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      fotoBase64Corrente = canvas.toDataURL("image/jpeg", 0.7);
      previewFoto.src = fotoBase64Corrente;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ============================================
// SALVA / ELIMINA
// ============================================
async function salvaGiocatore() {
  const dati = {
    nome: document.getElementById("campoNome").value.trim(),
    numero: document.getElementById("campoNumero").value.trim(),
    ruolo: document.getElementById("campoRuolo").value,
    dataNascita: document.getElementById("campoDataNascita").value,
    anno: document.getElementById("campoAnno").value.trim(),
    categoria: document.getElementById("campoCategoria").value.trim(),
    stato: document.getElementById("campoStato").value,
    genitore: document.getElementById("campoGenitore").value.trim(),
    contatto: document.getElementById("campoContatto").value.trim(),
    indirizzo: document.getElementById("campoIndirizzo").value.trim(),
    visita: document.getElementById("campoVisita").value,
    gol: Number(document.getElementById("campoGol").value) || 0,
    assist: Number(document.getElementById("campoAssist").value) || 0,
    foto: fotoBase64Corrente
  };

  if (!dati.nome) {
    alert("Il nome del giocatore è obbligatorio.");
    return;
  }

  btnSalvaGiocatore.disabled = true;
  btnSalvaGiocatore.textContent = "Salvataggio...";

  try {
    if (idGiocatoreCorrente) {
      await update(ref(db, `players/${idGiocatoreCorrente}`), dati);
      giocatoriCache[idGiocatoreCorrente] = dati;
    } else {
      const nuovoRef = push(ref(db, "players"));
      await set(nuovoRef, dati);
      giocatoriCache[nuovoRef.key] = dati;
    }
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaGiocatore.disabled = false;
    btnSalvaGiocatore.textContent = "Salva";
  }
}

async function eliminaGiocatore() {
  if (!idGiocatoreCorrente) return;
  const nome = giocatoriCache[idGiocatoreCorrente]?.nome || "questo giocatore";
  if (!confirm(`Sei sicuro di voler eliminare ${nome}? L'operazione è irreversibile.`)) return;

  try {
    await remove(ref(db, `players/${idGiocatoreCorrente}`));
    delete giocatoriCache[idGiocatoreCorrente];
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

// ============================================
// EVENTI
// ============================================
btnNuovoGiocatore.addEventListener("click", apriNuovoGiocatore);
btnAnnullaGiocatore.addEventListener("click", chiudiModale);
btnSalvaGiocatore.addEventListener("click", salvaGiocatore);
btnEliminaGiocatore.addEventListener("click", eliminaGiocatore);
overlayGiocatore.addEventListener("click", (e) => {
  if (e.target === overlayGiocatore) chiudiModale();
});

caricaGiocatori();

// Se arrivo da un link diretto (es. dalla ricerca) con ?id=..., apro subito quella scheda
const parametriURL = new URLSearchParams(window.location.search);
const idDaAprire = parametriURL.get("id");
if (idDaAprire) {
  const attendiEApri = setInterval(() => {
    if (giocatoriCache[idDaAprire]) {
      clearInterval(attendiEApri);
      apriSchedaGiocatore(idDaAprire);
    }
  }, 150);
  setTimeout(() => clearInterval(attendiEApri), 5000);
}
