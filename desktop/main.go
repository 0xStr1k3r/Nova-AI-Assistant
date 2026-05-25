package main

import (
	"fmt"
	"image/color"
	"log"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// ─── State Machine ────────────────────────────────────────────────────────────

// AssistantState represents the current state of the voice assistant.
type AssistantState int32

const (
	// StateStandby: mic captures audio; energy-VAD watches for a voice burst
	// that signals the user might be saying the wake word. When a burst is
	// detected, we open a session and enter StateListening.
	StateStandby AssistantState = iota

	// StateListening: WebSocket is open and we are streaming mic audio.
	// The Gemini Live API (on the server) handles natural conversation.
	// Silence > silenceEndSec seconds → StateWaiting (hold WS open, wait for reply).
	StateListening

	// StateWaiting: user finished speaking; we keep the WS open and wait for
	// Nova's audio reply.
	StateWaiting

	// StateSpeaking: Nova's audio is playing back.
	StateSpeaking

	// StateConnecting: WebSocket handshake in progress.
	StateConnecting

	// StateError: unrecoverable error; user must reconnect.
	StateError
)

func (s AssistantState) Label() string {
	switch s {
	case StateStandby:
		return "Standby — say the wake word"
	case StateListening:
		return "Listening…"
	case StateWaiting:
		return "Processing…"
	case StateSpeaking:
		return "Nova is speaking…"
	case StateConnecting:
		return "Connecting to Nova…"
	case StateError:
		return "Error — check server"
	}
	return "Unknown"
}

// ─── VAD / Wake constants ────────────────────────────────────────────────────

const (
	// Number of consecutive loud chunks (100 ms each) to trigger wake detection.
	// 4 × 100 ms = 400 ms of continuous voice activity.
	wakeChunks = 4

	// Number of consecutive silent chunks before we consider the user done.
	// 25 × 100 ms = 2.5 seconds of silence.
	silenceEndChunks = 25

	// RMS thresholds (int16 PCM scale 0–32767).
	vadLoudThresh   = 600.0 // chunk is "loud" if RMS > this
	vadSilentThresh = 280.0 // chunk is "silent" if RMS < this
)

// ─── NovaApp ─────────────────────────────────────────────────────────────────

// NovaApp is the top-level application orchestrator.
type NovaApp struct {
	cfg     *AppConfig
	novaCfg *NovaServerConfig

	// Audio pipeline
	audio    *AudioEngine

	// WebSocket session (nil when disconnected)
	wsMu   sync.Mutex
	wsConn *NovaClient

	// Atomic state — safe to read from any goroutine
	state atomic.Int32

	// VAD counters (only written from the capture goroutine)
	loudCount   int
	silentCount int

	// Stop-word list — populated from server config
	stopWords []string

	// Session timer (seconds since last connection)
	sessionSec int

	// ── Fyne UI references (must only be mutated via fyne.Do) ──────────────
	fyneApp    fyne.App
	win        fyne.Window
	statusLbl  *widget.Label
	wakeWordLbl *canvas.Text
	orb        *OrbWidget
	logList    *widget.List
	actionBtn  *widget.Button
	sessionLbl *widget.Label

	// Log ring-buffer (max 100 entries)
	logMu   sync.Mutex
	logData []string
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	cfg := LoadConfig()

	na := &NovaApp{
		cfg:       cfg,
		stopWords: []string{"bye", "goodbye", "stop listening", "see you", "that's all", "exit"},
		logData:   make([]string, 0, 100),
	}

	// Fetch server config in background — sets wake word / stop word / user name
	go na.loadServerConfig()

	na.runUI()
}

func (na *NovaApp) loadServerConfig() {
	for attempt := 0; attempt < 5; attempt++ {
		sc, err := FetchNovaConfig(na.cfg.APIURL)
		if err == nil {
			na.novaCfg = sc
			na.log(fmt.Sprintf("Wake word: %q | Stop words: %s", sc.WakeWord, strings.Join(na.effectiveStopWords(sc), ", ")))
			// Refresh wake word label in UI
			fyne.Do(func() {
				if na.wakeWordLbl != nil {
					na.wakeWordLbl.Text = fmt.Sprintf("Wake: %q", sc.WakeWord)
					na.wakeWordLbl.Refresh()
				}
			})
			return
		}
		na.log(fmt.Sprintf("Server not reachable (%d/5): %v", attempt+1, err))
		time.Sleep(3 * time.Second)
	}
	na.log("Could not reach Nova server — using defaults (wake: \"nova\")")
}

// effectiveStopWords returns the list of stop words including any server-configured one.
func (na *NovaApp) effectiveStopWords(sc *NovaServerConfig) []string {
	words := append([]string{}, na.stopWords...)
	if sc != nil && sc.StopWord != "" {
		sw := strings.ToLower(strings.TrimSpace(sc.StopWord))
		for _, w := range words {
			if w == sw {
				return words
			}
		}
		words = append(words, sw)
	}
	return words
}

// effectiveWakeWord returns the configured wake word (default "nova").
func (na *NovaApp) effectiveWakeWord() string {
	if na.novaCfg != nil && na.novaCfg.WakeWord != "" {
		return strings.ToLower(na.novaCfg.WakeWord)
	}
	return "nova"
}

// ─── UI ──────────────────────────────────────────────────────────────────────

func (na *NovaApp) runUI() {
	na.fyneApp = app.NewWithID("dev.nova.assistant")
	na.fyneApp.Settings().SetTheme(&novaTheme{})

	na.win = na.fyneApp.NewWindow("Nova Assistant")
	na.win.SetFixedSize(true)
	na.win.Resize(fyne.NewSize(440, 660))
	na.win.CenterOnScreen()
	na.win.SetCloseIntercept(func() {
		na.shutdown()
		na.fyneApp.Quit()
	})

	// ── Header ──
	title := canvas.NewText("NOVA", color.NRGBA{R: 138, G: 99, B: 255, A: 255})
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.TextSize = 34
	title.Alignment = fyne.TextAlignCenter

	subtitle := canvas.NewText("AI Voice Assistant", color.NRGBA{R: 160, G: 160, B: 200, A: 160})
	subtitle.TextSize = 13
	subtitle.Alignment = fyne.TextAlignCenter

	na.wakeWordLbl = canvas.NewText(fmt.Sprintf("Wake: %q", na.effectiveWakeWord()), color.NRGBA{R: 100, G: 200, B: 120, A: 180})
	na.wakeWordLbl.TextSize = 11
	na.wakeWordLbl.Alignment = fyne.TextAlignCenter

	// ── Orb ──
	na.orb = newOrbWidget()
	orbBox := container.NewCenter(na.orb)

	// ── Status / session timer ──
	na.statusLbl = widget.NewLabel(StateStandby.Label())
	na.statusLbl.Alignment = fyne.TextAlignCenter
	na.statusLbl.TextStyle = fyne.TextStyle{Italic: true}

	na.sessionLbl = widget.NewLabel("")
	na.sessionLbl.Alignment = fyne.TextAlignCenter
	na.sessionLbl.TextStyle = fyne.TextStyle{Monospace: true}

	// ── Action button ──
	na.actionBtn = widget.NewButton("Connect & Start Listening", na.handleActionBtn)
	na.actionBtn.Importance = widget.HighImportance

	// ── Server info ──
	srvLbl := canvas.NewText(fmt.Sprintf("Server: %s", na.cfg.ServerURL), color.NRGBA{R: 100, G: 100, B: 150, A: 180})
	srvLbl.TextSize = 10
	srvLbl.Alignment = fyne.TextAlignCenter

	// ── Activity log ──
	na.logList = widget.NewList(
		func() int {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			return len(na.logData)
		},
		func() fyne.CanvasObject {
			l := widget.NewLabel("")
			l.Wrapping = fyne.TextWrapWord
			l.TextStyle = fyne.TextStyle{Monospace: true}
			return l
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			if id < len(na.logData) {
				obj.(*widget.Label).SetText(na.logData[id])
			}
		},
	)
	logCard := widget.NewCard("Activity Log", "", na.logList)

	// ── Layout ──
	content := container.NewVBox(
		container.NewPadded(container.NewVBox(title, subtitle, na.wakeWordLbl)),
		container.NewPadded(orbBox),
		container.NewPadded(container.NewVBox(na.statusLbl, na.sessionLbl)),
		container.NewPadded(na.actionBtn),
		srvLbl,
		container.NewPadded(logCard),
	)
	na.win.SetContent(content)

	// ── Start audio engine immediately ──
	na.startAudio()

	// ── Animation ticker ──
	go func() {
		t := time.NewTicker(50 * time.Millisecond)
		defer t.Stop()
		for range t.C {
			fyne.Do(func() { na.orb.tick() })
		}
	}()

	// ── Session timer ticker ──
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for range t.C {
			st := AssistantState(na.state.Load())
			if st == StateListening || st == StateSpeaking || st == StateWaiting {
				na.sessionSec++
				sec := na.sessionSec
				fyne.Do(func() {
					na.sessionLbl.SetText(fmt.Sprintf("● LIVE %02d:%02d", sec/60, sec%60))
				})
			}
		}
	}()

	na.win.ShowAndRun()
}

