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

// Estrae in modo robusto un oggetto JSON dalla risposta testuale dell'AI
// (utile perché a volte i modelli aggiungono testo o backtick attorno al JSON)
export function estraiJSON(testo) {
  const pulito = testo.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");
  if (inizio === -1 || fine === -1) {
    throw new Error("La risposta dell'AI non era nel formato atteso. Riprova, magari riformulando le linee guida.");
  }
  return JSON.parse(pulito.slice(inizio, fine + 1));
}
