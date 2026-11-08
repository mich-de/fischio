# Fischio

Fischio è un'app di risultati di calcio in diretta. È fatta di tre parti:

- **`public/`**: l'app vera e propria, una pagina web installabile sul telefono.
- **`api/`**: il server ponte. Chiede i dati ad API-Football, li traduce e li tiene in cache. La chiave API resta sul server e non finisce mai nell'app.
- **`android/`**: il progetto Android Studio. Genera un APK che apre Fischio a schermo intero, con icona e schermata offline.

Senza chiave API il server funziona in **modalità dimostrativa**, con risultati di esempio. Così puoi provare tutto subito.

---

## 1. Prendi la chiave API-Football

1. Registrati su **dashboard.api-football.com**.
2. Copia la tua chiave API dalla dashboard.

Il piano gratuito ha un limite di richieste giornaliere. Prima di affidarti al piano gratuito, controlla sul sito due cose: il limite attuale e se include la stagione in corso.

## 2. Pubblica il server su Vercel

1. Carica questa cartella su un repository GitHub. Puoi lasciare fuori `android/`, ma tenerla non dà fastidio.
2. Su **vercel.com** scegli *Add New → Project* e importa il repository. Lascia il preset "Other" e non cambiare i comandi di build.
3. Vai in *Settings → Environment Variables* e aggiungi:

| Variabile | Obbligatoria | Valore |
|---|---|---|
| `API_FOOTBALL_KEY` | sì | la tua chiave |
| `LEAGUES` | no | ID dei campionati, in ordine. Predefinito: `135,2,3,848,39,140,78,61,136` |
| `LIVE_CACHE` | no | secondi di cache per le partite di oggi. Predefinito `120`. Col piano gratuito metti `900` |
| `TIMEZONE` | no | predefinito `Europe/Rome` |
| `SEASON` | no | anno della stagione. Di solito si calcola da solo |

4. Fai *Redeploy*. Apri l'indirizzo che ti dà Vercel (tipo `https://fischio-xxxx.vercel.app`): vedrai le partite reali.

Alcuni ID utili: 135 Serie A · 136 Serie B · 2 Champions League · 3 Europa League · 848 Conference League · 39 Premier League · 140 LaLiga · 78 Bundesliga · 61 Ligue 1 · 137 Coppa Italia. Con `LEAGUES=all` vedi tutti i campionati del mondo.

**Installarla senza APK:** apri l'indirizzo in Chrome sul telefono, menu ⋮ → *Aggiungi a schermata Home*.

## 3. Genera l'APK Android

### Con GitHub (senza installare niente)

1. Nel repository vai in *Settings → Secrets and variables → Actions → Variables* e crea la variabile `FISCHIO_URL` con l'indirizzo Vercel (es. `https://fischio-xxxx.vercel.app`).
2. Vai in *Actions → APK Android → Run workflow*.
3. Dopo qualche minuto apri l'esecuzione completata e scarica **fischio-apk** in fondo alla pagina. Dentro c'è `fischio.apk`.

Per avere un link di download fisso, crea un tag (es. `v1.0`) da *Releases → Draft a new release*: l'APK viene allegato alla release da solo.

### Con Android Studio

1. Installa **Android Studio** (gratuito).
2. Apri la cartella `android/` con *File → Open*. Aspetta che finisca la sincronizzazione: la prima volta scarica Gradle e l'SDK.
3. In `android/gradle.properties` sostituisci l'indirizzo:
   ```
   fischio.url=https://fischio-xxxx.vercel.app
   ```
4. *Build → Build App Bundle(s) / APK(s) → Build APK(s)*. Al termine clicca *locate*: trovi `app-debug.apk`.
5. Copia l'APK sul telefono e aprilo. Android ti chiederà di consentire l'installazione da questa fonte.

Da riga di comando, con l'SDK Android installato: `cd android && ./gradlew assembleRelease`. Il file esce in `app/build/outputs/apk/release/`.

La versione *release* è firmata con la chiave di debug. Va bene per il tuo telefono e per amici. Per pubblicarla su Google Play crea una chiave tua con *Build → Generate Signed App Bundle*.

## Provarla sul computer

Ti serve Node.js 18 o superiore.

```bash
node server.js                          # modalità dimostrativa
API_FOOTBALL_KEY=la-tua-chiave node server.js   # dati reali
```

Poi apri http://localhost:3000.

## Cosa fa l'app

- Partite da 3 giorni fa a 3 giorni avanti, raggruppate per campionato.
- Filtri *In diretta* e *Preferiti*. La stella salva la partita sul dispositivo.
- Aggiornamento automatico ogni minuto quando guardi la giornata di oggi. Una partita con un risultato cambiato lampeggia.
- Per ogni partita: cronaca (gol, cartellini, cambi, VAR), statistiche e classifica con le squadre evidenziate.
- Tema chiaro e scuro automatici.

## Endpoint del server

- `GET /api/fixtures?date=AAAA-MM-GG`: partite del giorno
- `GET /api/match?id=123`: cronaca e statistiche di una partita
- `GET /api/standings?league=135`: classifica