// ─── Button Handler ───────────────────────────────────────────────────────────

func (na *NovaApp) handleActionBtn() {
	st := AssistantState(na.state.Load())
	switch st {
	case StateListening, StateWaiting, StateSpeaking:
		// Manual disconnect
		na.log("Manually disconnecting session…")
		na.endSession()
	case StateConnecting:
		// ignore double-press
	default:
		// Connect
		na.log(fmt.Sprintf("Connecting to %s…", na.cfg.ServerURL))
		na.setState(StateConnecting)
		fyne.Do(func() {
			na.actionBtn.SetText("Connecting…")
			na.actionBtn.Disable()
		})
		go na.connect()
	}
}

// ─── Connection Lifecycle ─────────────────────────────────────────────────────

func (na *NovaApp) connect() {
	client := NewNovaClient(
		na.onAudioReceived,
		na.onActionReceived,
		na.onServerError,
		na.onConnected,
		na.onDisconnected,
	)
	if err := client.Connect(na.cfg.ServerURL); err != nil {
		na.log(fmt.Sprintf("Connection failed: %v", err))
		na.setState(StateError)
		fyne.Do(func() {
			na.actionBtn.SetText("Retry Connection")
			na.actionBtn.Enable()
		})
		return
	}
	na.wsMu.Lock()
	na.wsConn = client
	na.wsMu.Unlock()
}

