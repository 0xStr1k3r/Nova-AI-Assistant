package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// AppConfig holds runtime configuration for the desktop client.
type AppConfig struct {
	ServerURL  string
	APIURL     string
	ServerPort int
}

// ── Full mirror of the server's NovaConfig type ────────────────────────────

type Mode struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Instruction string `json:"instruction"`
	IsCustom    bool   `json:"isCustom"`
	Emoji       string `json:"emoji"`
}

type MemoryEntry struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	Category  string `json:"category"`
	Importance int   `json:"importance"`
	Timestamp string `json:"timestamp"`
}

type VoiceProfile struct {
	Name      string    `json:"name"`
	Embedding []float64 `json:"embedding"`
}

type IntegrationsConfig struct {
	GodoEnabled    bool   `json:"godoEnabled"`
	ObsidianEnabled bool  `json:"obsidianEnabled"`
	ObsidianPath   string `json:"obsidianPath"`
}

type NovaServerConfig struct {
	WakeWord          string             `json:"wakeWord"`
	UserName          string             `json:"userName"`
	ActiveModeID      string             `json:"activeModeId"`
	Modes             []Mode             `json:"modes"`
	Memory            []MemoryEntry      `json:"memory"`
	VoiceName         string             `json:"voiceName"`
	VoiceResponseMode string             `json:"voiceResponseMode"` // "all" | "user"
	UserVoiceProfiles []VoiceProfile     `json:"userVoiceProfiles"`
	GreetingPhrase    string             `json:"greetingPhrase"`
	Integrations      IntegrationsConfig `json:"integrations"`
	// StopWord is a local-only field not in the server JSON — kept for compatibility
	StopWord string `json:"stopWord,omitempty"`
}

// ActiveModeName returns the display name of the currently active mode.
func (c *NovaServerConfig) ActiveModeName() string {
	for _, m := range c.Modes {
		if m.ID == c.ActiveModeID {
			return m.Emoji + " " + m.Name
		}
	}
	return "Assistant"
}

// ── Config loading ─────────────────────────────────────────────────────────

// LoadConfig reads PORT from the parent project's .env file.
func LoadConfig() *AppConfig {
	_ = godotenv.Load(".env")
	_ = godotenv.Load(filepath.Join("..", ".env"))

	port := 22222
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil && p > 0 {
		port = p
	}

	serverURL := os.Getenv("NOVA_SERVER_URL")
	apiURL := os.Getenv("NOVA_API_URL")
	if serverURL == "" {
		serverURL = fmt.Sprintf("ws://localhost:%d/live", port)
	}
	if apiURL == "" {
		apiURL = fmt.Sprintf("http://localhost:%d", port)
	}
	if strings.HasPrefix(serverURL, "http://") {
		serverURL = "ws://" + serverURL[7:]
	}
	if !strings.HasSuffix(serverURL, "/live") {
		serverURL += "/live"
	}
	return &AppConfig{ServerURL: serverURL, APIURL: apiURL, ServerPort: port}
}

// FetchNovaConfig fetches the full config from the running server.
func FetchNovaConfig(apiURL string) (*NovaServerConfig, error) {
	resp, err := http.Get(apiURL + "/api/config")
	if err != nil {
		return nil, fmt.Errorf("cannot reach Nova server: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var cfg NovaServerConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		return nil, err
	}
	if cfg.WakeWord == "" {
		cfg.WakeWord = "nova"
	}
	if cfg.UserName == "" {
		cfg.UserName = "User"
	}
	if cfg.VoiceName == "" {
		cfg.VoiceName = "Aoede"
	}
	if cfg.VoiceResponseMode == "" {
		cfg.VoiceResponseMode = "all"
	}
	return &cfg, nil
}

// SaveNovaConfig POSTs the full config back to the server.
func SaveNovaConfig(apiURL string, cfg *NovaServerConfig) error {
	body, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	resp, err := http.Post(apiURL+"/api/config", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, string(rb))
	}
	return nil
}

// ClearMemory calls the server memory clear endpoint.
func ClearMemory(apiURL string) error {
	resp, err := http.Post(apiURL+"/api/memory/clear", "application/json", nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
