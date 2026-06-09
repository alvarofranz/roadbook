/* i18n de RDBK.app. Aplica traducciones a [data-i18n] / [data-i18n-html] y
   recuerda el idioma en localStorage. Auto-detecta el idioma del navegador y,
   si no hay traducción, usa inglés por defecto. Idiomas: en (def) · es · it. */
(function () {
    'use strict';

    const T = {
        en: {
            'hero.title': 'Digital roadbooks for <span class="accent">your adventures</span>',
            'hero.lead': 'Build a roadbook from a GPX, follow it with GPS and share it. 4x4, moto, bike, running… any adventure.',
            'hero.cta_tools': 'See the tools', 'hero.cta_challenges': 'Challenges',
            'flow.kicker': 'Features', 'flow.title': 'Everything you need',
            'feat.1.t': 'Editor', 'feat.1.d': 'Build a roadbook from a GPX and edit notes, road types and CAP on satellite maps.',
            'feat.2.t': 'Record route', 'feat.2.d': 'Record live with GPS, dropping waypoints as you go — no GPX needed.',
            'feat.3.t': 'Vignettes', 'feat.3.d': 'Design each note: junction vectors, resizable icons and your own symbols.',
            'feat.4.t': 'Reader', 'feat.4.d': 'Navigate with odometer, bearing, a live map and the CAP direction bar.',
            'feat.5.t': 'Tripmaster', 'feat.5.d': 'A precise GPS odometer with no roadbook — partial and total distance.',
            'feat.6.t': 'Validate & QR', 'feat.6.d': 'Validate notes (manual or automatic) and emit a signed result QR.',
            'feat.7.t': 'Ranking', 'feat.7.d': 'Scan QRs and build accuracy, CAP, speed and regularity rankings.',
            'feat.8.t': 'Accounts & sharing', 'feat.8.d': 'Sign in to store roadbooks and publish them as public challenges.',
            'gallery.kicker': 'Gallery', 'gallery.title': 'Public Challenges', 'gallery.loading': 'Loading tracks…', 'gallery.empty': 'No tracks yet.', 'gallery.notes': 'notes',
        },
        es: {
            'hero.title': 'Roadbooks digitales para <span class="accent">tus aventuras</span>',
            'hero.lead': 'Crea un roadbook desde un GPX, síguelo con GPS y compártelo. 4x4, moto, bici, correr… cualquier aventura.',
            'hero.cta_tools': 'Ver herramientas', 'hero.cta_challenges': 'Challenges',
            'flow.kicker': 'Funciones', 'flow.title': 'Todo lo que necesitas',
            'feat.1.t': 'Editor', 'feat.1.d': 'Crea un roadbook desde un GPX y edita notas, tipo de pista y CAP sobre mapa satélite.',
            'feat.2.t': 'Grabar ruta', 'feat.2.d': 'Graba en vivo con GPS, soltando waypoints sobre la marcha — sin GPX.',
            'feat.3.t': 'Viñetas', 'feat.3.d': 'Diseña cada nota: vectores de bifurcación, iconos redimensionables y los tuyos propios.',
            'feat.4.t': 'Reader', 'feat.4.d': 'Navega con odómetro, rumbo, mapa en vivo y la barra de dirección CAP.',
            'feat.5.t': 'Tripmaster', 'feat.5.d': 'Un odómetro GPS preciso sin roadbook — distancia parcial y total.',
            'feat.6.t': 'Validar y QR', 'feat.6.d': 'Valida notas (manual o automática) y emite un QR de resultado firmado.',
            'feat.7.t': 'Clasificación', 'feat.7.d': 'Escanea los QR y genera clasificaciones de precisión, CAP, velocidad y regularidad.',
            'feat.8.t': 'Cuentas y compartir', 'feat.8.d': 'Inicia sesión para guardar roadbooks y publicarlos como challenges públicos.',
            'gallery.kicker': 'Galería', 'gallery.title': 'Challenges públicos', 'gallery.loading': 'Cargando tracks…', 'gallery.empty': 'Aún no hay tracks.', 'gallery.notes': 'notas',
            // ---- tools (the English string is the key) ----
            'Load from': 'Cargar desde', 'Import a GPS track → roadbook': 'Importa un track GPS → roadbook',
            'Open an existing roadbook': 'Abre un roadbook existente', 'Record route': 'Grabar ruta',
            'Record live with GPS': 'Graba en vivo con GPS', 'Start from a public one': 'Empieza desde uno público',
            'Finish': 'Finalizar', 'Export .rdbk': 'Exportar .rdbk', 'Save': 'Guardar', 'Saved': 'Guardado',
            'Private': 'Privado', 'Public': 'Público', 'Adjust on the trail (live GPS)': 'Ajustar en la ruta (GPS en vivo)',
            'Title': 'Título', 'Description': 'Descripción', 'Shown on the public challenge page': 'Se muestra en la página pública del challenge',
            'Photos': 'Fotos', 'Add photos': 'Añadir fotos', 'Notes': 'Notas', 'Map & notes': 'Mapa y notas',
            'Delete': 'Borrar', 'Vignette': 'Viñeta', 'Map': 'Mapa', 'Note vignette': 'Viñeta de la nota',
            'Icons': 'Iconos', 'Upload icon': 'Subir icono',
            'Tap an icon to add it; drag it on the vignette to place it. Uploads are saved <b>inside this roadbook</b>.': 'Toca un icono para añadirlo; arrástralo en la viñeta para colocarlo. Las subidas se guardan <b>dentro de este roadbook</b>.',
            'Drag the highlighted note to reposition it — its order is recomputed automatically. Tap another note to edit it.': 'Arrastra la nota resaltada para reposicionarla — su orden se recalcula solo. Toca otra nota para editarla.',
            'Advanced: splice another GPX track': 'Avanzado: empalmar otro track GPX', 'Operation': 'Operación',
            'Detour (replace a segment)': 'Desvío (reemplazar un tramo)', 'Extension (lengthen the end)': 'Prolongación (alargar el final)',
            'Segment to replace': 'Tramo a reemplazar', 'Load GPX': 'Cargar GPX', 'Apply': 'Aplicar',
            'Reader': 'Reader', 'Load a roadbook and navigate with GPS, or use <b>Tripmaster mode</b> with no roadbook.': 'Carga un roadbook y navega con GPS, o usa el <b>modo Tripmaster</b> sin roadbook.',
            'Load .rdbk file': 'Cargar archivo .rdbk', 'Challenges': 'Challenges', 'Tripmaster mode': 'Modo Tripmaster',
            'Validate': 'Validar', 'Note done': 'Nota hecha', 'How will you use it?': '¿Cómo lo usarás?',
            'Trip mode': 'Modo Viaje', 'Follow the roadbook freely. No scoring.': 'Sigue el roadbook libremente. Sin puntuación.',
            'Competition mode': 'Modo Competición', 'Validate every note and get your result QR.': 'Valida cada nota y obtén tu QR de resultado.',
            'Vehicle number': 'Número de vehículo', 'Identify your team for the ranking.': 'Identifica tu equipo para la clasificación.',
            'Cancel': 'Cancelar', 'Start': 'Empezar', 'Result': 'Resultado', 'Close': 'Cerrar', 'Share': 'Compartir', 'Save QR': 'Guardar QR',
            'Trip': 'Viaje', 'Reset trip': 'Reiniciar viaje', 'Total km': 'Km totales', 'Clock': 'Reloj', 'Timer': 'Cronómetro', '+Note': '+Nota', 'Exit': 'Salir',
            'Overall ranking': 'Clasificación general', 'Clear': 'Limpiar', 'No results yet. Scan or paste a QR.': 'Aún no hay resultados. Escanea o pega un QR.',
            'Vehicle': 'Vehículo', 'Accuracy': 'Precisión', 'Speed': 'Velocidad', 'Regularity': 'Regularidad', 'Final': 'Final',
            'Your roadbooks': 'Tus roadbooks', 'Sign in': 'Entrar', 'Email or username': 'Email o usuario', 'Password': 'Contraseña',
            'Create account': 'Crear cuenta', 'Forgot password?': '¿Olvidaste la contraseña?', 'First name': 'Nombre', 'Last name': 'Apellido',
            'Username': 'Usuario', 'Email': 'Email', 'Already have an account? Sign in': '¿Ya tienes cuenta? Entra',
            'Reset password': 'Restablecer contraseña', 'Your email': 'Tu email', 'Send reset link': 'Enviar enlace', 'Back to sign in': 'Volver a entrar',
            'Set a new password': 'Pon una nueva contraseña', 'Update password': 'Actualizar contraseña',
            'Edit profile': 'Editar perfil', 'Sign out': 'Cerrar sesión', 'New roadbook': 'Nuevo roadbook', 'My roadbooks': 'Mis roadbooks',
            'Change photo': 'Cambiar foto', 'Save profile': 'Guardar perfil', 'Loading…': 'Cargando…', 'Navigate': 'Navegar', 'Fork': 'Fork', 'Edit': 'Editar',
            // toasts
            'Load a roadbook first.': 'Carga primero un roadbook.', 'Nothing to save.': 'Nada que guardar.',
            'Route too short to save.': 'Ruta demasiado corta para guardar.', 'Route recorded · edit and save.': 'Ruta grabada · edita y guarda.',
            'Waiting for a GPS fix…': 'Esperando señal GPS…', 'No geolocation on this device.': 'Este dispositivo no tiene geolocalización.',
            'Photo added': 'Foto añadida', 'Photo failed.': 'Error con la foto.', 'Waypoint dropped': 'Waypoint añadido', 'Uploading photo…': 'Subiendo foto…',
            'Saved to your profile.': 'Guardado en tu perfil.', 'Could not save.': 'No se pudo guardar.',
            'On the trail — recording your variant.': 'En la ruta — grabando tu variante.', 'Trail adjusted · metrics recomputed.': 'Ruta ajustada · métricas recalculadas.',
            'Walk onto the trail (≤10 m) to start adjusting.': 'Camina hasta la ruta (≤10 m) para empezar a ajustar.',
            'Sign in to attach photos.': 'Inicia sesión para añadir fotos.', 'Sign in to save this roadbook to your profile.': 'Inicia sesión para guardar este roadbook en tu perfil.',
            'There is already a note here.': 'Ya hay una nota aquí.', 'Waypoint added.': 'Waypoint añadido.', 'At least 2 notes must remain.': 'Deben quedar al menos 2 notas.',
            'Create a waypoint at this photo?': '¿Crear un waypoint en esta foto?', 'Create': 'Crear', 'Delete this roadbook?': '¿Borrar este roadbook?',
            'Clear all results?': '¿Borrar todos los resultados?', 'Icon added — drag it on the vignette': 'Icono añadido — arrástralo en la viñeta',
            'Roadbook has no notes.': 'El roadbook no tiene notas.', 'Spliced · metrics recomputed.': 'Empalmado · métricas recalculadas.',
            'Sign in': 'Entrar', 'Not now': 'Ahora no', 'Sign in / Create account': 'Entrar / Crear cuenta',
            'Create a free account to save and share your roadbooks.': 'Crea una cuenta gratis para guardar y compartir tus roadbooks.',
            'Roadbook title': 'Título del roadbook', 'Password (min 8 chars)': 'Contraseña (mín. 8)', 'New password (min 8 chars)': 'Nueva contraseña (mín. 8)',
            'Short bio…': 'Bio corta…', 'Quick note (optional)…': 'Nota rápida (opcional)…', 'Convert into waypoint': 'Convertir en waypoint',
            'Edit later': 'Editar luego', 'Save note': 'Guardar nota', 'Sign in to save': 'Inicia sesión para guardar',
            'Follow the roadbook freely. No scoring.': 'Sigue el roadbook libremente. Sin puntuación.',
            'Validate every note and get your result QR.': 'Valida cada nota y obtén tu QR de resultado.',
            'Identify your team for the ranking.': 'Identifica tu equipo para la clasificación.',
            'Sign in to <b>create, edit and store</b> your roadbooks, share them as <b>public challenges</b>, fork others’ and build your profile — free.': 'Entra para <b>crear, editar y guardar</b> tus roadbooks, compartirlos como <b>challenges públicos</b>, forkear los de otros y crear tu perfil — gratis.',
            'We’ll email you a link to set a new password.': 'Te enviaremos un email con un enlace para poner una nueva contraseña.',
            'Discard this recording? It cannot be undone.': '¿Descartar esta grabación? No se puede deshacer.', 'Discard': 'Descartar', 'Recording discarded.': 'Grabación descartada.',
            'No roadbooks yet. Create one in the Editor.': 'Aún no tienes roadbooks. Crea uno en el Editor.', 'Photo updated.': 'Foto actualizada.', 'Profile saved.': 'Perfil guardado.', 'Upload failed.': 'Error al subir.', 'Network error.': 'Error de red.',
            'Challenge not found.': 'Challenge no encontrado.', 'This challenge does not exist or is private.': 'Este challenge no existe o es privado.',
            'Public challenges': 'Challenges públicos', 'No public challenges yet.': 'Aún no hay challenges públicos.', 'notes': 'notas',
            'Total': 'Total', 'Partial': 'Parcial', 'Reset (hold)': 'Reiniciar (mantén)', 'km/h · alert': 'km/h · alerta', 'Max km/h': 'Máx km/h', 'Waypoints': 'Waypoints',
            'Record GPX': 'Grabar GPX', 'Recording…': 'Grabando…', 'Speed alert': 'Alerta de velocidad', 'Speed to watch (km/h · 0 = off)': 'Velocidad a vigilar (km/h · 0 = off)', 'Colours': 'Colores',
            'green': 'verde', 'orange': 'naranja', 'red': 'rojo', 'Recorded track': 'Traza grabada', 'points': 'puntos', 'Download GPX': 'Descargar GPX', 'Convert into roadbook': 'Convertir en roadbook',
            'Exit Tripmaster?': '¿Salir del Tripmaster?', 'Trip reset.': 'Viaje reiniciado.', 'Recording GPX track.': 'Grabando traza GPX.', 'Could not load the recorded trip.': 'No se pudo cargar el trip grabado.',
        },
        it: {
            'hero.title': 'Roadbook digitali per le <span class="accent">tue avventure</span>',
            'hero.lead': 'Crea un roadbook da un GPX, seguilo col GPS e condividilo. 4x4, moto, bici, corsa… ogni avventura.',
            'hero.cta_tools': 'Vedi gli strumenti', 'hero.cta_challenges': 'Challenges',
            'flow.kicker': 'Funzioni', 'flow.title': 'Tutto ciò che serve',
            'feat.1.t': 'Editor', 'feat.1.d': 'Crea un roadbook da un GPX e modifica note, tipo di fondo e CAP su mappa satellitare.',
            'feat.2.t': 'Registra percorso', 'feat.2.d': 'Registra dal vivo col GPS, aggiungendo waypoint strada facendo — senza GPX.',
            'feat.3.t': 'Vignette', 'feat.3.d': 'Disegna ogni nota: vettori dei bivi, icone ridimensionabili e le tue.',
            'feat.4.t': 'Reader', 'feat.4.d': 'Naviga con odometro, rotta, mappa dal vivo e la barra di direzione CAP.',
            'feat.5.t': 'Tripmaster', 'feat.5.d': 'Un odometro GPS preciso senza roadbook — distanza parziale e totale.',
            'feat.6.t': 'Convalida e QR', 'feat.6.d': 'Convalida le note (manuale o automatica) ed emetti un QR firmato.',
            'feat.7.t': 'Classifica', 'feat.7.d': 'Scansiona i QR e genera classifiche di precisione, CAP, velocità e regolarità.',
            'feat.8.t': 'Account e condivisione', 'feat.8.d': 'Accedi per salvare i roadbook e pubblicarli come challenge pubblici.',
            'gallery.kicker': 'Galleria', 'gallery.title': 'Challenge pubblici', 'gallery.loading': 'Caricamento…', 'gallery.empty': 'Ancora nessuna traccia.', 'gallery.notes': 'note',
            // ---- tools (the English string is the key) ----
            'Load from': 'Carica da', 'Import a GPS track → roadbook': 'Importa una traccia GPS → roadbook',
            'Open an existing roadbook': 'Apri un roadbook esistente', 'Record route': 'Registra percorso',
            'Record live with GPS': 'Registra dal vivo col GPS', 'Start from a public one': 'Parti da uno pubblico',
            'Finish': 'Termina', 'Export .rdbk': 'Esporta .rdbk', 'Save': 'Salva', 'Saved': 'Salvato',
            'Private': 'Privato', 'Public': 'Pubblico', 'Adjust on the trail (live GPS)': 'Regola sul percorso (GPS dal vivo)',
            'Title': 'Titolo', 'Description': 'Descrizione', 'Shown on the public challenge page': 'Mostrato nella pagina pubblica del challenge',
            'Photos': 'Foto', 'Add photos': 'Aggiungi foto', 'Notes': 'Note', 'Map & notes': 'Mappa e note',
            'Delete': 'Elimina', 'Vignette': 'Vignetta', 'Map': 'Mappa', 'Note vignette': 'Vignetta della nota',
            'Icons': 'Icone', 'Upload icon': 'Carica icona',
            'Tap an icon to add it; drag it on the vignette to place it. Uploads are saved <b>inside this roadbook</b>.': 'Tocca un’icona per aggiungerla; trascinala sulla vignetta per posizionarla. I caricamenti si salvano <b>dentro questo roadbook</b>.',
            'Drag the highlighted note to reposition it — its order is recomputed automatically. Tap another note to edit it.': 'Trascina la nota evidenziata per riposizionarla — l’ordine si ricalcola da solo. Tocca un’altra nota per modificarla.',
            'Advanced: splice another GPX track': 'Avanzato: innesta un’altra traccia GPX', 'Operation': 'Operazione',
            'Detour (replace a segment)': 'Deviazione (sostituisci un tratto)', 'Extension (lengthen the end)': 'Prolunga (allunga la fine)',
            'Segment to replace': 'Tratto da sostituire', 'Load GPX': 'Carica GPX', 'Apply': 'Applica',
            'Reader': 'Reader', 'Load a roadbook and navigate with GPS, or use <b>Tripmaster mode</b> with no roadbook.': 'Carica un roadbook e naviga col GPS, o usa la <b>modalità Tripmaster</b> senza roadbook.',
            'Load .rdbk file': 'Carica file .rdbk', 'Challenges': 'Challenge', 'Tripmaster mode': 'Modalità Tripmaster',
            'Validate': 'Convalida', 'Note done': 'Nota fatta', 'How will you use it?': 'Come lo userai?',
            'Trip mode': 'Modalità Viaggio', 'Follow the roadbook freely. No scoring.': 'Segui il roadbook liberamente. Senza punteggio.',
            'Competition mode': 'Modalità Gara', 'Validate every note and get your result QR.': 'Convalida ogni nota e ottieni il QR del risultato.',
            'Vehicle number': 'Numero veicolo', 'Identify your team for the ranking.': 'Identifica la tua squadra per la classifica.',
            'Cancel': 'Annulla', 'Start': 'Inizia', 'Result': 'Risultato', 'Close': 'Chiudi', 'Share': 'Condividi', 'Save QR': 'Salva QR',
            'Trip': 'Viaggio', 'Reset trip': 'Azzera viaggio', 'Total km': 'Km totali', 'Clock': 'Orologio', 'Timer': 'Cronometro', '+Note': '+Nota', 'Exit': 'Esci',
            'Overall ranking': 'Classifica generale', 'Clear': 'Svuota', 'No results yet. Scan or paste a QR.': 'Ancora nessun risultato. Scansiona o incolla un QR.',
            'Vehicle': 'Veicolo', 'Accuracy': 'Precisione', 'Speed': 'Velocità', 'Regularity': 'Regolarità', 'Final': 'Finale',
            'Your roadbooks': 'I tuoi roadbook', 'Sign in': 'Accedi', 'Email or username': 'Email o username', 'Password': 'Password',
            'Create account': 'Crea account', 'Forgot password?': 'Password dimenticata?', 'First name': 'Nome', 'Last name': 'Cognome',
            'Username': 'Username', 'Email': 'Email', 'Already have an account? Sign in': 'Hai già un account? Accedi',
            'Reset password': 'Reimposta password', 'Your email': 'La tua email', 'Send reset link': 'Invia link', 'Back to sign in': 'Torna ad accedere',
            'Set a new password': 'Imposta una nuova password', 'Update password': 'Aggiorna password',
            'Edit profile': 'Modifica profilo', 'Sign out': 'Esci', 'New roadbook': 'Nuovo roadbook', 'My roadbooks': 'I miei roadbook',
            'Change photo': 'Cambia foto', 'Save profile': 'Salva profilo', 'Loading…': 'Caricamento…', 'Navigate': 'Naviga', 'Fork': 'Fork', 'Edit': 'Modifica',
            // toasts
            'Load a roadbook first.': 'Carica prima un roadbook.', 'Nothing to save.': 'Niente da salvare.',
            'Route too short to save.': 'Percorso troppo corto per salvare.', 'Route recorded · edit and save.': 'Percorso registrato · modifica e salva.',
            'Waiting for a GPS fix…': 'In attesa del segnale GPS…', 'No geolocation on this device.': 'Questo dispositivo non ha geolocalizzazione.',
            'Photo added': 'Foto aggiunta', 'Photo failed.': 'Errore con la foto.', 'Waypoint dropped': 'Waypoint aggiunto', 'Uploading photo…': 'Caricamento foto…',
            'Saved to your profile.': 'Salvato nel tuo profilo.', 'Could not save.': 'Impossibile salvare.',
            'On the trail — recording your variant.': 'Sul percorso — registrando la tua variante.', 'Trail adjusted · metrics recomputed.': 'Percorso regolato · metriche ricalcolate.',
            'Walk onto the trail (≤10 m) to start adjusting.': 'Cammina sul percorso (≤10 m) per iniziare a regolare.',
            'Sign in to attach photos.': 'Accedi per allegare foto.', 'Sign in to save this roadbook to your profile.': 'Accedi per salvare questo roadbook nel tuo profilo.',
            'There is already a note here.': 'C’è già una nota qui.', 'Waypoint added.': 'Waypoint aggiunto.', 'At least 2 notes must remain.': 'Devono restare almeno 2 note.',
            'Create a waypoint at this photo?': 'Creare un waypoint su questa foto?', 'Create': 'Crea', 'Delete this roadbook?': 'Eliminare questo roadbook?',
            'Clear all results?': 'Cancellare tutti i risultati?', 'Icon added — drag it on the vignette': 'Icona aggiunta — trascinala sulla vignetta',
            'Roadbook has no notes.': 'Il roadbook non ha note.', 'Spliced · metrics recomputed.': 'Innestato · metriche ricalcolate.',
            'Sign in': 'Accedi', 'Not now': 'Non ora', 'Sign in / Create account': 'Accedi / Crea account',
            'Create a free account to save and share your roadbooks.': 'Crea un account gratuito per salvare e condividere i tuoi roadbook.',
            'Roadbook title': 'Titolo del roadbook', 'Password (min 8 chars)': 'Password (min 8)', 'New password (min 8 chars)': 'Nuova password (min 8)',
            'Short bio…': 'Bio breve…', 'Quick note (optional)…': 'Nota rapida (opzionale)…', 'Convert into waypoint': 'Converti in waypoint',
            'Edit later': 'Modifica dopo', 'Save note': 'Salva nota', 'Sign in to save': 'Accedi per salvare',
            'Follow the roadbook freely. No scoring.': 'Segui il roadbook liberamente. Senza punteggio.',
            'Validate every note and get your result QR.': 'Convalida ogni nota e ottieni il QR del risultato.',
            'Identify your team for the ranking.': 'Identifica la tua squadra per la classifica.',
            'Sign in to <b>create, edit and store</b> your roadbooks, share them as <b>public challenges</b>, fork others’ and build your profile — free.': 'Accedi per <b>creare, modificare e salvare</b> i tuoi roadbook, condividerli come <b>challenge pubblici</b>, forkare quelli altrui e creare il tuo profilo — gratis.',
            'We’ll email you a link to set a new password.': 'Ti invieremo via email un link per impostare una nuova password.',
            'Discard this recording? It cannot be undone.': 'Scartare questa registrazione? Non è reversibile.', 'Discard': 'Scarta', 'Recording discarded.': 'Registrazione scartata.',
            'No roadbooks yet. Create one in the Editor.': 'Ancora nessun roadbook. Creane uno nell’Editor.', 'Photo updated.': 'Foto aggiornata.', 'Profile saved.': 'Profilo salvato.', 'Upload failed.': 'Caricamento fallito.', 'Network error.': 'Errore di rete.',
            'Challenge not found.': 'Challenge non trovato.', 'This challenge does not exist or is private.': 'Questo challenge non esiste o è privato.',
            'Public challenges': 'Challenge pubblici', 'No public challenges yet.': 'Ancora nessun challenge pubblico.', 'notes': 'note',
            'Total': 'Totale', 'Partial': 'Parziale', 'Reset (hold)': 'Azzera (tieni)', 'km/h · alert': 'km/h · allerta', 'Max km/h': 'Max km/h', 'Waypoints': 'Waypoint',
            'Record GPX': 'Registra GPX', 'Recording…': 'Registrazione…', 'Speed alert': 'Allerta velocità', 'Speed to watch (km/h · 0 = off)': 'Velocità da controllare (km/h · 0 = off)', 'Colours': 'Colori',
            'green': 'verde', 'orange': 'arancione', 'red': 'rosso', 'Recorded track': 'Traccia registrata', 'points': 'punti', 'Download GPX': 'Scarica GPX', 'Convert into roadbook': 'Converti in roadbook',
            'Exit Tripmaster?': 'Uscire dal Tripmaster?', 'Trip reset.': 'Viaggio azzerato.', 'Recording GPX track.': 'Registrazione traccia GPX.', 'Could not load the recorded trip.': 'Impossibile caricare il trip registrato.',
        },
    };

    function pickLang() {
        const saved = localStorage.getItem('rb_lang');
        if (saved && T[saved]) return saved;
        for (const l of (navigator.languages || [navigator.language || 'en'])) {
            const code = String(l).slice(0, 2).toLowerCase();
            if (T[code]) return code;
        }
        return 'en';
    }

    const tr = (lang, k) => { const d = T[lang] || T.en; return d[k] != null ? d[k] : (T.en[k] != null ? T.en[k] : null); };

    function apply(lang) {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const v = tr(lang, el.getAttribute('data-i18n')); if (v == null) return;
            // replace just the text, keeping any leading icon (<i>) intact
            const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
            if (tn) tn.textContent = (el.firstElementChild ? ' ' : '') + v; else el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-html]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-html')); if (v != null) el.innerHTML = v; });
        document.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-ph')); if (v != null) el.setAttribute('placeholder', v); });
        document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
        localStorage.setItem('rb_lang', lang);
        window.dispatchEvent(new CustomEvent('rb-lang', { detail: lang }));
    }

    window.RBi18n = {
        init() {
            apply(pickLang());
            document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => apply(b.dataset.lang)));
        },
        apply,
        lang: pickLang,
        t(key) { const v = tr(pickLang(), key); return v != null ? v : key; },
    };

    document.addEventListener('DOMContentLoaded', () => window.RBi18n.init());
})();