func (na *NovaApp) onConnected() {
	na.sessionSec = 0
	na.log(fmt.Sprintf("Connected! Say %q to begin.", na.effectiveWakeWord()))
	na.setState(StateStandby)
	fyne.Do(func() {
		na.actionBtn.SetText("Disconnect")
		na.actionBtn.Enable()
	})
}

func (na *NovaApp) onDisconnected() {
	na.log("Session closed.")
	na.setState(StateStandby)
	fyne.Do(func() {
		na.sessionLbl.SetText("")
		na.actionBtn.SetText("Connect & Start Listening")
		na.actionBtn.Enable()
	})
	na.wsMu.Lock()
	na.wsConn = nil
	na.wsMu.Unlock()
}

func (na *NovaApp) onAudioReceived(pcm []byte) {
	// Queue audio for playback; update state only once
	na.audio.QueuePlayback(pcm)
	if AssistantState(na.state.Load()) != StateSpeaking {
		na.setState(StateSpeaking)
		na.log("Nova is responding…")
	}
}

func (na *NovaApp) onActionReceived(action string) {
	log.Printf("[ACTION] %s", action)
	switch action {
	case "endSession":
		// Nova said goodbye — cleanly end the session
		na.log("Nova ended the session.")
		na.audio.ClearPlayback()
		// Small delay so the final audio can finish playing
		time.AfterFunc(1200*time.Millisecond, func() {
			na.endSession()
		})
	}
}

