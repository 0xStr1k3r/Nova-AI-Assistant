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

// ─── State Machine ──────────────────────────────────────────────────────────

type AssistantState int32

const (
	StateIdle      AssistantState = iota // Waiting for wake word
	StateListening                        // Sending audio to Nova
	StateSpeaking                         // Nova is speaking back
	StateConnecting                        // Establishing WebSocket
	StateError                            // Something went wrong
)

func (s AssistantState) String() string {
	switch s {
	case StateIdle:
		return "Idle — Say the wake word"
	case StateListening:
		return "Listening…"
	case StateSpeaking:
		return "Nova is speaking…"
	case StateConnecting:
		return "Connecting to Nova…"
	case StateError:
		return "Error — Check server"
	}
	return "Unknown"
}

// ─── Nova Desktop App ──────────────────────────────────────────────────────

// NovaApp is the top-level orchestrator
type NovaApp struct {
	cfg         *AppConfig
	novaCfg     *NovaServerConfig
	wsClient    *NovaClient
	audio       *AudioEngine
	state       atomic.Int32 // stores AssistantState

	// UI references (must be updated on main goroutine)
	fyneApp     fyne.App
	win         fyne.Window
	statusLabel *widget.Label
	orbAnim     *OrbWidget
	logScroll   *widget.List
	connectBtn  *widget.Button

	// Log ring buffer
	logMu      sync.Mutex
	logEntries []string

	// Wake word detection
	silenceCount    int
	voiceActive     bool
	wakeWordBuf     []string // last N transcribed chunks (future)
	wakeWord        string
	stopWord        string

	// Audio VAD ring buffer for RMS-based wake word triggering
	vadBuf     []float64
	vadBufSize int
}

func main() {
	cfg := LoadConfig()

	na := &NovaApp{
		cfg:        cfg,
		wakeWord:   "nova",
		stopWord:   "stop",
		vadBufSize: 10,
		vadBuf:     make([]float64, 0, 10),
		logEntries: []string{},
	}

	// Try to fetch server config (non-blocking, best effort)
	go func() {
		if sc, err := FetchNovaConfig(cfg.APIURL); err == nil {
			na.novaCfg = sc
			if sc.WakeWord != "" {
				na.wakeWord = strings.ToLower(sc.WakeWord)
			}
			if sc.StopWord != "" {
				na.stopWord = strings.ToLower(sc.StopWord)
			}
			na.appendLog(fmt.Sprintf("Wake word: %q  Stop word: %q", na.wakeWord, na.stopWord))
		} else {
			na.appendLog(fmt.Sprintf("Using defaults (server not reachable yet): %v", err))
		}
	}()

	na.runUI()
}

// ─── UI Construction ────────────────────────────────────────────────────────

