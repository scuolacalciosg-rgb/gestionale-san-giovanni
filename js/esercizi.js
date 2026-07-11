import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, update, remove } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const listaEsercizi = document.getElementById("listaEsercizi");
const filtroCategoria = document.getElementById("filtroCategoria");
const ricercaEsercizio = document.getElementById("ricercaEsercizio");
const contatoreRisultati = document.getElementById("contatoreRisultati");
const overlayEsercizio = document.getElementById("overlayEsercizio");
const modaleTitoloEs = document.getElementById("modaleTitoloEs");
const btnNuovoEsercizio = document.getElementById("btnNuovoEsercizio");
const btnAnnullaEsercizio = document.getElementById("btnAnnullaEsercizio");
const btnSalvaEsercizio = document.getElementById("btnSalvaEsercizio");
const btnEliminaEsercizio = document.getElementById("btnEliminaEsercizio");
const inputFotoEs = document.getElementById("inputFotoEs");
const previewFotoEs = document.getElementById("previewFotoEs");

let fotoEsBase64Corrente = "";

const ORDINE_CATEGORIE = ["Riscaldamento", "Velocità", "Coordinativo", "Passaggi", "Conduzione", "Tiro", "Situazioni"];

let eserciziCache = {};
let idEsercizioCorrente = null;

