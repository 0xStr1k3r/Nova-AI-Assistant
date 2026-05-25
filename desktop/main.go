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
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// ─── State Machine ────────────────────────────────────────────────────────────

type AppStatus int32

const (
	StatusStandby    AppStatus = iota // Idle — mic open, watching for voice
	StatusListening                   // Streaming to Nova
	StatusWaiting                     // Waiting for Nova's reply
	StatusSpeaking                    // Playing Nova's audio
	StatusConnecting                  // WS handshake
	StatusError                       // Unrecoverable error
)

func (s AppStatus) Label() string {
	switch s {
	case StatusStandby:
		return "Standby"
	case StatusListening:
		return "Listening…"
	case StatusWaiting:
		return "Processing…"
	case StatusSpeaking:
		return "Speaking…"
	case StatusConnecting:
		return "Connecting…"
	case StatusError:
		return "Error"
	}
	return "Unknown"
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

type LogType int

const (
	LogInfo    LogType = iota
	LogSuccess         // green  "LIVE"
	LogError           // red    "ERR"
	LogWake            // violet "WAKE"
)

type LogEntry struct {
	Msg  string
	Type LogType
	Time string
}

// ─── VAD constants ────────────────────────────────────────────────────────────

const (
	wakeChunks       = 4   // consecutive loud chunks to trigger
	silenceEndChunks = 25  // consecutive silent chunks to end speech
	vadLoudThresh    = 600.0
	vadSilentThresh  = 280.0
)

// ─── Voice options ────────────────────────────────────────────────────────────

var voiceOptions = []struct {
	ID    string
	Label string
	Desc  string
}{
	{"Aoede", "Aoede", "Warm · Natural"},
	{"Charon", "Charon", "Deep · Authoritative"},
	{"Fenrir", "Fenrir", "Clear · Energetic"},
	{"Kore", "Kore", "Soft · Friendly"},
	{"Zephyr", "Zephyr", "Breathy · Calm"},
}

// ─── NovaApp ──────────────────────────────────────────────────────────────────

type NovaApp struct {
	cfg     *AppConfig
	novaCfg *NovaServerConfig
	cfgMu   sync.RWMutex

	audio  *AudioEngine
	wsMu   sync.Mutex
	wsConn *NovaClient

	status     atomic.Int32
	sessionSec int

	loudCount   int
	silentCount int

	// UI
	fyneApp fyne.App
	win     fyne.Window

	// Header widgets
	headerWakeBtn *widget.Button
	headerBadge   *wsBadgeWidget
	wakeListening bool

	// Orb
	orb *OrbWidget

	// Status text under orb
	orbStatusLabel  *canvas.Text
	orbSubLabel     *canvas.Text
	orbSessionLabel *canvas.Text
	endSessionBtn   *widget.Button

	// Telemetry
	telMode    *telCard
	telWake    *telCard
	telMemory  *telCard
	telVoice   *telCard

	// Log
	logMu      sync.Mutex
	logEntries []LogEntry
	logList    *widget.List
	logCountLbl *widget.Label

	// Wake listening active
	wakeListeningMu sync.Mutex
}

// ─── main ────────────────────────────────────────────────────────────────────

func main() {
	cfg := LoadConfig()
	na := &NovaApp{cfg: cfg, logEntries: make([]LogEntry, 0, 100)}
	go na.loadServerConfig()
	na.runUI()
}

func (na *NovaApp) loadServerConfig() {
	for attempt := 0; attempt < 8; attempt++ {
		sc, err := FetchNovaConfig(na.cfg.APIURL)
		if err == nil {
			na.cfgMu.Lock()
			na.novaCfg = sc
			na.cfgMu.Unlock()
			na.addLog("Server config loaded.", LogSuccess)
			na.refreshTelemetry()
			na.refreshHeaderWake()
			return
		}
		na.addLog(fmt.Sprintf("Server not reachable (attempt %d/8)…", attempt+1), LogInfo)
		time.Sleep(4 * time.Second)
	}
	na.addLog("Cannot reach Nova server — using defaults.", LogError)
}

func (na *NovaApp) novaCfgSafe() *NovaServerConfig {
	na.cfgMu.RLock()
	defer na.cfgMu.RUnlock()
	return na.novaCfg
}

func (na *NovaApp) effectiveWakeWord() string {
	if c := na.novaCfgSafe(); c != nil && c.WakeWord != "" {
		return strings.ToLower(c.WakeWord)
	}
	return "nova"
}

// ─── UI Construction ─────────────────────────────────────────────────────────

func (na *NovaApp) runUI() {
	na.fyneApp = app.NewWithID("dev.nova.assistant")
	na.fyneApp.Settings().SetTheme(&novaTheme{})

	na.win = na.fyneApp.NewWindow("Nova Assistant")
	na.win.Resize(fyne.NewSize(860, 640))
	na.win.SetFixedSize(true)
	na.win.CenterOnScreen()
	na.win.SetCloseIntercept(func() {
		na.shutdown()
		na.fyneApp.Quit()
	})

	// ── Build UI sections ──
	header := na.buildHeader()
	left := na.buildOrbPanel()
	right := na.buildRightPanel()
	body := container.NewHSplit(left, right)
	body.SetOffset(0.55)

	root := container.NewBorder(header, na.buildFooter(), nil, nil, body)
	na.win.SetContent(root)

	// Start audio
	na.startAudio()

	// Ticker loops
	go na.animTicker()
	go na.sessionTicker()

	na.win.ShowAndRun()
}

// ─── Header ───────────────────────────────────────────────────────────────────

func (na *NovaApp) buildHeader() fyne.CanvasObject {
	// Logo block
	logoIcon := canvas.NewRectangle(color.NRGBA{R: 138, G: 92, B: 246, A: 220})
	logoIcon.SetMinSize(fyne.NewSize(36, 36))
	logoText := canvas.NewText("Nova", color.White)
	logoText.TextStyle = fyne.TextStyle{Bold: true}
	logoText.TextSize = 17
	osBadge := canvas.NewText(" OS ", color.NRGBA{R: 180, G: 140, B: 255, A: 255})
	osBadge.TextSize = 9
	logoRow := container.NewHBox(logoIcon, container.NewVBox(
		container.NewHBox(logoText, osBadge),
	))

	// Wake toggle button
	na.headerWakeBtn = widget.NewButton("⬤  SLEEPING", na.toggleWakeListen)
	na.headerWakeBtn.Importance = widget.LowImportance

	// Status badge
	na.headerBadge = newWsBadgeWidget(StatusStandby)

	// Settings button
	settingsBtn := widget.NewButton("⚙", func() {
		na.openSettings()
	})
	settingsBtn.Importance = widget.LowImportance

	right := container.NewHBox(na.headerWakeBtn, na.headerBadge, settingsBtn)

	header := container.NewBorder(nil, nil, logoRow, right)
	return container.NewPadded(header)
}

// ─── Orb Panel (left column) ─────────────────────────────────────────────────

func (na *NovaApp) buildOrbPanel() fyne.CanvasObject {
	na.orb = newOrbWidget()
	orbCenter := container.NewCenter(na.orb)

	na.orbStatusLabel = canvas.NewText("Nova Standby", color.White)
	na.orbStatusLabel.TextStyle = fyne.TextStyle{Bold: true}
	na.orbStatusLabel.TextSize = 22
	na.orbStatusLabel.Alignment = fyne.TextAlignCenter

	na.orbSubLabel = canvas.NewText("STANDBY", color.NRGBA{R: 100, G: 100, B: 140, A: 200})
	na.orbSubLabel.TextSize = 10
	na.orbSubLabel.Alignment = fyne.TextAlignCenter

	na.orbSessionLabel = canvas.NewText("", color.NRGBA{R: 80, G: 180, B: 120, A: 220})
	na.orbSessionLabel.TextSize = 11
	na.orbSessionLabel.Alignment = fyne.TextAlignCenter

	connectBtn := widget.NewButton("⏵  Connect to Nova", na.handleConnect)
	connectBtn.Importance = widget.HighImportance

	na.endSessionBtn = widget.NewButton("⏹  END VOICE STREAM", na.endSession)
	na.endSessionBtn.Importance = widget.DangerImportance
	na.endSessionBtn.Hide()

	srvText := canvas.NewText(fmt.Sprintf("→  %s", na.cfg.ServerURL), color.NRGBA{R: 80, G: 80, B: 120, A: 180})
	srvText.TextSize = 10
	srvText.Alignment = fyne.TextAlignCenter

	return container.NewVBox(
		container.NewPadded(orbCenter),
		container.NewPadded(na.orbStatusLabel),
		container.NewPadded(na.orbSubLabel),
		container.NewPadded(na.orbSessionLabel),
		container.NewPadded(connectBtn),
		container.NewPadded(na.endSessionBtn),
		srvText,
	)
}

// ─── Right panel (log + telemetry) ───────────────────────────────────────────

func (na *NovaApp) buildRightPanel() fyne.CanvasObject {
	log := na.buildLogPanel()
	tel := na.buildTelemetryPanel()
	return container.NewVSplit(log, tel)
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

func (na *NovaApp) buildLogPanel() fyne.CanvasObject {
	header := canvas.NewText("⬡  TERMINAL LOGS", color.NRGBA{R: 160, G: 140, B: 220, A: 255})
	header.TextSize = 11

	na.logCountLbl = widget.NewLabel("0")
	na.logCountLbl.TextStyle = fyne.TextStyle{Monospace: true}

	clearBtn := widget.NewButton("Clear", func() {
		na.logMu.Lock()
		na.logEntries = na.logEntries[:0]
		na.logMu.Unlock()
		fyne.Do(func() {
			na.logCountLbl.SetText("0")
			na.logList.Refresh()
		})
	})
	clearBtn.Importance = widget.LowImportance

	topRow := container.NewBorder(nil, nil, header, container.NewHBox(clearBtn, na.logCountLbl))

	na.logList = widget.NewList(
		func() int {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			return len(na.logEntries)
		},
		func() fyne.CanvasObject {
			badge := canvas.NewText("SYS", color.NRGBA{R: 100, G: 150, B: 255, A: 255})
			badge.TextSize = 9
			msg := widget.NewLabel("")
			msg.Wrapping = fyne.TextWrapWord
			msg.TextStyle = fyne.TextStyle{Monospace: true}
			return container.NewHBox(badge, msg)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			na.logMu.Lock()
			defer na.logMu.Unlock()
			if id >= len(na.logEntries) {
				return
			}
			e := na.logEntries[id]
			row := obj.(*fyne.Container)
			badge := row.Objects[0].(*canvas.Text)
			msg := row.Objects[1].(*widget.Label)

			switch e.Type {
			case LogSuccess:
				badge.Text = "LIVE"
				badge.Color = color.NRGBA{R: 80, G: 220, B: 130, A: 255}
			case LogError:
				badge.Text = "ERR "
				badge.Color = color.NRGBA{R: 255, G: 90, B: 90, A: 255}
			case LogWake:
				badge.Text = "WAKE"
				badge.Color = color.NRGBA{R: 180, G: 120, B: 255, A: 255}
			default:
				badge.Text = "SYS "
				badge.Color = color.NRGBA{R: 100, G: 150, B: 255, A: 255}
			}
			msg.SetText(fmt.Sprintf("[%s] %s", e.Time, e.Msg))
		},
	)

	card := widget.NewCard("", "", container.NewBorder(topRow, nil, nil, nil, na.logList))
	return container.NewPadded(card)
}

// ─── Telemetry Panel ──────────────────────────────────────────────────────────

type telCard struct {
	labelTxt *canvas.Text
	valueTxt *canvas.Text
}

func newTelCard(label, value string, labelColor, valueColor color.Color) *telCard {
	lt := canvas.NewText(label, labelColor)
	lt.TextSize = 9
	vt := canvas.NewText(value, valueColor)
	vt.TextSize = 13
	vt.TextStyle = fyne.TextStyle{Bold: true}
	return &telCard{labelTxt: lt, valueTxt: vt}
}

func (t *telCard) widget() fyne.CanvasObject {
	return container.NewVBox(t.labelTxt, t.valueTxt)
}

func (t *telCard) setValue(v string) {
	fyne.Do(func() {
		t.valueTxt.Text = v
		t.valueTxt.Refresh()
	})
}

func (na *NovaApp) buildTelemetryPanel() fyne.CanvasObject {
	header := canvas.NewText("⬡  CORE TELEMETRY", color.NRGBA{R: 160, G: 140, B: 220, A: 255})
	header.TextSize = 11

	dimColor := color.NRGBA{R: 100, G: 100, B: 140, A: 200}
	na.telMode = newTelCard("SYSTEM MODE", "Assistant", dimColor, color.NRGBA{R: 180, G: 140, B: 255, A: 255})
	na.telWake = newTelCard("WAKE PHRASE", `"nova"`, dimColor, color.NRGBA{R: 80, G: 220, B: 230, A: 255})
	na.telMemory = newTelCard("SMART MEMORY", "0 facts", dimColor, color.NRGBA{R: 80, G: 220, B: 140, A: 255})
	na.telVoice = newTelCard("VOICE GATING", "Open (All)", dimColor, color.NRGBA{R: 160, G: 160, B: 180, A: 255})

	grid := container.NewGridWithColumns(2,
		container.NewPadded(na.telMode.widget()),
		container.NewPadded(na.telWake.widget()),
		container.NewPadded(na.telMemory.widget()),
		container.NewPadded(na.telVoice.widget()),
	)

	card := widget.NewCard("", "", container.NewBorder(container.NewPadded(header), nil, nil, nil, grid))
	return container.NewPadded(card)
}

func (na *NovaApp) refreshTelemetry() {
	c := na.novaCfgSafe()
	if c == nil {
		return
	}
	na.telMode.setValue(c.ActiveModeName())
	na.telWake.setValue(fmt.Sprintf("%q", c.WakeWord))
	na.telMemory.setValue(fmt.Sprintf("%d facts", len(c.Memory)))
	if c.VoiceResponseMode == "user" {
		na.telVoice.setValue(fmt.Sprintf("%d Verified", len(c.UserVoiceProfiles)))
	} else {
		na.telVoice.setValue(fmt.Sprintf("%d Profiles (Open)", len(c.UserVoiceProfiles)))
	}
}

func (na *NovaApp) refreshHeaderWake() {
	ww := na.effectiveWakeWord()
	fyne.Do(func() {
		if na.wakeListening {
			na.headerWakeBtn.SetText(fmt.Sprintf("⬤  HEARING %q", strings.ToUpper(ww)))
		}
	})
}

// ─── Footer ────────────────────────────────────────────────────────────────────

func (na *NovaApp) buildFooter() fyne.CanvasObject {
	left := canvas.NewText("Nova v3.1  ·  Gemini Live  ·  Go+Fyne Desktop", color.NRGBA{R: 80, G: 80, B: 120, A: 180})
	left.TextSize = 10

	na.headerBadge = newWsBadgeWidget(StatusStandby)

	return container.NewBorder(nil, nil, container.NewPadded(left), container.NewPadded(na.headerBadge))
}

// ─── Connect / Disconnect ─────────────────────────────────────────────────────

func (na *NovaApp) handleConnect() {
	st := AppStatus(na.status.Load())
	if st == StatusConnecting {
		return
	}
	if na.wsConn != nil && na.wsConn.IsConnected() {
		na.endSession()
		return
	}
	na.addLog(fmt.Sprintf("Connecting to %s…", na.cfg.ServerURL), LogInfo)
	na.setStatus(StatusConnecting)
	go na.connect()
}

func (na *NovaApp) connect() {
	client := NewNovaClient(
		na.onAudioReceived,
		na.onActionReceived,
		na.onInterrupted,
		na.onServerError,
		na.onConnected,
		na.onDisconnected,
	)
	if err := client.Connect(na.cfg.ServerURL); err != nil {
		na.addLog(fmt.Sprintf("Connection failed: %v", err), LogError)
		na.setStatus(StatusError)
		return
	}
	na.wsMu.Lock()
	na.wsConn = client
	na.wsMu.Unlock()
}

func (na *NovaApp) onConnected() {
	na.sessionSec = 0
	ww := na.effectiveWakeWord()
	c := na.novaCfgSafe()
	userName := "User"
	if c != nil && c.UserName != "" {
		userName = c.UserName
	}
	na.addLog(fmt.Sprintf("Connected! Say %q to begin, %s.", ww, userName), LogSuccess)
	na.setStatus(StatusStandby)
	fyne.Do(func() {
		na.endSessionBtn.Show()
	})
	// Auto-start wake listening
	na.startWakeListen()
}

func (na *NovaApp) onDisconnected() {
	na.addLog("Session closed.", LogInfo)
	na.setStatus(StatusStandby)
	na.wsMu.Lock()
	na.wsConn = nil
	na.wsMu.Unlock()
	fyne.Do(func() {
		na.endSessionBtn.Hide()
		na.orbSessionLabel.Text = ""
		na.orbSessionLabel.Refresh()
	})
}

func (na *NovaApp) onAudioReceived(pcm []byte) {
	na.audio.QueuePlayback(pcm)
	if AppStatus(na.status.Load()) != StatusSpeaking {
		na.setStatus(StatusSpeaking)
		go na.watchPlaybackDrain()
	}
}

func (na *NovaApp) onInterrupted() {
	na.addLog("Response interrupted.", LogInfo)
	na.audio.ClearPlayback()
	na.setStatus(StatusStandby)
}

func (na *NovaApp) onActionReceived(action string) {
	switch action {
	case "endSession":
		na.addLog("Nova ended the session.", LogInfo)
		na.audio.ClearPlayback()
		time.AfterFunc(1200*time.Millisecond, func() { na.endSession() })
	}
}

func (na *NovaApp) onServerError(errStr string) {
	na.addLog(fmt.Sprintf("Server error: %s", errStr), LogError)
	na.setStatus(StatusError)
}

func (na *NovaApp) endSession() {
	na.wsMu.Lock()
	ws := na.wsConn
	na.wsMu.Unlock()
	if ws != nil {
		ws.Disconnect()
	}
	na.audio.ClearPlayback()
	na.stopWakeListen()
	na.setStatus(StatusStandby)
	na.loudCount = 0
	na.silentCount = 0
	fyne.Do(func() {
		na.endSessionBtn.Hide()
		na.orbSessionLabel.Text = ""
		na.orbSessionLabel.Refresh()
	})
}

// ─── Wake word listening toggle ───────────────────────────────────────────────

func (na *NovaApp) toggleWakeListen() {
	na.wakeListeningMu.Lock()
	defer na.wakeListeningMu.Unlock()
	if na.wakeListening {
		na.stopWakeListenLocked()
	} else {
		na.startWakeListenLocked()
	}
}

func (na *NovaApp) startWakeListen() {
	na.wakeListeningMu.Lock()
	defer na.wakeListeningMu.Unlock()
	na.startWakeListenLocked()
}

func (na *NovaApp) stopWakeListen() {
	na.wakeListeningMu.Lock()
	defer na.wakeListeningMu.Unlock()
	na.stopWakeListenLocked()
}

func (na *NovaApp) startWakeListenLocked() {
	ww := na.effectiveWakeWord()
	na.wakeListening = true
	fyne.Do(func() {
		na.headerWakeBtn.SetText(fmt.Sprintf("⬤  HEARING %q", strings.ToUpper(ww)))
	})
	na.addLog(fmt.Sprintf("Wake word listening active — say %q", ww), LogInfo)
}

func (na *NovaApp) stopWakeListenLocked() {
	na.wakeListening = false
	fyne.Do(func() {
		na.headerWakeBtn.SetText("⬤  SLEEPING")
	})
	na.addLog("Wake word listening paused.", LogInfo)
}

// ─── Mic processing ───────────────────────────────────────────────────────────

func (na *NovaApp) startAudio() {
	na.audio = NewAudioEngine(na.onMicChunk)
	if err := na.audio.StartCapture(); err != nil {
		na.addLog(fmt.Sprintf("Mic error: %v", err), LogError)
	} else {
		na.addLog("Microphone ready (16 kHz).", LogInfo)
	}
	if err := na.audio.StartPlayback(); err != nil {
		na.addLog(fmt.Sprintf("Playback error: %v", err), LogError)
	} else {
		na.addLog("Speaker ready (24 kHz).", LogInfo)
	}
}

func (na *NovaApp) onMicChunk(samples []int16) {
	rms := RMS(samples)
	energy := float32(math.Min(rms/4000.0, 1.0))
	fyne.Do(func() { na.orb.setEnergy(energy) })

	na.wsMu.Lock()
	ws := na.wsConn
	na.wsMu.Unlock()

	st := AppStatus(na.status.Load())

	switch st {
	case StatusStandby:
		if ws == nil || !na.wakeListening {
			return
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
			na.setStatus(StatusListening)
			na.addLog("Voice detected — streaming to Nova…", LogWake)
		}

	case StatusListening:
		if ws == nil {
			na.setStatus(StatusStandby)
			return
		}
		if err := ws.SendAudio(Int16ToBytes(samples)); err != nil {
			log.Printf("[WS] SendAudio: %v", err)
			na.setStatus(StatusStandby)
			return
		}
		if rms < vadSilentThresh {
			na.silentCount++
		} else {
			na.silentCount = 0
		}
		if na.silentCount >= silenceEndChunks {
			na.silentCount = 0
			na.setStatus(StatusWaiting)
			na.addLog("End of speech — waiting for Nova…", LogInfo)
		}
	}
}

func (na *NovaApp) watchPlaybackDrain() {
	for {
		time.Sleep(200 * time.Millisecond)
		if AppStatus(na.status.Load()) != StatusSpeaking {
			return
		}
		before := len(na.audio.playbackBuf)
		time.Sleep(700 * time.Millisecond)
		after := len(na.audio.playbackBuf)
		if before == 0 && after == 0 {
			if AppStatus(na.status.Load()) == StatusSpeaking {
				na.setStatus(StatusStandby)
				na.loudCount = 0
				na.silentCount = 0
			}
			return
		}
	}
}

// ─── Settings dialog ─────────────────────────────────────────────────────────

func (na *NovaApp) openSettings() {
	c := na.novaCfgSafe()
	if c == nil {
		dialog.ShowInformation("Settings", "Nova server not reachable yet.\nPlease connect first.", na.win)
		return
	}

	// Work on a copy
	cfgCopy := *c
	modesCopy := append([]Mode(nil), c.Modes...)
	memoryCopy := append([]MemoryEntry(nil), c.Memory...)
	cfgCopy.Modes = modesCopy
	cfgCopy.Memory = memoryCopy

	tabs := container.NewAppTabs(
		container.NewTabItem("Profile", na.buildProfileTab(&cfgCopy)),
		container.NewTabItem("Voice", na.buildVoiceTab(&cfgCopy)),
		container.NewTabItem("Modes", na.buildModesTab(&cfgCopy)),
		container.NewTabItem("Integrations", na.buildIntegrationsTab(&cfgCopy)),
		container.NewTabItem("Memory", na.buildMemoryTab(&cfgCopy)),
	)
	tabs.SetTabLocation(container.TabLocationTop)

	saveBtn := widget.NewButton("Save Changes", func() {})
	saveBtn.Importance = widget.HighImportance

	content := container.NewBorder(nil, container.NewPadded(saveBtn), nil, nil, container.NewPadded(tabs))

	dlg := dialog.NewCustom("Nova Settings", "Close", content, na.win)
	dlg.Resize(fyne.NewSize(620, 520))

	saveBtn.OnTapped = func() {
		err := SaveNovaConfig(na.cfg.APIURL, &cfgCopy)
		if err != nil {
			dialog.ShowError(err, na.win)
			return
		}
		na.cfgMu.Lock()
		na.novaCfg = &cfgCopy
		na.cfgMu.Unlock()
		na.refreshTelemetry()
		na.refreshHeaderWake()
		na.addLog("Settings saved.", LogSuccess)
		dlg.Hide()
	}

	dlg.Show()
}

// ── Profile tab ───────────────────────────────────────────────────────────────

func (na *NovaApp) buildProfileTab(cfg *NovaServerConfig) fyne.CanvasObject {
	nameEntry := widget.NewEntry()
	nameEntry.SetText(cfg.UserName)
	nameEntry.OnChanged = func(v string) { cfg.UserName = v }

	wakeEntry := widget.NewEntry()
	wakeEntry.SetText(cfg.WakeWord)
	wakeEntry.OnChanged = func(v string) { cfg.WakeWord = strings.ToLower(strings.TrimSpace(v)) }

	greetEntry := widget.NewEntry()
	greetEntry.SetText(cfg.GreetingPhrase)
	greetEntry.SetPlaceHolder("Hey {name}!")
	greetEntry.OnChanged = func(v string) { cfg.GreetingPhrase = v }

	voiceModeGroup := widget.NewRadioGroup([]string{"All Voices", "Registered Only"}, func(v string) {
		if v == "Registered Only" {
			cfg.VoiceResponseMode = "user"
		} else {
			cfg.VoiceResponseMode = "all"
		}
	})
	if cfg.VoiceResponseMode == "user" {
		voiceModeGroup.SetSelected("Registered Only")
	} else {
		voiceModeGroup.SetSelected("All Voices")
	}

	return container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("Your Name", nameEntry),
			widget.NewFormItem("Wake Word", wakeEntry),
			widget.NewFormItem("Greeting Phrase", greetEntry),
			widget.NewFormItem("Voice Response Mode", voiceModeGroup),
		),
	)
}