func (na *NovaApp) runUI() {
	na.fyneApp = app.NewWithID("dev.nova.assistant")
	na.fyneApp.Settings().SetTheme(&novaTheme{})

	na.win = na.fyneApp.NewWindow("Nova Assistant")
	na.win.SetFixedSize(true)
	na.win.Resize(fyne.NewSize(420, 640))
	na.win.CenterOnScreen()
	na.win.SetCloseIntercept(func() {
		na.shutdown()
		na.fyneApp.Quit()
	})

	// Title bar
	title := canvas.NewText("NOVA", color.NRGBA{R: 138, G: 99, B: 255, A: 255})
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.TextSize = 32
	title.Alignment = fyne.TextAlignCenter

	subtitle := canvas.NewText("AI Voice Assistant", color.NRGBA{R: 160, G: 160, B: 200, A: 180})
	subtitle.TextSize = 13
	subtitle.Alignment = fyne.TextAlignCenter

	// Orb animation widget
	na.orbAnim = newOrbWidget()
	orbContainer := container.NewCenter(na.orbAnim)

	// Status label
	na.statusLabel = widget.NewLabel("Idle — Say the wake word")
	na.statusLabel.Alignment = fyne.TextAlignCenter
	na.statusLabel.TextStyle = fyne.TextStyle{Italic: true}

	// Connect button
	na.connectBtn = widget.NewButton("Connect to Nova Server", na.handleConnectBtn)
	na.connectBtn.Importance = widget.HighImportance

	// Log list
	na.logScroll = widget.NewList(
		func() int {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			return len(na.logEntries)
		},
		func() fyne.CanvasObject {
			lbl := widget.NewLabel("")
			lbl.Wrapping = fyne.TextWrapWord
			lbl.TextStyle = fyne.TextStyle{Monospace: true}
			return lbl
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			if id < len(na.logEntries) {
				obj.(*widget.Label).SetText(na.logEntries[id])
			}
		},
	)

	logCard := widget.NewCard("Activity Log", "", na.logScroll)

	// Config info row
	configInfo := canvas.NewText(fmt.Sprintf("Server: %s", na.cfg.ServerURL), color.NRGBA{R: 120, G: 120, B: 160, A: 200})
	configInfo.TextSize = 11
	configInfo.Alignment = fyne.TextAlignCenter

	// Layout
	content := container.NewVBox(
		container.NewPadded(container.NewVBox(
			title,
			subtitle,
		)),
		container.NewPadded(orbContainer),
		container.NewPadded(na.statusLabel),
		container.NewPadded(na.connectBtn),
		configInfo,
		container.NewPadded(logCard),
	)

	na.win.SetContent(content)

	// Start audio engine
	na.startAudioEngine()

	// Start orb animation ticker
	go na.animLoop()

	na.win.ShowAndRun()
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

func (na *NovaApp) handleConnectBtn() {
	if na.wsClient != nil && na.wsClient.IsConnected() {
		na.appendLog("Disconnecting…")
		na.wsClient.Disconnect()
		na.setState(StateIdle)
		na.connectBtn.SetText("Connect to Nova Server")
		return
	}

	na.appendLog(fmt.Sprintf("Connecting to %s…", na.cfg.ServerURL))
	na.setState(StateConnecting)
	na.connectBtn.SetText("Connecting…")
	na.connectBtn.Disable()

	go func() {
		client := NewNovaClient(
			na.onAudioReceived,
			na.onActionReceived,
			na.onServerError,
			na.onConnected,
			na.onDisconnected,
		)

		if err := client.Connect(na.cfg.ServerURL); err != nil {
			na.appendLog(fmt.Sprintf("Connection failed: %v", err))
			na.setState(StateError)
			fyne.Do(func() {
				na.connectBtn.SetText("Connect to Nova Server")
				na.connectBtn.Enable()
			})
			return
		}
		na.wsClient = client
	}()
}

func (na *NovaApp) onConnected() {
	na.appendLog("Connected! Say your wake word to begin.")
	na.setState(StateIdle)
	fyne.Do(func() {
		na.connectBtn.SetText("Disconnect")
		na.connectBtn.Enable()
	})
}

func (na *NovaApp) onDisconnected() {
	na.appendLog("Disconnected from Nova server.")
	na.setState(StateIdle)
	fyne.Do(func() {
		na.connectBtn.SetText("Connect to Nova Server")
		na.connectBtn.Enable()
	})
}

func (na *NovaApp) onAudioReceived(pcm []byte) {
	// Queue PCM for playback
	na.audio.QueuePlayback(pcm)
	na.setState(StateSpeaking)
}

func (na *NovaApp) onActionReceived(action string) {
	na.appendLog(fmt.Sprintf("Server action: %s", action))
	if action == "endSession" {
		na.setState(StateIdle)
		na.audio.ClearPlayback()
		na.appendLog("Session ended by server.")
	}
}

func (na *NovaApp) onServerError(errStr string) {
	na.appendLog(fmt.Sprintf("Server error: %s", errStr))
	na.setState(StateError)
}

// ─── Audio Processing ────────────────────────────────────────────────────────

func (na *NovaApp) startAudioEngine() {
	na.audio = NewAudioEngine(na.onMicChunk, nil)

	if err := na.audio.StartCapture(); err != nil {
		na.appendLog(fmt.Sprintf("Mic error: %v — check PortAudio/PulseAudio", err))
		log.Printf("[AUDIO] Mic start error: %v", err)
	} else {
		na.appendLog("Microphone ready.")
	}

	if err := na.audio.StartPlayback(); err != nil {
		na.appendLog(fmt.Sprintf("Playback error: %v", err))
		log.Printf("[AUDIO] Playback start error: %v", err)
	} else {
		na.appendLog("Playback ready.")
	}
}

// onMicChunk processes each captured audio chunk from the microphone
func (na *NovaApp) onMicChunk(samples []int16) {
	rms := RMS(samples)

	// Update VAD sliding window
	na.vadBuf = append(na.vadBuf, rms)
	if len(na.vadBuf) > na.vadBufSize {
		na.vadBuf = na.vadBuf[1:]
	}

	state := AssistantState(na.state.Load())

	// Update orb energy level for animation
	fyne.Do(func() {
		level := math.Min(rms/3000, 1.0)
		na.orbAnim.setEnergy(float32(level))
	})

	// If connected and listening → stream to server
	if state == StateListening {
		if na.wsClient != nil && na.wsClient.IsConnected() {
			raw := Int16ToBytes(samples)
			if err := na.wsClient.SendAudio(raw); err != nil {
				log.Printf("[WS] Send audio error: %v", err)
			}
		}

		// Stop word detection: check if audio dropped to silence for > 2s
		// (Simple energy-based endpoint detection)
		if rms < silenceThreshold {
			na.silenceCount++
			// 2 seconds of silence = stop (100ms chunks × 20 = 2s)
			if na.silenceCount > 20 {
				na.silenceCount = 0
				// Don't disconnect, just go idle (server manages the session)
				na.setState(StateIdle)
				na.appendLog("End of speech detected — waiting for response…")
				na.setState(StateSpeaking)
			}
		} else {
			na.silenceCount = 0
		}
		return
	}

	// Wake word detection in Idle state
	if state == StateIdle && na.wsClient != nil && na.wsClient.IsConnected() {
		// Use energy spike as wake word proxy:
		// Average RMS over the VAD window must exceed threshold
		avgRMS := 0.0
		for _, v := range na.vadBuf {
			avgRMS += v
		}
		if len(na.vadBuf) > 0 {
			avgRMS /= float64(len(na.vadBuf))
		}

		// Energy burst detected → start listening
		if avgRMS > 800 && rms > 1000 {
			if !na.voiceActive {
				na.voiceActive = true
				na.silenceCount = 0
				na.setState(StateListening)
				na.appendLog("Wake detected — listening…")
			}
		} else {
			na.voiceActive = false
		}
	}
}

// ─── State & UI Update Helpers ───────────────────────────────────────────────

func (na *NovaApp) setState(s AssistantState) {
	na.state.Store(int32(s))
	fyne.Do(func() {
		na.statusLabel.SetText(s.String())
		na.orbAnim.setState(s)
	})
}

func (na *NovaApp) appendLog(msg string) {
	ts := time.Now().Format("15:04:05")
	entry := fmt.Sprintf("[%s] %s", ts, msg)
	log.Println(entry)
	na.logMu.Lock()
	na.logEntries = append(na.logEntries, entry)
	// Keep last 100 entries
	if len(na.logEntries) > 100 {
		na.logEntries = na.logEntries[len(na.logEntries)-100:]
	}
	n := len(na.logEntries)
	na.logMu.Unlock()
	fyne.Do(func() {
		na.logScroll.Refresh()
		if n > 0 {
			na.logScroll.ScrollTo(n - 1)
		}
	})
}

func (na *NovaApp) shutdown() {
	na.appendLog("Shutting down…")
	if na.wsClient != nil {
		na.wsClient.Disconnect()
	}
	if na.audio != nil {
		na.audio.StopCapture()
		na.audio.StopPlayback()
		na.audio.Terminate()
	}
}

func (na *NovaApp) animLoop() {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		fyne.Do(func() {
			na.orbAnim.tick()
		})
	}
}

