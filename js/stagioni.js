import { proteggiPagina, collegaLogout } from "./auth-guard.js";
import { db, ref, get, set, push } from "./firebase-config.js";

await proteggiPagina();
collegaLogout();

const cardsStagioneCorrente = document.getElementById("cardsStagioneCorrente");
const listaStagioni = document.getElementById("listaStagioni");
const btnArchiviaStagione = document.getElementById("btnArchiviaStagione");
const overlayStagione = document.getElementById("overlayStagione");
const modaleTitoloStagione = document.getElementById("modaleTitoloStagione");
const dettaglioStagione = document.getElementById("dettaglioStagione");
const btnChiudiStagione = document.getElementById("btnChiudiStagione");

let playersCache = {};
let partiteCache = {};
let rapportiCache = {};
let stagioniCache = {};

function formattaDataOggi() {
  const oggi = new Date();
  const gg = String(oggi.getDate()).padStart(2, "0");
  const mm = String(oggi.getMonth() + 1).padStart(2, "0");
  const aaaa = oggi.getFullYear();
  return `${gg}/${mm}/${aaaa}`;
}

function calcolaStatistiche(players, partite) {
  const partiteGiocate = Object.values(partite).filter(p =>
    p.golNostri !== null && p.golNostri !== undefined && p.golAvversario !== null && p.golAvversario !== undefined
  );
  const vittorie = partiteGiocate.filter(p => p.golNostri > p.golAvversario).length;
  const pareggi = partiteGiocate.filter(p => p.golNostri === p.golAvversario).length;
  const sconfitte = partiteGiocate.filter(p => p.golNostri < p.golAvversario).length;
  const golFatti = partiteGiocate.reduce((s, p) => s + Number(p.golNostri || 0), 0);
  const golSubiti = partiteGiocate.reduce((s, p) => s + Number(p.golAvversario || 0), 0);

  return {
    nGiocatori: Object.keys(players).length,
    nPartite: partiteGiocate.length,
    vittorie, pareggi, sconfitte, golFatti, golSubiti
  };
}

// ============================================
// CARICAMENTO
// ============================================
async function caricaTutto() {
  try {
    const [snapPlayers, snapPartite, snapRapporti, snapStagioni] = await Promise.all([
      get(ref(db, "players")),
      get(ref(db, "partite")),
      get(ref(db, "rapporti")),
      get(ref(db, "stagioni"))
    ]);
    playersCache = snapPlayers.exists() ? snapPlayers.val() : {};
    partiteCache = snapPartite.exists() ? snapPartite.val() : {};
    rapportiCache = snapRapporti.exists() ? snapRapporti.val() : {};
    stagioniCache = snapStagioni.exists() ? snapStagioni.val() : {};

    renderStagioneCorrente();
    renderArchivio();
  } catch (err) {
    console.error(err);
    cardsStagioneCorrente.innerHTML = `<p style="color:var(--rosso);">Errore: ${err.message}</p>`;
  }
}

function renderStagioneCorrente() {
  const s = calcolaStatistiche(playersCache, partiteCache);
  cardsStagioneCorrente.innerHTML = `
    <div class="card"><div class="numero">${s.nGiocatori}</div><div class="etichetta">Giocatori</div></div>
    <div class="card"><div class="numero">${s.nPartite}</div><div class="etichetta">Partite giocate</div></div>
    <div class="card"><div class="numero">${s.vittorie}</div><div class="etichetta">Vittorie</div></div>
    <div class="card"><div class="numero">${s.pareggi}</div><div class="etichetta">Pareggi</div></div>
    <div class="card"><div class="numero">${s.sconfitte}</div><div class="etichetta">Sconfitte</div></div>
    <div class="card"><div class="numero">${s.golFatti} - ${s.golSubiti}</div><div class="etichetta">Gol fatti / subiti</div></div>
  `;
}

// ============================================
// ARCHIVIO STAGIONI
// ============================================
function renderArchivio() {
  const ids = Object.keys(stagioniCache).sort((a, b) => (stagioniCache[b].nome || "").localeCompare(stagioniCache[a].nome || ""));

  if (ids.length === 0) {
    listaStagioni.innerHTML = `<p style="color:var(--testo-chiaro);">Nessuna stagione archiviata ancora.</p>`;
    return;
  }

  listaStagioni.innerHTML = ids.map(id => {
    const s = stagioniCache[id];
    return `
      <div class="allenamento-card" data-id="${id}" style="cursor:pointer;">
        <div class="data-riga">
          <h3>${s.nome || "Stagione"}</h3>
          <span class="tag-cat">Archiviata il ${s.archiviataIl || "-"}</span>
        </div>
        <p style="font-size:0.9rem; color:var(--testo-chiaro);">
          👥 ${s.nGiocatori || 0} giocatori · ⚽ ${s.nPartite || 0} partite ·
          ${s.vittorie || 0}V ${s.pareggi || 0}N ${s.sconfitte || 0}P ·
          Gol ${s.golFatti || 0}-${s.golSubiti || 0}
        </p>
      </div>
    `;
  }).join("");

  listaStagioni.querySelectorAll(".allenamento-card").forEach(card => {
    card.addEventListener("click", () => apriDettaglioStagione(card.dataset.id));
  });
}