// ── Voice tab ─────────────────────────────────────────────────────────────────

func (na *NovaApp) buildVoiceTab(cfg *NovaServerConfig) fyne.CanvasObject {
	labels := make([]string, len(voiceOptions))
	for i, v := range voiceOptions {
		labels[i] = fmt.Sprintf("%s — %s", v.Label, v.Desc)
	}
	sel := widget.NewSelect(labels, func(v string) {
		for _, vo := range voiceOptions {
			if strings.HasPrefix(v, vo.Label) {
				cfg.VoiceName = vo.ID
				break
			}
		}
	})
	// Select current
	for i, vo := range voiceOptions {
		if vo.ID == cfg.VoiceName {
			sel.SetSelectedIndex(i)
			break
		}
	}

	return container.NewVBox(
		widget.NewLabel("Choose Nova's voice:"),
		sel,
		widget.NewLabel("Changes take effect on the next session."),
	)
}

// ── Modes tab ─────────────────────────────────────────────────────────────────

func (na *NovaApp) buildModesTab(cfg *NovaServerConfig) fyne.CanvasObject {
	var cards []fyne.CanvasObject
	for i := range cfg.Modes {
		m := &cfg.Modes[i]
		isActive := m.ID == cfg.ActiveModeID
		activeLbl := ""
		if isActive {
			activeLbl = " ✓ Active"
		}
		btn := widget.NewButton(fmt.Sprintf("%s %s%s", m.Emoji, m.Name, activeLbl), nil)
		if isActive {
			btn.Importance = widget.HighImportance
		}
		btnCopy := btn
		mCopy := m
		btnCopy.OnTapped = func() {
			cfg.ActiveModeID = mCopy.ID
			// Refresh labels
			for _, obj := range cards {
				if b, ok := obj.(*widget.Button); ok {
					b.Importance = widget.LowImportance
					b.Refresh()
				}
			}
			btnCopy.Importance = widget.HighImportance
			btnCopy.Refresh()
		}
		desc := widget.NewLabel(m.Description)
		desc.Wrapping = fyne.TextWrapWord
		cards = append(cards, container.NewVBox(btnCopy, desc))
	}
	scroll := container.NewVBox(cards...)
	return container.NewScroll(scroll)
}