// ─── Orb Animation Widget ────────────────────────────────────────────────────

// OrbWidget is a custom canvas object that renders an animated orb
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
	o.circle = canvas.NewCircle(orbColor(StateIdle, 0))
	o.circle.StrokeWidth = 3
	return o
}

func (o *OrbWidget) setEnergy(e float32) {
	o.energy = e
	o.Refresh()
}

func (o *OrbWidget) setState(s AssistantState) {
	o.state = s
	o.Refresh()
}

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

func (o *OrbWidget) MinSize() fyne.Size {
	return fyne.NewSize(160, 160)
}

func (o *OrbWidget) Refresh() {
	pulse := float32(math.Sin(o.phase)*0.15 + 0.85)
	size := float32(160) * pulse
	if o.state == StateListening {
		size = 160 + o.energy*40
	} else if o.state == StateSpeaking {
		size = 160 + float32(math.Abs(math.Sin(o.phase)))*30
	}

	o.circle.FillColor = orbColor(o.state, float64(o.energy))
	o.circle.StrokeColor = orbStroke(o.state)
	o.circle.Resize(fyne.NewSize(size, size))
	o.circle.Move(fyne.NewPos((160-size)/2, (160-size)/2))
	o.BaseWidget.Refresh()
}

// orbColor returns the fill color based on state
func orbColor(s AssistantState, energy float64) color.Color {
	switch s {
	case StateListening:
		g := uint8(80 + energy*120)
		return color.NRGBA{R: 80, G: g, B: 255, A: 200}
	case StateSpeaking:
		return color.NRGBA{R: 138, G: 99, B: 255, A: 220}
	case StateConnecting:
		return color.NRGBA{R: 255, G: 180, B: 50, A: 180}
	case StateError:
		return color.NRGBA{R: 255, G: 80, B: 80, A: 200}
	default:
		return color.NRGBA{R: 50, G: 50, B: 100, A: 180}
	}
}

func orbStroke(s AssistantState) color.Color {
	switch s {
	case StateListening:
		return color.NRGBA{R: 100, G: 150, B: 255, A: 255}
	case StateSpeaking:
		return color.NRGBA{R: 180, G: 130, B: 255, A: 255}
	case StateConnecting:
		return color.NRGBA{R: 255, G: 200, B: 80, A: 255}
	case StateError:
		return color.NRGBA{R: 255, G: 100, B: 100, A: 255}
	default:
		return color.NRGBA{R: 80, G: 80, B: 140, A: 200}
	}
}

// ─── Nova Dark Theme ──────────────────────────────────────────────────────────

type novaTheme struct{}

func (t *novaTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return color.NRGBA{R: 10, G: 10, B: 22, A: 255}
	case theme.ColorNameForeground:
		return color.NRGBA{R: 230, G: 230, B: 255, A: 255}
	case theme.ColorNameButton:
		return color.NRGBA{R: 30, G: 30, B: 60, A: 255}
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 138, G: 99, B: 255, A: 255}
	case theme.ColorNameHover:
		return color.NRGBA{R: 50, G: 40, B: 90, A: 255}
	case theme.ColorNameFocus:
		return color.NRGBA{R: 100, G: 60, B: 200, A: 255}
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 20, G: 20, B: 40, A: 255}
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
