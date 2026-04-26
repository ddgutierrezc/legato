# Legato — Descripción conceptual completa

> Versión del documento: 1.0  
> Estado del proyecto: En desarrollo activo  
> Binding principal: Capacitor  
> Distribución: Open source (`@ddgutierrezc/`)

---

## Índice

1. [¿Qué es Legato?](#1-qué-es-legato)
2. [Decisiones de diseño fundamentales](#2-decisiones-de-diseño-fundamentales)
3. [Arquitectura general](#3-arquitectura-general)
4. [Capa 0 — legato-contract](#4-capa-0--legato-contract)
5. [Capa 1 — legato-capacitor](#5-capa-1--legato-capacitor)
6. [Capa 2 — Bridge de Capacitor con Android](#6-capa-2--bridge-de-capacitor-con-android)
7. [Capa 3 — Native Android Core](#7-capa-3--native-android-core)
8. [Capa 3 — Native iOS Core](#8-capa-3--native-ios-core)
9. [Demo harness y validación operativa](#9-demo-harness-y-validación-operativa)
10. [Release y validation tooling](#10-release-y-validation-tooling)
11. [Estrategia de testing](#11-estrategia-de-testing)
12. [Estado actual y gaps](#12-estado-actual-y-gaps)
13. [Roadmap de completitud](#13-roadmap-de-completitud)
14. [Visión de largo plazo](#14-visión-de-largo-plazo)
15. [Estado actual vs dirección multi-binding (foundation v1)](#15-estado-actual-vs-dirección-multi-binding-foundation-v1)

---

## 1. ¿Qué es Legato?

Legato es un **plugin de audio de nivel producción para Capacitor**, diseñado como open source y orientado a casos de uso equivalentes a Spotify o YouTube Music. No es un reproductor básico — es una plataforma de playback/integración que expone una API TypeScript limpia sobre engines nativos reales (ExoPlayer en Android, AVQueuePlayer en iOS).

El nombre refleja su filosofía: *legato* en música significa notas conectadas sin silencio entre ellas, lo cual describe exactamente el objetivo técnico — reproducción continua, sin cortes, con transiciones fluidas entre tracks.

### Qué hace Legato

- Reproduce audio desde URLs remotas o locales con soporte de streaming progresivo
- Gestiona colas de reproducción con shuffle, repeat y crossfade
- Muestra metadatos en lockscreen, notificaciones y sistema operativo
- Responde a controles externos: lockscreen, AirPods, CarPlay, Android Auto
- Maneja correctamente el foco de audio frente a llamadas entrantes y otras apps
- Sobrevive al background en Android e iOS sin que el sistema operativo mate el proceso
- Cachea audio progresivamente para reducir rebuffering en conexiones lentas

### Lo que Legato NO es (hoy)

- No es un SDK multi-framework terminado (Flutter y React Native son potencial arquitectónico, no realidad implementada)
- No es un player engine fully production-complete en la capa nativa (los cores son seams avanzados, no motores cerrados)
- No es un producto comercial — es open source, publicado bajo `@ddgutierrezc/`

---

## 2. Decisiones de diseño fundamentales

Estas decisiones tomadas al inicio del proyecto determinan toda la arquitectura. Entenderlas evita cuestionarlas en el futuro sin contexto.

### Contract-first

El dominio de playback está definido en un paquete separado (`legato-contract`) que no tiene ninguna dependencia de runtime, plugin ni plataforma. Esto garantiza que los tipos, eventos y modelos son la fuente de verdad compartida entre TypeScript, el bridge de Capacitor y los engines nativos. Cualquier cambio en el dominio se propaga de forma controlada.

### Monorepo como source of truth

Todo el código vive en un solo repositorio (`legato` repo). Los paquetes se separan para distribución, no para dispersar la arquitectura. Esto permite releases coordinados, PRs atómicos y CI unificado sin el problema de compatibilidad entre versiones de repos distintos.

### Wrappear libs nativas maduras, no reinventarlas

Android usa ExoPlayer 3 (mantenido por Google, usado por YouTube). iOS usa AVQueuePlayer (framework oficial de Apple). Esta decisión no es un compromiso de performance — es la decisión correcta. El cuello de botella de un reproductor nunca es el player en sí: es el buffer, el cache y la gestión de la queue. Esas partes sí son implementación propia.

### Plugin delega, engine ejecuta

El plugin de Capacitor (`LegatoPlugin.kt`, `LegatoPlugin.swift`) no tiene lógica de negocio. Su único rol es traducir `PluginCall` → llamada al engine → `resolve/reject`. Toda la lógica de playback vive en `LegatoAndroidCore` y `LegatoCore` (iOS). Esto hace que el engine sea testeable de forma aislada, sin necesitar el runtime de Capacitor.

### Inyección de dependencias en el engine

Los engines nativos no instancian ExoPlayer ni AVPlayer directamente — los reciben a través de una interfaz (`AudioEngineProtocol` en Swift, `AudioPlayerEngine` en Kotlin). Esto permite mockear el player en tests unitarios y lograr ~80% de cobertura sin dispositivo físico ni emulador.

### Separación de caminos de comunicación

Capacitor tiene dos caminos de comunicación distintos y Legato los usa para cosas distintas:

- **JS → nativo** (request/response): comandos del usuario como `play()`, `pause()`, `load()`, `seekTo()`. Resuelven como Promises.
- **Nativo → JS** (eventos push): cambios de estado que el nativo inicia, como `stateChanged`, `positionChanged`, `error`, `audioFocusLost`. Llegan via `notifyListeners()` / `addListener()`.

---

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│         Consumer app (Ionic / Angular / React / Vue)        │
│         Solo conoce la API TypeScript — nada nativo         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│              @ddgutierrezc/legato-capacitor                  │
│   audioPlayer · mediaSession · Legato facade (compat)       │
│              peerDep → legato-contract                       │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│   @ddgutierrezc/          │   │  apps/capacitor-demo        │
│   legato-contract         │   │  Demo + validation harness  │
│   Tipos · eventos ·       │   │  Smoke flows · evidencia    │
│   invariants · modelos    │   │  Valida packaging y bridges │
└──────────────────────────┘   └─────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  Capacitor bridge                            │
│         MessageHandler interno — rutea PluginCalls          │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
┌──────────▼──────────┐      ┌────────────▼────────────────┐
│  Android plugin     │      │  iOS plugin                 │
│  LegatoPlugin.kt    │      │  LegatoPlugin.swift         │
│  @CapacitorPlugin   │      │  CAPPlugin                  │
└──────────┬──────────┘      └────────────┬────────────────┘
           │                              │
┌──────────▼──────────┐      ┌────────────▼────────────────┐
│  native/android/    │      │  native/ios/LegatoCore      │
│  core               │      │                             │
│  LegatoAndroidCore  │      │  LegatoCore                 │
│  ExoPlayer 3        │      │  AVQueuePlayer              │
│  MediaSession compat│      │  AVAudioSession             │
│  ForegroundService  │      │  MPNowPlayingInfoCenter     │
│  AudioFocusManager  │      │  MPRemoteCommandCenter      │
│  CacheDataSource    │      │  Interruption handling      │
│  QueueManager       │      │  QueueManager               │
└─────────────────────┘      └─────────────────────────────┘
```

### Flujo completo de un comando

```
audioPlayer.play()
  → Capacitor serializa a JSON
  → MessageHandler rutea a LegatoPlugin
  → @PluginMethod fun play(call) { engine.play(); call.resolve() }
  → LegatoAndroidCore.play()
  → AudioFocusManager.request()
  → ExoPlayer.play()
  → ExoPlayer.Listener.onPlaybackStateChanged()
  → emitter.emit("stateChanged", { state: "playing" })
  → notifyListeners("stateChanged", data)
  → addListener callback en JS
```

---

## 4. Capa 0 — legato-contract

**Paquete:** `@ddgutierrezc/legato-contract`  
**Naturaleza:** Puro TypeScript, cero dependencias de runtime  
**Rol:** Fuente de verdad del dominio de playback

### Qué contiene

#### Modelos de dominio

```typescript
// Track — unidad atómica de reproducción
interface Track {
  id: string
  url: string
  title: string
  artist: string
  album?: string
  artworkUrl?: string
  durationMs: number
  headers?: Record<string, string>  // para streams autenticados
}

// PlayerState — estado observable del player
interface PlayerState {
  status: 'idle' | 'loading' | 'buffering' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'
  currentTrack: Track | null
  positionMs: number
  durationMs: number
  bufferedMs: number
  volume: number
  playbackRate: number
}

// Queue — lista de reproducción con contexto
interface PlaybackQueue {
  tracks: Track[]
  currentIndex: number
  repeatMode: 'none' | 'one' | 'all'
  shuffled: boolean
  originalOrder: Track[]  // para des-shufflear
}

// Snapshot — estado serializable completo (para restore)
interface PlaybackSnapshot {
  queue: PlaybackQueue
  state: PlayerState
  timestamp: number
}
```

#### Sistema de eventos

```typescript
type LegatoEvent =
  | { type: 'stateChanged';       state: PlayerState }
  | { type: 'positionChanged';    positionMs: number; durationMs: number }
  | { type: 'trackChanged';       track: Track | null }
  | { type: 'queueChanged';       queue: PlaybackQueue }
  | { type: 'bufferingChanged';   isBuffering: boolean; bufferedMs: number }
  | { type: 'volumeChanged';      volume: number }
  | { type: 'error';              error: LegatoError }
  | { type: 'audioFocusLost';     transient: boolean }
  | { type: 'audioFocusGained' }
  | { type: 'interruptionBegan' }                        // iOS
  | { type: 'interruptionEnded';  shouldResume: boolean } // iOS
```

#### Errores tipados

```typescript
type LegatoError =
  | { code: 'SOURCE_NOT_FOUND';    message: string; url: string }
  | { code: 'NETWORK_ERROR';       message: string; retryable: boolean }
  | { code: 'DECODE_ERROR';        message: string }
  | { code: 'FOCUS_DENIED';        message: string }
  | { code: 'BACKGROUND_KILLED';   message: string }
  | { code: 'SOURCE_UNAVAILABLE';  message: string }
  | { code: 'UNKNOWN';             message: string; raw?: unknown }
```

#### Invariants de dominio

Reglas de negocio que se mantienen en toda la codebase:

- `positionMs` siempre está entre `0` y `durationMs`
- `currentIndex` siempre apunta a un track válido dentro de `tracks`, o es `-1` si la cola está vacía
- `PlayerState.status === 'error'` implica que `LegatoError` está disponible
- Un track no puede estar `playing` si `audioFocusLost` fue emitido sin un `audioFocusGained` posterior

### Lo que el contract NO contiene

- Ninguna importación de `@capacitor/core`
- Ningún código nativo ni bridge
- Ninguna lógica de runtime (reproducción, buffering, red)
- Ninguna referencia a plataformas específicas

---

## 5. Capa 1 — legato-capacitor

**Paquete:** `@ddgutierrezc/legato-capacitor`  
**Naturaleza:** TypeScript + código nativo Android/iOS  
**Rol:** Binding público real que consume el usuario final

### Lo que expone

#### audioPlayer

API principal de control de reproducción:

```typescript
interface AudioPlayerPlugin {
  // Carga y control
  load(options: { url: string; startPositionMs?: number }): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  seekTo(options: { positionMs: number }): Promise<void>

  // Queue
  setQueue(options: { tracks: Track[]; startIndex?: number }): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  addToQueue(options: { track: Track; position?: number }): Promise<void>
  removeFromQueue(options: { index: number }): Promise<void>

  // Estado
  getState(): Promise<PlayerState>
  getQueue(): Promise<PlaybackQueue>

  // Configuración
  setVolume(options: { volume: number }): Promise<void>
  setPlaybackRate(options: { rate: number }): Promise<void>
  setRepeatMode(options: { mode: 'none' | 'one' | 'all' }): Promise<void>
  setShuffle(options: { enabled: boolean }): Promise<void>

  // Listeners
  addListener(event: string, handler: Function): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}
```

#### mediaSession

API para control de metadatos en el sistema operativo:

```typescript
interface MediaSessionPlugin {
  setMetadata(options: {
    title: string
    artist: string
    album?: string
    artworkUrl?: string
    durationMs?: number
  }): Promise<void>

  setPlaybackState(options: {
    state: 'playing' | 'paused' | 'stopped'
    positionMs?: number
    playbackRate?: number
  }): Promise<void>

  setEnabledActions(options: {
    actions: Array<'play' | 'pause' | 'next' | 'previous' | 'seek' | 'stop'>
  }): Promise<void>
}
```

#### Legato facade

Facade de compatibilidad que unifica `audioPlayer` y `mediaSession` bajo una sola interfaz:

```typescript
class Legato {
  static async play(track: Track): Promise<void>
  static async pause(): Promise<void>
  // ... wrapper sobre audioPlayer + mediaSession combinados
}
```

> **Nota arquitectónica:** La facade existe para simplificar el caso de uso más común. Internamente delega 100% a `audioPlayer` y `mediaSession`. Está marcada para evaluación de deprecación en v2 si la API limpia gana suficiente adopción.

### Dependencias del paquete

```json
{
  "peerDependencies": {
    "@capacitor/core": ">=5.0.0",
    "@ddgutierrezc/legato-contract": "*"
  }
}
```

---

## 6. Capa 2 — Bridge de Capacitor con Android

El bridge es el mecanismo que conecta TypeScript con código Kotlin. Es gestionado completamente por Capacitor — Legato no escribe código de bridge propio.

### Cómo funciona

JavaScript en el WebView nunca toca código nativo directamente. Todo pasa por un canal de mensajes serializado a JSON que Capacitor gestiona internamente a través de su `MessageHandler`.

**Camino 1 — JS llama a nativo (request/response):**

```
audioPlayer.play()
  → Capacitor.Plugins.LegatoPlugin.call('play', {})
  → JSON serializado al MessageHandler
  → LegatoPlugin.kt @PluginMethod fun play(call: PluginCall)
  → call.resolve() ó call.reject("código", excepción)
  → Promise resuelta en TypeScript
```

**Camino 2 — Nativo avisa a JS (eventos push):**

```
ExoPlayer.Listener.onPlaybackStateChanged()
  → engine llama a emitter.emit("stateChanged", data)
  → plugin.notifyListeners("stateChanged", JSObject)
  → todos los addListener('stateChanged') en JS reciben el evento
```

### Estructura del plugin Kotlin

```kotlin
@CapacitorPlugin(name = "LegatoPlugin")
class LegatoPlugin : Plugin() {

    private lateinit var engine: LegatoAndroidCore

    // load() se llama una sola vez al registrar el plugin
    override fun load() {
        engine = LegatoAndroidCore(
            context = context,
            emitter = this  // el plugin implementa LegatoEventEmitter
        )
    }

    @PluginMethod
    fun play(call: PluginCall) {
        try {
            engine.play()
            call.resolve()
        } catch (e: Exception) {
            call.reject("PLAY_FAILED", e)
        }
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val url = call.getString("url")
            ?: return call.reject("MISSING_URL", "url is required")
        val startMs = call.getLong("startPositionMs") ?: 0L
        engine.load(url, startMs)
        call.resolve()
    }
}
```

### Interfaz de emisión de eventos

El engine no conoce el plugin directamente — se comunica a través de una interfaz. Esto desacopla el engine del runtime de Capacitor y lo hace testeable:

```kotlin
interface LegatoEventEmitter {
    fun emit(event: String, data: JSObject)
}

// El plugin implementa la interfaz
class LegatoPlugin : Plugin(), LegatoEventEmitter {
    override fun emit(event: String, data: JSObject) {
        notifyListeners(event, data)
    }
}
```

---

## 7. Capa 3 — Native Android Core

**Módulo:** `native/android/core`  
**Clase principal:** `LegatoAndroidCore`  
**Estado actual:** Runtime seam / MVP — estructura y boundaries definidos, no engine completo

### Componentes del engine

#### LegatoAndroidCore (orquestador)

```kotlin
class LegatoAndroidCore(
    private val context: Context,
    private val emitter: LegatoEventEmitter,
    private val engine: AudioPlayerEngine = ExoPlayerEngine(context),
    private val focusManager: AudioFocusManager = AudioFocusManager(context),
    private val queueManager: QueueManager = QueueManager(),
    private val cacheManager: CacheManager = CacheManager(context)
) {
    fun load(url: String, startPositionMs: Long) { ... }
    fun play() { ... }
    fun pause() { ... }
    fun seekTo(positionMs: Long) { ... }
    fun next() { ... }
    fun previous() { ... }
    fun setQueue(tracks: List<Track>, startIndex: Int) { ... }
    fun release() { ... }
}
```

#### AudioPlayerEngine (interfaz + implementación real)

```kotlin
// Interfaz — lo que el engine expone al core
interface AudioPlayerEngine {
    fun load(url: String, startPositionMs: Long)
    fun play()
    fun pause()
    fun seekTo(positionMs: Long)
    fun release()
    val currentPositionMs: Long
    val durationMs: Long
    var listener: AudioEngineListener?
}

// Implementación real sobre ExoPlayer 3
class ExoPlayerEngine(context: Context) : AudioPlayerEngine {
    private val player = ExoPlayer.Builder(context).build()

    override fun play() { player.play() }
    override fun pause() { player.pause() }
    override fun seekTo(positionMs: Long) { player.seekTo(positionMs) }

    init {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                listener?.onStateChanged(state.toLegatoState())
            }
            override fun onPlayerError(error: PlaybackException) {
                listener?.onError(error.toLegatoError())
            }
        })
    }
}
```

#### AudioFocusManager

Gestiona el foco de audio frente a llamadas entrantes y otras apps:

```kotlin
class AudioFocusManager(private val context: Context) {
    private val audioManager = context.getSystemService(AudioManager::class.java)

    fun request(): Boolean {
        val result = audioManager.requestAudioFocus(
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS           -> onFocusLost(transient = false)
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> onFocusLost(transient = true)
                        AudioManager.AUDIOFOCUS_GAIN           -> onFocusGained()
                    }
                }.build()
        )
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    fun abandon() { audioManager.abandonAudioFocusRequest(...) }
}
```

#### ForegroundService (obligatorio en Android 8+)

Sin un `ForegroundService`, Android mata el proceso cuando la app va al background. El player debe vivir dentro del servicio, no en el plugin:

```kotlin
class LegatoPlaybackService : MediaLibraryService() {
    private lateinit var mediaSession: MediaSession
    private lateinit var player: ExoPlayer

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
        // La notificación se crea automáticamente con DefaultMediaNotificationProvider
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = mediaSession

    override fun onDestroy() {
        mediaSession.release()
        player.release()
        super.onDestroy()
    }
}
```

#### Cache progresivo

Reduce rebuffering en conexiones lentas usando el sistema de cache de ExoPlayer:

```kotlin
class CacheManager(context: Context) {
    private val cache = SimpleCache(
        File(context.cacheDir, "legato_audio"),
        LeastRecentlyUsedCacheEvictor(500 * 1024 * 1024), // 500 MB máximo
        StandaloneDatabaseProvider(context)
    )

    fun buildDataSourceFactory(): CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(DefaultHttpDataSource.Factory())
            .setCacheWriteDataSinkFactory(CacheDataSink.Factory().setCache(cache))
}
```

#### Queue con gapless playback

```kotlin
class QueueManager {
    private val concatenatingSource = ConcatenatingMediaSource()

    fun setTracks(tracks: List<Track>, player: ExoPlayer) {
        val mediaItems = tracks.map { track ->
            MediaItem.Builder()
                .setUri(track.url)
                .setMediaMetadata(track.toMediaMetadata())
                .build()
        }
        player.setMediaItems(mediaItems)
        player.prepare()
    }
}
```

### Manifest requerido en la app del consumidor

```xml
<service
    android:name="com.ddgutierrezc.legato.LegatoPlaybackService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="true">
    <intent-filter>
        <action android:name="androidx.media3.session.MediaLibraryService"/>
    </intent-filter>
</service>

<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
```

---

## 8. Capa 3 — Native iOS Core

**Módulo:** `native/ios/LegatoCore`  
**Clase principal:** `LegatoCore`  
**Estado actual:** Runtime seam / MVP — estructura y boundaries definidos, no engine completo

### Componentes del engine

#### LegatoCore (orquestador)

```swift
class LegatoCore {
    private let engine: AudioEngineProtocol
    private let emitter: LegatoEventEmitter
    private let sessionManager: AudioSessionManager
    private let nowPlayingManager: NowPlayingManager
    private let remoteCommandManager: RemoteCommandManager

    init(
        engine: AudioEngineProtocol = AVPlayerEngine(),
        emitter: LegatoEventEmitter,
        sessionManager: AudioSessionManager = AudioSessionManager()
    ) {
        self.engine = engine
        self.emitter = emitter
        self.sessionManager = sessionManager
        self.nowPlayingManager = NowPlayingManager()
        self.remoteCommandManager = RemoteCommandManager()
        setupRemoteCommands()
    }
}
```

#### AudioEngineProtocol (interfaz + implementación real)

```swift
protocol AudioEngineProtocol {
    func load(url: URL, startPosition: TimeInterval)
    func play()
    func pause()
    func seek(to position: TimeInterval)
    func release()
    var currentTime: TimeInterval { get }
    var duration: TimeInterval { get }
    var delegate: AudioEngineDelegate? { get set }
}

// Implementación real
class AVPlayerEngine: AudioEngineProtocol {
    private var player: AVQueuePlayer = AVQueuePlayer()
    var delegate: AudioEngineDelegate?

    func play()  { player.play() }
    func pause() { player.pause() }

    func seek(to position: TimeInterval) {
        let time = CMTime(seconds: position, preferredTimescale: 1000)
        player.seek(to: time)
    }
}
```

#### AudioSessionManager

Configura AVAudioSession correctamente. Sin esto, el audio se pausa al bloquear la pantalla:

```swift
class AudioSessionManager {
    func configure() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetooth])
        try session.setActive(true)

        // Manejar interrupciones (llamadas, Siri, alarmas)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: session
        )
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            onInterruptionBegan?()
        case .ended:
            let shouldResume = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .flatMap { AVAudioSession.InterruptionOptions(rawValue: $0) }
                .map { $0.contains(.shouldResume) } ?? false
            onInterruptionEnded?(shouldResume)
        }
    }
}
```

#### NowPlayingManager

Muestra metadatos en lockscreen, Control Center y CarPlay:

```swift
class NowPlayingManager {
    func update(track: Track, position: TimeInterval, isPlaying: Bool) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle:            track.title,
            MPMediaItemPropertyArtist:           track.artist,
            MPMediaItemPropertyAlbumTitle:       track.album ?? "",
            MPMediaItemPropertyPlaybackDuration: track.durationMs / 1000.0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]

        // Artwork asíncrono
        if let artworkUrl = track.artworkUrl {
            loadArtwork(from: artworkUrl) { image in
                info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(
                    boundsSize: image.size
                ) { _ in image }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
```

#### RemoteCommandManager

Conecta controles externos (lockscreen, AirPods, CarPlay, Apple Watch):

```swift
class RemoteCommandManager {
    func setup(core: LegatoCore) {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget  { [weak core] _ in core?.play();     return .success }
        center.pauseCommand.addTarget { [weak core] _ in core?.pause();    return .success }
        center.nextTrackCommand.addTarget    { [weak core] _ in core?.next();      return .success }
        center.previousTrackCommand.addTarget { [weak core] _ in core?.previous(); return .success }

        center.changePlaybackPositionCommand.addTarget { [weak core] event in
            if let e = event as? MPChangePlaybackPositionCommandEvent {
                core?.seek(to: e.positionTime)
            }
            return .success
        }
    }
}
```

### Info.plist requerido en la app del consumidor

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

---

## 9. Demo harness y validación operativa

**App:** `apps/capacitor-demo`  
**Rol:** No es un producto final — es una herramienta de validación operativa del proyecto

### Qué valida

- Smoke flows de playback básico (load, play, pause, seek)
- Validación de bridges (comandos llegan al nativo y regresan correctamente)
- Validación de packaging (el paquete npm publicado es consumible por una app limpia)
- Validación de sync nativo (los plugins Android e iOS responden correctamente)
- Captura de evidencia de comportamiento real

### Smoke tests críticos que debe cubrir

| Test | Descripción | Automatizable |
|------|-------------|---------------|
| Playback básico | load → play → pause → resume | Sí (Detox) |
| Background survival | App al background → audio continúa | Manual |
| Lockscreen controls | Play/pause desde notificación | Manual |
| Llamada entrante | Audio pausa → llamada termina → reanuda | Manual |
| Seek desde lockscreen | Barra de progreso en notificación funcional | Manual |
| Queue con gapless | Transición entre tracks sin silencio | Sí (Detox) |
| Error handling | URL inválida → evento `error` emitido | Sí (Detox) |

### Lo que la demo NO debe ser

- No debe tener lógica de producto real
- No debe validar casos edge que son más apropiados para unit tests del engine
- No debe ser el único mecanismo de validación (el unit testing del engine es más importante)

---

## 10. Release y validation tooling

Legato tiene una capa seria de infraestructura alrededor del proceso de publicación. Esto es un activo real del proyecto, no overhead.

### Componentes del tooling

**release-control:** Orquesta el proceso completo de release — bump de versión, changelog, publicación a npm, tags de git.

**npm readiness:** Verifica antes de publicar que el paquete tenga todo lo necesario: `main`, `types`, `exports`, archivos de declaración TypeScript, y que `package.json` esté bien formado.

**external consumer validation:** Instala el paquete publicado en una app limpia (separada del monorepo) y verifica que el consumer flow funciona end-to-end sin dependencias del repo fuente.

**native artifact validation:** Verifica que los módulos Android e iOS tienen los archivos correctos, que los podspec de iOS y los gradle scripts de Android son válidos, y que los plugins están correctamente registrados.

**smoke collectors/validators:** Recolectan y validan evidencia de smoke tests — capturas de pantalla, logs de consola, resultados de Detox — y los agregan en un reporte de release.

**docs/readiness drift guards:** Detectan cuando el código y la documentación se desincronizaron — por ejemplo, si se agrega un método al plugin pero no se documenta en el README.

### Pipeline de CI recomendado

```yaml
# En cada PR:
- lint + typecheck (legato-contract + legato-capacitor)
- unit tests TypeScript (Jest)
- unit tests Android (JUnit + Robolectric)
- unit tests iOS (XCTest)

# En cada merge a main:
- todo lo anterior +
- npm readiness check
- native artifact validation
- smoke tests en emulador Android (AVD)
- smoke tests en iOS Simulator

# En cada release:
- todo lo anterior +
- external consumer validation
- docs drift guard
- release-control (bump + publish)
```

---

## 11. Estrategia de testing

La estrategia de Legato está diseñada para alcanzar ~80% de cobertura sin necesitar un dispositivo físico ni tener el paquete instalado en una app real. El 20% restante requiere emulador o dispositivo y corresponde a comportamientos del sistema operativo que no son mockeables de forma confiable.

### Por qué es posible el 80% sin dispositivo

La razón es una sola decisión arquitectónica: **inyección de dependencias en el engine**. `LegatoAndroidCore` y `LegatoCore` no instancian `ExoPlayer` ni `AVPlayer` directamente — los reciben como parámetros a través de una interfaz. Esto permite sustituirlos con implementaciones fake en tests.

### Nivel 1 — Contract + TypeScript (sin dispositivo)

Testea con Jest/Vitest. El bridge de Capacitor se mockea completamente:

```typescript
// Mock del bridge — simula todo el runtime de Capacitor
const mockBridge = {
  calls: [],
  listeners: new Map(),

  call(method, args) {
    this.calls.push({ method, args })
    return Promise.resolve({ value: null })
  },

  addListener(event, cb) {
    const existing = this.listeners.get(event) ?? []
    this.listeners.set(event, [...existing, cb])
    return { remove: () => {} }
  },

  emit(event, data) {  // simula evento push desde el nativo
    this.listeners.get(event)?.forEach(cb => cb(data))
  }
}

jest.mock('@capacitor/core', () => ({
  registerPlugin: () => mockBridge
}))
```

Qué se testea en este nivel:

- Serialización correcta de llamadas al bridge (play, load, seekTo)
- Propagación de eventos desde el mock al handler registrado
- Lógica de la queue (shuffle, repeat, orden)
- Validación de invariants del contrato
- Manejo de errores tipados

### Nivel 2 — Android engine con Robolectric (sin dispositivo)

Robolectric corre el runtime de Android en la JVM. ExoPlayer se reemplaza con un fake:

```kotlin
// Engine fake para tests
class FakeAudioEngine : AudioPlayerEngine {
    var isPlaying = false
    var loadedUrl: String? = null
    var currentPositionMs: Long = 0L
    var durationMs: Long = 0L
    val loadCalls = mutableListOf<String>()

    override fun load(url: String, startPositionMs: Long) {
        loadedUrl = url
        loadCalls.add(url)
    }
    override fun play()  { isPlaying = true }
    override fun pause() { isPlaying = false }
    override fun seekTo(positionMs: Long) { currentPositionMs = positionMs }
    override fun release() {}
}

@RunWith(RobolectricTestRunner::class)
class LegatoAndroidCoreTest {
    @Test
    fun `play emite stateChanged con estado playing`() {
        val fakeEngine = FakeAudioEngine()
        val fakeEmitter = FakeEmitter()
        val core = LegatoAndroidCore(
            context = ApplicationProvider.getApplicationContext(),
            emitter = fakeEmitter,
            engine = fakeEngine
        )

        core.play()

        assertThat(fakeEmitter.events).contains(
            EmittedEvent("stateChanged", mapOf("state" to "playing"))
        )
    }
}
```

### Nivel 2 — iOS engine con XCTest (sin dispositivo)

```swift
class FakeAudioEngine: AudioEngineProtocol {
    var isPlaying = false
    var loadedURL: URL?
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 0
    var delegate: AudioEngineDelegate?

    func load(url: URL, startPosition: TimeInterval) { loadedURL = url }
    func play()  { isPlaying = true }
    func pause() { isPlaying = false }
    func seek(to position: TimeInterval) { currentTime = position }
    func release() {}
}

class LegatoCoreTests: XCTestCase {
    func testPlayEmitsStateChanged() {
        let fakeEngine = FakeAudioEngine()
        let fakeEmitter = FakeEmitter()
        let core = LegatoCore(engine: fakeEngine, emitter: fakeEmitter)

        core.play()

        XCTAssertTrue(fakeEmitter.events.contains { $0.name == "stateChanged" })
    }
}
```

### Nivel 3 — Integration tests (emulador/simulator en CI)

Corren en GitHub Actions con Android Virtual Device (AVD) y iOS Simulator. No necesitan dispositivo físico pero sí un emulador real del OS. Validan:

- Registro correcto del plugin en Capacitor
- Flujo completo JS → bridge → plugin → engine → evento de retorno
- Gapless playback entre dos tracks
- Seek y posición correcta después del seek

### El 20% que requiere dispositivo real

Estos comportamientos dependen del OS real y no son mockeables de forma confiable:

| Escenario | Por qué requiere dispositivo |
|---|---|
| Audio focus con llamada entrante real | AudioManager no responde igual en Robolectric |
| Background survival en Android | El sistema de procesos reales no es simulable |
| Lockscreen controls en iOS | MPNowPlayingInfoCenter necesita el framework real |
| Interrupciones de AVAudioSession | El daemon de audio no existe completamente en Simulator |

Estos se cubren como smoke tests manuales o automatizados con Detox en el `capacitor-demo`.

---

## 12. Estado actual y gaps

### Completitud estimada por capa

| Capa | Completitud | Estado |
|------|-------------|--------|
| legato-contract | 75% | Falta eventos de focus y buffering |
| legato-capacitor | 64% | Facade ambigua, API incompleta |
| native/android/core | 35% | Seam — falta ForegroundService, AudioFocus, Cache, gapless |
| native/ios/LegatoCore | 35% | Seam — falta AVAudioSession, MPNowPlaying, RemoteCommands |
| apps/capacitor-demo | 70% | Falta smoke tests de background survival |
| Release + tooling | 90% | Bien maduro |
| **Global** | **~55%** | Hacia el target de producción |

### Gap más crítico

Los native cores son el cuello de botella real del proyecto. Todo lo demás (tooling, packaging, contract) puede esperar. Sin engines completos, el tooling madura sobre vacío.

La pregunta de validación del estado real: ¿`apps/capacitor-demo` puede reproducir audio de una URL, con controles de lockscreen funcionando, y sobrevivir ir al background? La respuesta determina si los seams son shells vacíos o motores parciales.

---

## 13. Roadmap de completitud

### Fase 1 — Completar el contract (1 semana)

Solo cambios en `legato-contract`. Sin tocar otras capas.

- Agregar eventos faltantes: `bufferingChanged`, `audioFocusLost`, `audioFocusGained`, `interruptionBegan`, `interruptionEnded`
- Agregar errores faltantes: `FOCUS_DENIED`, `BACKGROUND_KILLED`, `SOURCE_UNAVAILABLE`
- Resolver la facade: definir si `Legato` es `@deprecated` (que delega a `audioPlayer`) o se promueve como API principal

### Fase 2 — Android engine completo (2-3 semanas)

Trabajo aditivo sobre el seam existente, en orden de prioridad:

1. **ForegroundService** — bloqueante en Android 8+. Sin esto, el player muere en background.
2. **AudioFocusManager** — reaccionar a llamadas entrantes y otras apps de audio.
3. **CacheDataSource** — integrar `SimpleCache` de ExoPlayer para cache progresivo.
4. **Queue con gapless** — `ConcatenatingMediaSource` para transición sin silencio entre tracks.

### Fase 3 — iOS engine completo (2-3 semanas, paralelo a Fase 2)

1. **AVAudioSession** configurado correctamente (`.playback`, no `.ambient`).
2. **MPNowPlayingInfoCenter** — metadatos completos en lockscreen.
3. **MPRemoteCommandCenter** — play, pause, next, previous, seek desde lockscreen/AirPods/CarPlay.
4. **Manejo de interrupciones** — llamadas, Siri, alarmas.

### Fase 4 — Ampliar demo harness (en paralelo)

- Smoke test de background survival (app al background → audio continúa)
- Smoke test de llamada entrante (pausa → llamada termina → reanuda)
- Smoke test de seek desde lockscreen

### Lo que NO tocar hasta completar Fases 1-3

- Estructura del monorepo — correcta
- Sistema de release y validación — correcto, solo extenderlo
- Bridges de Capacitor — solo tocarlos cuando el engine cambie su interfaz
- Packaging y distribución — ya funciona

---

## 14. Visión de largo plazo

### Agnosticismo de framework como potencial arquitectónico

Hoy Legato es Capacitor-first. La arquitectura está deliberadamente diseñada para que agregar Flutter o React Native en el futuro no requiera reescribir el dominio.

El `legato-contract` ya es agnóstico de framework — define el dominio sin depender de ninguna plataforma. Los native engines (`LegatoAndroidCore`, `LegatoCore`) tampoco dependen de Capacitor — reciben el emitter como interfaz. Agregar un adapter de Flutter solo requiere:

1. Crear `adapter-flutter` que registra un `MethodChannel` y traduce llamadas al emitter
2. El engine nativo ya existe — solo cambia el bridge

Esto es potencial arquitectónico real, no solo una aspiración.

### Modelo de distribución futuro

Si el proyecto crece en adopción, el monorepo permite evolucionar hacia un modelo tipo Capawesome — paquetes separados publicados desde el mismo repo, cada uno con su propio versionado pero coordinados por CI. Esto es posible sin cambiar la arquitectura fundamental.

### Features de producción que vienen después del engine completo

Una vez que los engines estén completos y los smoke tests pasen, el roadmap de features de producción incluye:

- **Equalizer** — bandas de frecuencia y presets (requiere AudioFX en Android, AVAudioEngine en iOS)
- **Crossfade** — transición con overlap configurable entre tracks
- **Pitch control** — cambio de tono independiente de velocidad
- **Offline support** — cache pre-cargado para reproducción sin red
- **CarPlay / Android Auto** — UI nativa en el sistema de entretenimiento del auto
- **Sleep timer** — pausa programada con fade out

---

## 15. Estado actual vs dirección multi-binding (foundation v1)

### Estado actual (implementado hoy)

- **Contract reusable real:** los tipos/eventos/errores/snapshots viven en `packages/contract/src/*`.
- **Cores nativos reutilizables:** composición nativa en `native/android/core/src/main/kotlin/io/legato/core/core/LegatoAndroidCoreComposition.kt` y `native/ios/LegatoCore/Sources/LegatoCore/Core/LegatoiOSCoreComposition.swift`.
- **Binding runtime vigente:** solo existe binding operativo en `packages/capacitor/**`.
- **Harness operativo vigente:** validación host/release actual se ejecuta con `apps/capacitor-demo/**`.

### Dirección objetivo (planificada, no implementada en v1)

- Definir un contrato adapter-agnostic en `packages/contract/src/binding-adapter.ts`.
- Preparar el spike de bindings futuros sin implementar runtime en `packages/react-native/.gitkeep` y `packages/flutter/legato/.gitkeep`.
- Mantener Capacitor como primer adapter concreto, sin cambiar su semántica runtime actual.

### Referencias fundacionales de esta etapa

- Capability map source-backed: [`docs/architecture/multi-binding-capability-map.md`](docs/architecture/multi-binding-capability-map.md)
- Guardrails de alcance y estabilidad: [`docs/architecture/multi-binding-guardrails.md`](docs/architecture/multi-binding-guardrails.md)

### Out of scope in v1

- no Flutter runtime adapter
- no React Native runtime adapter
- no release-pipeline rewiring
- no native engine rewrite

*Documento generado como descripción conceptual completa de Legato v1.0 en su estado actual de desarrollo.*