// ── Integrations tab ──────────────────────────────────────────────────────────

func (na *NovaApp) buildIntegrationsTab(cfg *NovaServerConfig) fyne.CanvasObject {
	godoCheck := widget.NewCheck("Enable GoDo CLI Task Manager", func(v bool) {
		cfg.Integrations.GodoEnabled = v
	})
	godoCheck.SetChecked(cfg.Integrations.GodoEnabled)

	obsCheck := widget.NewCheck("Enable Obsidian Vault Integration", func(v bool) {
		cfg.Integrations.ObsidianEnabled = v
	})
	obsCheck.SetChecked(cfg.Integrations.ObsidianEnabled)

	obsPath := widget.NewEntry()
	obsPath.SetText(cfg.Integrations.ObsidianPath)
	obsPath.SetPlaceHolder("/home/user/ObsidianVault")
	obsPath.OnChanged = func(v string) { cfg.Integrations.ObsidianPath = v }

	return container.NewVBox(
		godoCheck,
		widget.NewSeparator(),
		obsCheck,
		widget.NewFormItem("Vault Path", obsPath).Widget,
	)
}

// ── Memory tab ────────────────────────────────────────────────────────────────

func (na *NovaApp) buildMemoryTab(cfg *NovaServerConfig) fyne.CanvasObject {
	countLbl := widget.NewLabel(fmt.Sprintf("%d memories stored", len(cfg.Memory)))

	clearBtn := widget.NewButton("Clear All Memories", func() {
		dialog.ShowConfirm("Clear Memory", "This will delete all smart memories. Continue?", func(ok bool) {
			if ok {
				_ = ClearMemory(na.cfg.APIURL)
				cfg.Memory = nil
				countLbl.SetText("0 memories stored")
				na.addLog("Smart memory cleared.", LogInfo)
				na.telMemory.setValue("0 facts")
			}
		}, na.win)
	})
	clearBtn.Importance = widget.DangerImportance

	var memItems []fyne.CanvasObject
	for _, m := range cfg.Memory {
		entry := m
		lbl := widget.NewLabel(fmt.Sprintf("[%s] %s", entry.Category, entry.Content))
		lbl.Wrapping = fyne.TextWrapWord
		memItems = append(memItems, lbl)
	}

	var memScroll fyne.CanvasObject
	if len(memItems) == 0 {
		memScroll = widget.NewLabel("No memories yet — Nova learns from your conversations.")
	} else {
		memScroll = container.NewScroll(container.NewVBox(memItems...))
	}

	return container.NewVBox(
		countLbl,
		clearBtn,
		widget.NewSeparator(),
		memScroll,
	)
}

