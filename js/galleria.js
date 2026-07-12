import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push, remove } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const galleriaGrid = document.getElementById("galleriaGrid");
const inputCaricaFoto = document.getElementById("inputCaricaFoto");
const statoCaricamento = document.getElementById("statoCaricamento");
const overlayLightbox = document.getElementById("overlayLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxNome = document.getElementById("lightboxNome");
const btnChiudiLightbox = document.getElementById("btnChiudiLightbox");
const btnEliminaFoto = document.getElementById("btnEliminaFoto");

let galleriaCache = {};
let idFotoCorrente = null;

// ============================================
// CARICAMENTO E RENDER
// ============================================
async function caricaGalleria() {
  try {
    const snap = await get(ref(db, "gallery"));
    galleriaCache = snap.exists() ? snap.val() : {};
    renderGriglia();
  } catch (err) {
    console.error(err);
    galleriaGrid.innerHTML = `<p style="color:var(--rosso);">Errore nel caricamento: ${err.message}</p>`;
  }
}

function renderGriglia() {
  const ids = Object.keys(galleriaCache).sort((a, b) => Number(galleriaCache[b].ts || 0) - Number(galleriaCache[a].ts || 0));

  if (ids.length === 0) {
    galleriaGrid.innerHTML = `<p style="color:var(--testo-chiaro);">Nessuna foto ancora caricata. Aggiungine una!</p>`;
    return;
  }

  galleriaGrid.innerHTML = ids.map(id => {
    const f = galleriaCache[id];
    return `
      <div class="galleria-cella" data-id="${id}">
        <img src="${f.url}" alt="${f.name || ''}" loading="lazy">
      </div>
    `;
  }).join("");

  galleriaGrid.querySelectorAll(".galleria-cella").forEach(cella => {
    cella.addEventListener("click", () => apriLightbox(cella.dataset.id));
  });
}

// ============================================
// UPLOAD FOTO (con ridimensionamento)
// ============================================
function ridimensionaImmagine(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxLato = 900;
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
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

inputCaricaFoto.addEventListener("change", async () => {
  const files = Array.from(inputCaricaFoto.files);
  if (files.length === 0) return;

  statoCaricamento.style.display = "block";

  let caricate = 0;
  for (const file of files) {
    statoCaricamento.textContent = `Caricamento foto ${caricate + 1} di ${files.length}...`;
    try {
      const base64 = await ridimensionaImmagine(file);
      const nuovoRef = push(ref(db, "gallery"));
      const nuovaFoto = { name: file.name, ts: Date.now(), type: "image", url: base64 };
      await set(nuovoRef, nuovaFoto);
      galleriaCache[nuovoRef.key] = nuovaFoto;
      caricate++;
    } catch (err) {
      console.error("Errore caricamento foto:", err);
    }
  }

  statoCaricamento.style.display = "none";
  inputCaricaFoto.value = "";
  renderGriglia();
});

// ============================================
// LIGHTBOX
// ============================================
function apriLightbox(id) {
  idFotoCorrente = id;
  const f = galleriaCache[id];
  lightboxImg.src = f.url;
  lightboxNome.textContent = f.name || "";
  overlayLightbox.classList.add("attivo");
}

btnChiudiLightbox.addEventListener("click", () => {
  overlayLightbox.classList.remove("attivo");
  idFotoCorrente = null;
});

overlayLightbox.addEventListener("click", (e) => {
  if (e.target === overlayLightbox) {
    overlayLightbox.classList.remove("attivo");
    idFotoCorrente = null;
  }
});

btnEliminaFoto.addEventListener("click", async () => {
  if (!idFotoCorrente) return;
  if (!confirm("Eliminare questa foto? L'operazione è irreversibile.")) return;

  try {
    await remove(ref(db, `gallery/${idFotoCorrente}`));
    delete galleriaCache[idFotoCorrente];
    overlayLightbox.classList.remove("attivo");
    idFotoCorrente = null;
    renderGriglia();
  } catch (err) {
    alert("Errore nell'eliminazione: " + err.message);
  }
});

caricaGalleria();