func (na *NovaApp) onServerError(errStr string) {
	na.log(fmt.Sprintf("Server error: %s", errStr))
	na.setState(StateError)
}

// endSession disconnects the WebSocket and returns to standby.
func (na *NovaApp) endSession() {
	na.wsMu.Lock()
	ws := na.wsConn
	na.wsMu.Unlock()
	if ws != nil {
		ws.Disconnect()
	}
	na.audio.ClearPlayback()
	na.setState(StateStandby)
	na.silentCount = 0
	na.loudCount = 0
	fyne.Do(func() {
		na.sessionLbl.SetText("")
		na.actionBtn.SetText("Connect & Start Listening")
		na.actionBtn.Enable()
	})
}

// ─── Audio Engine Setup ───────────────────────────────────────────────────────

func (na *NovaApp) startAudio() {
	na.audio = NewAudioEngine(na.onMicChunk)
	if err := na.audio.StartCapture(); err != nil {
		na.log(fmt.Sprintf("Mic error: %v", err))
	} else {
		na.log("Microphone ready (16 kHz)")
	}
	if err := na.audio.StartPlayback(); err != nil {
		na.log(fmt.Sprintf("Playback error: %v", err))
	} else {
		na.log("Speaker ready (24 kHz)")
	}
}

// ─── Mic Chunk Handler ────────────────────────────────────────────────────────
//
// The web version uses the browser's SpeechRecognition API to detect the wake
// word text, then streams continuously.  We replicate this with a two-phase
// energy VAD:
//
//   Phase 1 — Standby: mic is open, energy is measured.  When the user speaks
//   loud enough for wakeChunks consecutive frames we treat it as a wake event
//   and start streaming.  The Gemini model on the server already knows its name
//   from the system prompt — if the user said "nova …" the model will respond;
//   if not, it simply won't reply (natural VAD handled by Gemini Live API).
//
//   Phase 2 — Listening: every chunk is sent to the server.  After
//   silenceEndChunks consecutive silent frames we move to Waiting — we keep the
//   WS open so the reply can arrive.
//
//   Speaking → Standby: after Nova's audio finishes the server does not send
//   any more audio chunks; the orb animation returns to idle when the playback
//   queue drains (handled by a background monitor goroutine started in connect).

func (na *NovaApp) onMicChunk(samples []int16) {
	rms := RMS(samples)

	st := AssistantState(na.state.Load())

	// Always update orb energy (visual only)
	energy := float32(math.Min(rms/4000.0, 1.0))
	fyne.Do(func() { na.orb.setEnergy(energy) })

	na.wsMu.Lock()
	ws := na.wsConn
	na.wsMu.Unlock()

	switch st {
	// ── STANDBY: watch for a voice burst ──────────────────────────────────
	case StateStandby:
		if ws == nil {
			return // not connected
		}
		if rms > vadLoudThresh {
			na.loudCount++
			na.silentCount = 0
		} else {
			na.loudCount = 0
		}
		if na.loudCount >= wakeChunks {
			na.loudCount = 0
			na.silentCount = 0
			na.setState(StateListening)
			na.log(fmt.Sprintf("Voice detected — streaming to Nova (say %q to wake)", na.effectiveWakeWord()))
		}

	// ── LISTENING: stream every chunk; watch for end-of-speech ───────────
	case StateListening:
		if ws == nil {
			na.setState(StateStandby)
			return
		}
		// Send raw PCM to server
		raw := Int16ToBytes(samples)
		if err := ws.SendAudio(raw); err != nil {
			na.log(fmt.Sprintf("Send error: %v", err))
			na.setState(StateStandby)
			return
		}
		// End-of-speech detection
		if rms < vadSilentThresh {
			na.silentCount++
		} else {
			na.silentCount = 0
		}
		if na.silentCount >= silenceEndChunks {
			na.silentCount = 0
			na.loudCount = 0
			na.setState(StateWaiting)
			na.log("End of speech — waiting for Nova…")
		}

	// ── WAITING / SPEAKING: microphone is still captured but NOT sent ─────
	// This prevents Nova's own voice from being echoed back.
	case StateWaiting, StateSpeaking:
		// Do not stream; wait for onAudioReceived / onActionReceived to
		// transition state back to Standby or next Listening cycle.

	default:
		// StateConnecting, StateError — ignore
	}
}

