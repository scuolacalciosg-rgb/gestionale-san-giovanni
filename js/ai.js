import { OPENROUTER_API_KEY, AI_MODEL } from "./ai-config.js";

// Chiama l'AI con un prompt di sistema (il "ruolo") e un prompt utente (la richiesta vera e propria)
export async function chiamaAI(promptSistema, promptUtente) {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("INSERISCI_QUI")) {
    throw new Error("Chiave AI non configurata. Apri js/ai-config.js e inserisci la tua chiave OpenRouter.");
  }

  const risposta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Gestionale San Giovanni"
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: promptSistema },
        { role: "user", content: promptUtente }
      ]
    })
  });

  if (!risposta.ok) {
    const testoErrore = await risposta.text();
    if (risposta.status === 429) {
      throw new Error("Hai raggiunto il limite di richieste gratuite per ora. Riprova tra qualche minuto.");
    }
    throw new Error(`Errore nella richiesta all'AI (${risposta.status}): ${testoErrore.slice(0, 200)}`);
  }

  const dati = await risposta.json();
  const testo = dati.choices?.[0]?.message?.content || "";
  if (!testo) throw new Error("L'AI non ha restituito alcuna risposta. Riprova.");
  return testo;
}

// Ripulisce eventuali "a capo" o caratteri di controllo scritti dall'AI dentro
// le stringhe del JSON (che altrimenti mandano in errore il parsing)
function sanaCaratteriControllo(testo) {
  let risultato = "";
  let dentroStringa = false;
  let precedenteEraBackslash = false;

  for (const carattere of testo) {
    if (dentroStringa) {
      if (precedenteEraBackslash) {
        risultato += carattere;
        precedenteEraBackslash = false;
        continue;
      }
      if (carattere === "\\") {
        risultato += carattere;
        precedenteEraBackslash = true;
        continue;
      }
      if (carattere === "\n") { risultato += "\\n"; continue; }
      if (carattere === "\r") { continue; }
      if (carattere === "\t") { risultato += "\\t"; continue; }
      if (carattere === '"') { dentroStringa = false; risultato += carattere; continue; }
      risultato += carattere;
    } else {
      if (carattere === '"') dentroStringa = true;
      risultato += carattere;
    }
  }
  return risultato;
}

// Estrae in modo robusto un oggetto JSON dalla risposta testuale dell'AI
// (utile perché a volte i modelli aggiungono testo o backtick attorno al JSON)
export function estraiJSON(testo) {
  const pulito = testo.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");
  if (inizio === -1 || fine === -1) {
    throw new Error("La risposta dell'AI non era nel formato atteso. Riprova, magari riformulando le linee guida.");
  }
  const grezzo = pulito.slice(inizio, fine + 1);
  const sanato = sanaCaratteriControllo(grezzo);
  return JSON.parse(sanato);
}