// ─── State & UI updates ───────────────────────────────────────────────────────

func (na *NovaApp) setStatus(s AppStatus) {
	na.status.Store(int32(s))

	c := na.novaCfgSafe()
	userName := "User"
	ww := na.effectiveWakeWord()
	if c != nil && c.UserName != "" {
		userName = c.UserName
	}

	var mainText, subText string
	switch s {
	case StatusStandby:
		mainText = fmt.Sprintf(`Say "%s"`, ww)
		subText = "BACKGROUND LISTENER ENGAGED"
	case StatusListening:
		mainText = fmt.Sprintf("Listening, %s…", userName)
		subText = "VOICE STREAM ACTIVE"
	case StatusWaiting:
		mainText = "Processing…"
		subText = "WAITING FOR NOVA"
	case StatusSpeaking:
		mainText = fmt.Sprintf("Listening, %s…", userName)
		subText = "SESSION ACTIVE"
	case StatusConnecting:
		mainText = "Waking assistant…"
		subText = "CONNECTING"
	case StatusError:
		mainText = "Error"
		subText = "CHECK SERVER"
	}

	fyne.Do(func() {
		na.orbStatusLabel.Text = mainText
		na.orbStatusLabel.Refresh()
		na.orbSubLabel.Text = subText
		na.orbSubLabel.Refresh()
		na.orb.setState(s)
		if na.headerBadge != nil {
			na.headerBadge.setStatus(s)
		}
	})
}