// ─── Playback drain monitor ───────────────────────────────────────────────────
// Started as a goroutine when we enter StateSpeaking; detects when the
// playback buffer drains and returns to StateStandby automatically.
func (na *NovaApp) watchPlaybackDrain() {
	for {
		time.Sleep(200 * time.Millisecond)
		// Count queued items by trying a non-blocking peek
		if AssistantState(na.state.Load()) != StateSpeaking {
			return
		}
		// If the buffer appears empty (no new audio for 600ms), go to standby
		before := len(na.audio.playbackBuf)
		time.Sleep(600 * time.Millisecond)
		after := len(na.audio.playbackBuf)
		if before == 0 && after == 0 {
			if AssistantState(na.state.Load()) == StateSpeaking {
				na.setState(StateStandby)
				na.log("Nova finished speaking — back to standby")
				na.silentCount = 0
				na.loudCount = 0
			}
			return
		}
	}
}

// ─── State & Logging Helpers ──────────────────────────────────────────────────

func (na *NovaApp) setState(s AssistantState) {
	na.state.Store(int32(s))
	lbl := s.Label()
	fyne.Do(func() {
		na.statusLbl.SetText(lbl)
		na.orb.setState(s)
		// Update action button label while live
		switch s {
		case StateListening, StateWaiting, StateSpeaking:
			na.actionBtn.SetText("End Session")
			na.actionBtn.Enable()
		}
	})
	if s == StateSpeaking {
		go na.watchPlaybackDrain()
	}
}

func (na *NovaApp) log(msg string) {
	ts := time.Now().Format("15:04:05")
	entry := fmt.Sprintf("[%s] %s", ts, msg)
	log.Println(entry)
	na.logMu.Lock()
	na.logData = append(na.logData, entry)
	if len(na.logData) > 100 {
		na.logData = na.logData[len(na.logData)-100:]
	}
	n := len(na.logData)
	na.logMu.Unlock()
	fyne.Do(func() {
		na.logList.Refresh()
		if n > 0 {
			na.logList.ScrollTo(n - 1)
		}
	})
}

func (na *NovaApp) shutdown() {
	na.log("Shutting down…")
	na.wsMu.Lock()
	ws := na.wsConn
	na.wsMu.Unlock()
	if ws != nil {
		ws.Disconnect()
	}
	if na.audio != nil {
		na.audio.StopCapture()
		na.audio.StopPlayback()
		na.audio.Terminate()
	}
}

// ─── Orb Widget ──────────────────────────────────────────────────────────────

type OrbWidget struct {
	widget.BaseWidget
	energy float32
	phase  float64
	state  AssistantState
	circle *canvas.Circle
}

func newOrbWidget() *OrbWidget {
	o := &OrbWidget{}
	o.ExtendBaseWidget(o)
	o.circle = canvas.NewCircle(orbFill(StateStandby, 0))
	o.circle.StrokeWidth = 3
	return o
}