function apriDettaglioStagione(id) {
  const s = stagioniCache[id];
  modaleTitoloStagione.textContent = s.nome || "Stagione";

  const giocatori = s.giocatori ? Object.values(s.giocatori) : [];
  const nRapporti = s.rapporti ? Object.keys(s.rapporti).length : 0;

  dettaglioStagione.innerHTML = `
    <p style="color:var(--testo-chiaro); margin-bottom:14px;">Archiviata il ${s.archiviataIl || "-"}</p>
    <div class="cards-grid" style="margin-bottom:20px;">
      <div class="card"><div class="numero">${s.nPartite || 0}</div><div class="etichetta">Partite</div></div>
      <div class="card"><div class="numero">${s.vittorie || 0}</div><div class="etichetta">Vittorie</div></div>
      <div class="card"><div class="numero">${s.pareggi || 0}</div><div class="etichetta">Pareggi</div></div>
      <div class="card"><div class="numero">${s.sconfitte || 0}</div><div class="etichetta">Sconfitte</div></div>
    </div>
    <h3 style="margin-bottom:8px; font-size:1rem;">Rosa della stagione (${giocatori.length})</h3>
    <p style="font-size:0.9rem; color:var(--testo-chiaro); margin-bottom:14px;">
      ${giocatori.map(g => g.nome).filter(Boolean).join(", ") || "Nessun dato salvato."}
    </p>
    <p style="font-size:0.85rem; color:var(--testo-chiaro);">📝 ${nRapporti} rapporti salvati in questa istantanea.</p>
  `;

  overlayStagione.classList.add("attivo");
}

btnChiudiStagione.addEventListener("click", () => overlayStagione.classList.remove("attivo"));
overlayStagione.addEventListener("click", (e) => {
  if (e.target === overlayStagione) overlayStagione.classList.remove("attivo");
});

// ============================================
// ARCHIVIA STAGIONE CORRENTE (crea una fotografia, non elimina nulla)
// ============================================
btnArchiviaStagione.addEventListener("click", async () => {
  const nomeSuggerito = (() => {
    const oggi = new Date();
    const anno = oggi.getFullYear();
    const meseCorrente = oggi.getMonth(); // 0 = gennaio
    // Se siamo tra luglio e dicembre, la stagione è AnnoCorrente/AnnoSuccessivo, altrimenti AnnoPrecedente/AnnoCorrente
    return meseCorrente >= 6 ? `${anno}/${String(anno + 1).slice(2)}` : `${anno - 1}/${String(anno).slice(2)}`;
  })();

  const nome = prompt(
    "Questa operazione crea una FOTOGRAFIA della stagione attuale (giocatori, statistiche e rapporti) senza eliminare nulla dai dati correnti.\n\nCome vuoi chiamare questa stagione?",
    nomeSuggerito
  );
  if (!nome) return;

  btnArchiviaStagione.disabled = true;
  btnArchiviaStagione.textContent = "Archiviazione in corso...";

  try {
    const stats = calcolaStatistiche(playersCache, partiteCache);

    // Snapshot leggero dei giocatori (senza le foto, per non appesantire troppo l'archivio)
    const giocatoriSnapshot = {};
    Object.keys(playersCache).forEach(id => {
      const p = playersCache[id];
      giocatoriSnapshot[id] = { nome: p.nome || "", ruolo: p.ruolo || "", numero: p.numero || "" };
    });

    const dati = {
      nome,
      archiviataIl: formattaDataOggi(),
      giocatori: giocatoriSnapshot,
      rapporti: rapportiCache,
      ...stats
    };

    const nuovoRef = push(ref(db, "stagioni"));
    await set(nuovoRef, dati);
    stagioniCache[nuovoRef.key] = dati;

    renderArchivio();
    alert(`Stagione "${nome}" archiviata con successo! I dati correnti (giocatori, allenamenti, ecc.) restano intatti e continui a usarli normalmente.`);
  } catch (err) {
    alert("Errore nell'archiviazione: " + err.message);
  } finally {
    btnArchiviaStagione.disabled = false;
    btnArchiviaStagione.textContent = "📦 Archivia stagione corrente";
  }
});

caricaTutto();