func (na *NovaApp) addLog(msg string, t LogType) {
	ts := time.Now().Format("15:04:05")
	log.Printf("[%s] %s", ts, msg)
	na.logMu.Lock()
	na.logEntries = append(na.logEntries, LogEntry{Msg: msg, Type: t, Time: ts})
	if len(na.logEntries) > 100 {
		na.logEntries = na.logEntries[len(na.logEntries)-100:]
	}
	n := len(na.logEntries)
	na.logMu.Unlock()
	fyne.Do(func() {
		if na.logCountLbl != nil {
			na.logCountLbl.SetText(fmt.Sprintf("%d", n))
		}
		if na.logList != nil {
			na.logList.Refresh()
			if n > 0 {
				na.logList.ScrollTo(n - 1)
			}
		}
	})
}

func (na *NovaApp) shutdown() {
	na.addLog("Shutting down…", LogInfo)
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

// ─── Animation & session tickers ─────────────────────────────────────────────

func (na *NovaApp) animTicker() {
	t := time.NewTicker(50 * time.Millisecond)
	defer t.Stop()
	for range t.C {
		fyne.Do(func() { na.orb.tick() })
	}
}

func (na *NovaApp) sessionTicker() {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for range t.C {
		st := AppStatus(na.status.Load())
		if st == StatusListening || st == StatusSpeaking || st == StatusWaiting {
			na.sessionSec++
			sec := na.sessionSec
			fyne.Do(func() {
				na.orbSessionLabel.Text = fmt.Sprintf("SESSION ACTIVE · %02d:%02d", sec/60, sec%60)
				na.orbSessionLabel.Refresh()
			})
		}
	}
}

// ─── Orb widget ───────────────────────────────────────────────────────────────

type OrbWidget struct {
	widget.BaseWidget
	energy float32
	phase  float64
	status AppStatus
	circle *canvas.Circle
	// Audio bar rects (shown when active)
	bars    [7]*canvas.Rectangle
	showBars bool
}

func newOrbWidget() *OrbWidget {
	o := &OrbWidget{}
	o.ExtendBaseWidget(o)
	o.circle = canvas.NewCircle(orbFill(StatusStandby, 0))
	o.circle.StrokeWidth = 2
	for i := range o.bars {
		o.bars[i] = canvas.NewRectangle(color.NRGBA{R: 80, G: 220, B: 160, A: 200})
	}
	return o
}

func (o *OrbWidget) setEnergy(e float32) { o.energy = e; o.Refresh() }
func (o *OrbWidget) setState(s AppStatus) { o.status = s; o.showBars = (s == StatusListening || s == StatusSpeaking); o.Refresh() }
func (o *OrbWidget) tick() {
	o.phase += 0.05
	if o.phase > 2*math.Pi {
		o.phase -= 2 * math.Pi
	}
	o.Refresh()
}

func (o *OrbWidget) CreateRenderer() fyne.WidgetRenderer {
	objs := []fyne.CanvasObject{o.circle}
	for _, b := range o.bars {
		objs = append(objs, b)
	}
	return &orbRenderer{orb: o, objs: objs}
}

func (o *OrbWidget) MinSize() fyne.Size { return fyne.NewSize(200, 200) }

type orbRenderer struct {
	orb  *OrbWidget
	objs []fyne.CanvasObject
}

func (r *orbRenderer) Layout(size fyne.Size) {
	o := r.orb
	pulse := float32(math.Sin(o.phase)*0.10 + 0.90)
	cs := float32(180) * pulse
	switch o.status {
	case StatusListening:
		cs = 170 + o.energy*40
	case StatusSpeaking:
		cs = 170 + float32(math.Abs(math.Sin(o.phase)))*35
	case StatusWaiting:
		cs = 170 + float32(math.Sin(o.phase)*5+5)
	case StatusConnecting:
		cs = 170 + float32(math.Sin(o.phase*2)*10+10)
	}
	if cs > size.Width {
		cs = size.Width
	}
	cx := (size.Width - cs) / 2
	cy := (size.Height - cs) / 2
	o.circle.Move(fyne.NewPos(cx, cy))
	o.circle.Resize(fyne.NewSize(cs, cs))
	o.circle.FillColor = orbFill(o.status, float64(o.energy))
	o.circle.StrokeColor = orbStroke(o.status)

	// Audio bars (centered inside orb)
	barW := float32(8)
	gap := float32(6)
	totalW := float32(7)*barW + float32(6)*gap
	startX := size.Width/2 - totalW/2
	centerY := size.Height / 2
	heights := [7]float32{0.4, 0.6, 0.9, 1.0, 0.9, 0.6, 0.4}
	for i, b := range o.bars {
		if !o.showBars {
			b.Hide()
			continue
		}
		b.Show()
		var h float32
		if o.status == StatusListening {
			h = heights[i] * (20 + o.energy*50) * float32(math.Abs(math.Sin(o.phase+float64(i)*0.5))+0.3)
		} else {
			h = heights[i] * 30 * float32(math.Abs(math.Sin(o.phase+float64(i)*0.5))+0.3)
		}
		b.Move(fyne.NewPos(startX+float32(i)*(barW+gap), centerY-h/2))
		b.Resize(fyne.NewSize(barW, h))
	}
}

func (r *orbRenderer) MinSize() fyne.Size         { return r.orb.MinSize() }
func (r *orbRenderer) Refresh()                    { r.Layout(r.orb.Size()); canvas.Refresh(r.orb) }
func (r *orbRenderer) Objects() []fyne.CanvasObject { return r.objs }
func (r *orbRenderer) Destroy()                    {}

func orbFill(s AppStatus, energy float64) color.Color {
	switch s {
	case StatusListening:
		g := uint8(60 + energy*140)
		return color.NRGBA{R: 50, G: g, B: 255, A: 210}
	case StatusWaiting:
		return color.NRGBA{R: 100, G: 120, B: 255, A: 180}
	case StatusSpeaking:
		return color.NRGBA{R: 138, G: 99, B: 255, A: 220}
	case StatusConnecting:
		return color.NRGBA{R: 255, G: 180, B: 50, A: 180}
	case StatusError:
		return color.NRGBA{R: 255, G: 80, B: 80, A: 200}
	default:
		return color.NRGBA{R: 40, G: 40, B: 90, A: 160}
	}
}

func orbStroke(s AppStatus) color.Color {
	switch s {
	case StatusListening:
		return color.NRGBA{R: 80, G: 160, B: 255, A: 255}
	case StatusWaiting:
		return color.NRGBA{R: 120, G: 140, B: 255, A: 220}
	case StatusSpeaking:
		return color.NRGBA{R: 180, G: 130, B: 255, A: 255}
	case StatusConnecting:
		return color.NRGBA{R: 255, G: 200, B: 80, A: 255}
	case StatusError:
		return color.NRGBA{R: 255, G: 100, B: 100, A: 255}
	default:
		return color.NRGBA{R: 70, G: 70, B: 130, A: 180}
	}
}

// ─── WS Badge widget (LIVE / STANDBY / CONNECTING) ───────────────────────────

type wsBadgeWidget struct {
	widget.BaseWidget
	status AppStatus
	rect   *canvas.Rectangle
	text   *canvas.Text
}

func newWsBadgeWidget(s AppStatus) *wsBadgeWidget {
	w := &wsBadgeWidget{status: s}
	w.ExtendBaseWidget(w)
	w.rect = canvas.NewRectangle(color.NRGBA{R: 30, G: 30, B: 60, A: 200})
	w.text = canvas.NewText("STANDBY", color.NRGBA{R: 120, G: 120, B: 160, A: 255})
	w.text.TextSize = 11
	w.text.TextStyle = fyne.TextStyle{Bold: true}
	return w
}

func (w *wsBadgeWidget) setStatus(s AppStatus) {
	w.status = s
	switch s {
	case StatusListening, StatusSpeaking, StatusWaiting:
		w.text.Text = "● LIVE"
		w.text.Color = color.NRGBA{R: 80, G: 220, B: 130, A: 255}
	case StatusConnecting:
		w.text.Text = "◉ WAKING"
		w.text.Color = color.NRGBA{R: 255, G: 200, B: 80, A: 255}
	default:
		w.text.Text = "○ STANDBY"
		w.text.Color = color.NRGBA{R: 120, G: 120, B: 160, A: 255}
	}
	w.Refresh()
}

func (w *wsBadgeWidget) CreateRenderer() fyne.WidgetRenderer {
	return widget.NewSimpleRenderer(container.NewStack(w.rect, container.NewPadded(w.text)))
}

func (w *wsBadgeWidget) MinSize() fyne.Size { return fyne.NewSize(80, 28) }

// ─── Nova Dark Theme ──────────────────────────────────────────────────────────

type novaTheme struct{}

func (t *novaTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return color.NRGBA{R: 6, G: 6, B: 16, A: 255}
	case theme.ColorNameForeground:
		return color.NRGBA{R: 225, G: 225, B: 255, A: 255}
	case theme.ColorNameButton:
		return color.NRGBA{R: 22, G: 22, B: 50, A: 255}
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 138, G: 92, B: 246, A: 255}
	case theme.ColorNameHover:
		return color.NRGBA{R: 50, G: 38, B: 90, A: 255}
	case theme.ColorNameFocus:
		return color.NRGBA{R: 100, G: 60, B: 200, A: 255}
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 16, G: 16, B: 38, A: 255}
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 80, G: 60, B: 140, A: 120}
	case theme.ColorNameSeparator:
		return color.NRGBA{R: 40, G: 40, B: 70, A: 255}
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 80, G: 80, B: 100, A: 200}
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 100, G: 100, B: 130, A: 180}
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
	case theme.SizeNameScrollBar:
		return 6
	}
	return theme.DefaultTheme().Size(name)
}