// ============================================
// CARICAMENTO
// ============================================
async function caricaEsercizi() {
  try {
    const snap = await get(ref(db, "exercises"));
    eserciziCache = snap.exists() ? snap.val() : {};
    renderLista();
  } catch (err) {
    console.error(err);
    listaEsercizi.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento: ${err.message}</p>`;
  }
}

// ============================================
// RENDER (raggruppato per categoria, con filtro e ricerca)
// ============================================
function renderLista() {
  const catFiltro = filtroCategoria.value;
  const testoRicerca = ricercaEsercizio.value.trim().toLowerCase();

  const ids = Object.keys(eserciziCache).filter(id => {
    const e = eserciziCache[id];
    const passaCategoria = !catFiltro || e.cat === catFiltro;
    const passaRicerca = !testoRicerca || (e.nome || "").toLowerCase().includes(testoRicerca);
    return passaCategoria && passaRicerca;
  });

  contatoreRisultati.textContent = `${ids.length} esercizi${catFiltro ? " in " + catFiltro : ""}`;

  if (ids.length === 0) {
    listaEsercizi.innerHTML = `<p style="color:var(--testo-chiaro);">Nessun esercizio trovato.</p>`;
    return;
  }

  // Raggruppo per categoria
  const gruppi = {};
  ids.forEach(id => {
    const cat = eserciziCache[id].cat || "Altro";
    if (!gruppi[cat]) gruppi[cat] = [];
    gruppi[cat].push(id);
  });

  // Ordino le categorie secondo l'ordine standard, poi eventuali categorie extra in fondo
  const categorieOrdinate = [
    ...ORDINE_CATEGORIE.filter(c => gruppi[c]),
    ...Object.keys(gruppi).filter(c => !ORDINE_CATEGORIE.includes(c))
  ];

  listaEsercizi.innerHTML = categorieOrdinate.map(cat => {
    const idsCat = gruppi[cat].sort((a, b) => (eserciziCache[a].nome || "").localeCompare(eserciziCache[b].nome || ""));
    return `
      <div class="gruppo-categoria">
        <div class="gruppo-categoria-titolo">
          ${cat} <span class="conteggio">${idsCat.length}</span>
        </div>
        ${idsCat.map(id => {
          const e = eserciziCache[id];
          return `
            <div class="esercizio-lista-riga" data-id="${id}">
              <div class="riga-header">
                <span class="nome-es">${e.foto ? `<img src="${e.foto}" style="width:28px;height:28px;border-radius:5px;object-fit:cover;vertical-align:middle;margin-right:8px;">` : ""}${e.nome || "Senza nome"}</span>
                <span class="meta-es">⏱️ ${e.dur || "-"}' ${e.players ? "· 👥 " + e.players : ""}</span>
              </div>
              <div class="desc-es">${e.desc || "Nessuna descrizione."}</div>
              ${e.foto ? `<div class="desc-es"><img src="${e.foto}" style="max-width:100%; max-height:220px; border-radius:8px; object-fit:contain;"></div>` : ""}
              <div class="desc-es riga-azioni">
                <button class="btn-secondary btn-modifica-es" data-id="${id}">Modifica</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");

  // Click per espandere/chiudere la descrizione
  listaEsercizi.querySelectorAll(".esercizio-lista-riga").forEach(riga => {
    riga.querySelector(".riga-header").addEventListener("click", () => {
      riga.classList.toggle("espanso");
    });
  });

  listaEsercizi.querySelectorAll(".btn-modifica-es").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      apriModificaEsercizio(btn.dataset.id);
    });
  });
}

filtroCategoria.addEventListener("change", renderLista);
ricercaEsercizio.addEventListener("input", renderLista);

// ============================================
// MODALE
// ============================================
function apriNuovoEsercizio() {
  idEsercizioCorrente = null;
  modaleTitoloEs.textContent = "Nuovo esercizio";
  document.getElementById("campoNomeEs").value = "";
  document.getElementById("campoCatEs").value = "Riscaldamento";
  document.getElementById("campoDurEs").value = 15;
  document.getElementById("campoPlayersEs").value = "";
  document.getElementById("campoDescEs").value = "";
  fotoEsBase64Corrente = "";
  previewFotoEs.src = "";
  previewFotoEs.style.display = "none";
  inputFotoEs.value = "";
  btnEliminaEsercizio.style.display = "none";
  overlayEsercizio.classList.add("attivo");
}

function apriModificaEsercizio(id) {
  idEsercizioCorrente = id;
  const e = eserciziCache[id];
  modaleTitoloEs.textContent = e.nome || "Modifica esercizio";
  document.getElementById("campoNomeEs").value = e.nome || "";
  document.getElementById("campoCatEs").value = e.cat || "Riscaldamento";
  document.getElementById("campoDurEs").value = e.dur || 15;
  document.getElementById("campoPlayersEs").value = e.players || "";
  document.getElementById("campoDescEs").value = e.desc || "";
  fotoEsBase64Corrente = e.foto || "";
  if (fotoEsBase64Corrente) {
    previewFotoEs.src = fotoEsBase64Corrente;
    previewFotoEs.style.display = "block";
  } else {
    previewFotoEs.src = "";
    previewFotoEs.style.display = "none";
  }
  inputFotoEs.value = "";
  btnEliminaEsercizio.style.display = "inline-block";
  overlayEsercizio.classList.add("attivo");
}

function chiudiModale() {
  overlayEsercizio.classList.remove("attivo");
  idEsercizioCorrente = null;
}

// Upload e ridimensionamento immagine (max 400px di lato, per non appesantire il database)
inputFotoEs.addEventListener("change", () => {
  const file = inputFotoEs.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxLato = 400;
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

      fotoEsBase64Corrente = canvas.toDataURL("image/jpeg", 0.75);
      previewFotoEs.src = fotoEsBase64Corrente;
      previewFotoEs.style.display = "block";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

async function salvaEsercizio() {
  const dati = {
    nome: document.getElementById("campoNomeEs").value.trim(),
    cat: document.getElementById("campoCatEs").value,
    dur: document.getElementById("campoDurEs").value.trim(),
    players: document.getElementById("campoPlayersEs").value.trim(),
    desc: document.getElementById("campoDescEs").value.trim(),
    foto: fotoEsBase64Corrente
  };

  if (!dati.nome) {
    alert("Il nome dell'esercizio è obbligatorio.");
    return;
  }

  btnSalvaEsercizio.disabled = true;
  btnSalvaEsercizio.textContent = "Salvataggio...";

  try {
    if (idEsercizioCorrente) {
      await update(ref(db, `exercises/${idEsercizioCorrente}`), dati);
      eserciziCache[idEsercizioCorrente] = dati;
    } else {
      dati.ts = Date.now();
      const nuovoRef = push(ref(db, "exercises"));
      await set(nuovoRef, dati);
      eserciziCache[nuovoRef.key] = dati;
    }
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nel salvataggio: " + err.message);
  } finally {
    btnSalvaEsercizio.disabled = false;
    btnSalvaEsercizio.textContent = "Salva";
  }
}

async function eliminaEsercizio() {
  if (!idEsercizioCorrente) return;
  const nome = eserciziCache[idEsercizioCorrente]?.nome || "questo esercizio";
  if (!confirm(`Sei sicuro di voler eliminare "${nome}"? L'operazione è irreversibile.`)) return;

  try {
    await remove(ref(db, `exercises/${idEsercizioCorrente}`));
    delete eserciziCache[idEsercizioCorrente];
    renderLista();
    chiudiModale();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
}

btnNuovoEsercizio.addEventListener("click", apriNuovoEsercizio);
btnAnnullaEsercizio.addEventListener("click", chiudiModale);
btnSalvaEsercizio.addEventListener("click", salvaEsercizio);
btnEliminaEsercizio.addEventListener("click", eliminaEsercizio);
overlayEsercizio.addEventListener("click", (e) => {
  if (e.target === overlayEsercizio) chiudiModale();
});

caricaEsercizi();
