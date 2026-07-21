import { db, ref, get } from "./firebase-config.js";

// ============================================
// NOTIFICA LEGGERA "NUOVE ATTIVITÀ"
// ============================================
// Confronta il timestamp più recente tra le sezioni principali con l'ultima
// visita registrata su QUESTO dispositivo/browser, e mostra un pallino rosso
// sulla voce Dashboard del menu se c'è qualcosa di nuovo da vedere.

const CHIAVE_ULTIMA_VISITA = "gestionaleSG_ultimaVisita";
const SEZIONI_DA_CONTROLLARE = ["trainings", "partite", "tornei", "riunioni", "news", "rapporti", "infortuni"];

async function controllaNuoveAttivita() {
  try {
    const risultati = await Promise.all(
      SEZIONI_DA_CONTROLLARE.map(sezione => get(ref(db, sezione)))
    );

    let tsPiuRecente = 0;
    risultati.forEach(snap => {
      if (!snap.exists()) return;
      Object.values(snap.val()).forEach(elemento => {
        const ts = Number(elemento.ts || 0);
        if (ts > tsPiuRecente) tsPiuRecente = ts;
      });
    });

    const ultimaVisita = Number(localStorage.getItem(CHIAVE_ULTIMA_VISITA) || 0);

    if (tsPiuRecente > ultimaVisita) {
      mostraPallinoNotifica();
    }
  } catch (err) {
    console.error("Errore controllo nuove attività:", err);
  }
}

function mostraPallinoNotifica() {
  const linkDashboard = document.querySelector('.sidebar-nav a[href="dashboard.html"]');
  if (!linkDashboard || linkDashboard.querySelector(".pallino-notifica")) return;

  const pallino = document.createElement("span");
  pallino.className = "pallino-notifica";
  pallino.title = "Ci sono nuove attività da vedere";
  linkDashboard.appendChild(pallino);
}

// Se sono sulla Dashboard, appena la pagina è aperta segno "visto tutto ad ora"
function segnaComeVisto() {
  if (window.location.pathname.endsWith("dashboard.html")) {
    localStorage.setItem(CHIAVE_ULTIMA_VISITA, String(Date.now()));
  }
}

segnaComeVisto();
controllaNuoveAttivita();