func (o *OrbWidget) setEnergy(e float32) { o.energy = e; o.Refresh() }
func (o *OrbWidget) setState(s AssistantState) { o.state = s; o.Refresh() }
func (o *OrbWidget) tick() {
	o.phase += 0.05
	if o.phase > 2*math.Pi {
		o.phase -= 2 * math.Pi
	}
	o.Refresh()
}

func (o *OrbWidget) CreateRenderer() fyne.WidgetRenderer {
	return widget.NewSimpleRenderer(o.circle)
}
func (o *OrbWidget) MinSize() fyne.Size { return fyne.NewSize(160, 160) }

func (o *OrbWidget) Refresh() {
	pulse := float32(math.Sin(o.phase)*0.12 + 0.88)
	size := float32(160) * pulse

	switch o.state {
	case StateListening:
		size = 148 + o.energy*50
	case StateSpeaking:
		size = 148 + float32(math.Abs(math.Sin(o.phase)))*38
	case StateWaiting:
		size = 148 + float32(math.Sin(o.phase)*0.08+0.92)*10
	}

	o.circle.FillColor = orbFill(o.state, float64(o.energy))
	o.circle.StrokeColor = orbStroke(o.state)
	o.circle.Resize(fyne.NewSize(size, size))
	o.circle.Move(fyne.NewPos((160-size)/2, (160-size)/2))
	o.BaseWidget.Refresh()
}

func orbFill(s AssistantState, energy float64) color.Color {
	switch s {
	case StateListening:
		g := uint8(60 + energy*140)
		return color.NRGBA{R: 50, G: g, B: 255, A: 210}
	case StateWaiting:
		return color.NRGBA{R: 100, G: 120, B: 255, A: 180}
	case StateSpeaking:
		return color.NRGBA{R: 138, G: 99, B: 255, A: 220}
	case StateConnecting:
		return color.NRGBA{R: 255, G: 180, B: 50, A: 180}
	case StateError:
		return color.NRGBA{R: 255, G: 80, B: 80, A: 200}
	default: // Standby
		return color.NRGBA{R: 40, G: 40, B: 90, A: 160}
	}
}

func orbStroke(s AssistantState) color.Color {
	switch s {
	case StateListening:
		return color.NRGBA{R: 80, G: 160, B: 255, A: 255}
	case StateWaiting:
		return color.NRGBA{R: 120, G: 140, B: 255, A: 220}
	case StateSpeaking:
		return color.NRGBA{R: 180, G: 130, B: 255, A: 255}
	case StateConnecting:
		return color.NRGBA{R: 255, G: 200, B: 80, A: 255}
	case StateError:
		return color.NRGBA{R: 255, G: 100, B: 100, A: 255}
	default:
		return color.NRGBA{R: 70, G: 70, B: 130, A: 180}
	}
}

// ─── Nova Dark Theme ──────────────────────────────────────────────────────────

type novaTheme struct{}

func (t *novaTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return color.NRGBA{R: 8, G: 8, B: 20, A: 255}
	case theme.ColorNameForeground:
		return color.NRGBA{R: 225, G: 225, B: 255, A: 255}
	case theme.ColorNameButton:
		return color.NRGBA{R: 28, G: 28, B: 58, A: 255}
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 138, G: 99, B: 255, A: 255}
	case theme.ColorNameHover:
		return color.NRGBA{R: 50, G: 38, B: 90, A: 255}
	case theme.ColorNameFocus:
		return color.NRGBA{R: 100, G: 60, B: 200, A: 255}
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 18, G: 18, B: 38, A: 255}
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 80, G: 60, B: 140, A: 120}
	}
	return theme.DefaultTheme().Color(name, variant)
}

func (t *novaTheme) Font(style fyne.TextStyle) fyne.Resource {
	return theme.DefaultTheme().Font(style)
}

func (t *novaTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

func (t *novaTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 8
	case theme.SizeNameInnerPadding:
		return 6
	case theme.SizeNameText:
		return 14
	}
	return theme.DefaultTheme().Size(name)
}
