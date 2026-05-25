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

// AppConfig holds runtime configuration for the desktop client
type AppConfig struct {
	ServerURL  string // e.g. "ws://localhost:22222/live"
	APIURL     string // e.g. "http://localhost:22222"
	ServerPort int
}

// NovaServerConfig mirrors the relevant parts of the backend /api/config response
type NovaServerConfig struct {
	UserName      string `json:"userName"`
	WakeWord      string `json:"wakeWord"`
	StopWord      string `json:"stopWord"`
	VoiceName     string `json:"voiceName"`
	GreetingPhrase string `json:"greetingPhrase"`
	ActiveModeId  string `json:"activeModeId"`
}

// LoadConfig reads PORT from the parent project's .env file
func LoadConfig() *AppConfig {
	// Try loading from parent directory's .env (the main web project)
	parentEnv := filepath.Join("..", ".env")
	localEnv := ".env"

	_ = godotenv.Load(localEnv)
	_ = godotenv.Load(parentEnv)

	portStr := os.Getenv("PORT")
	port := 22222
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	// Allow override via NOVA_SERVER_URL env var
	serverURL := os.Getenv("NOVA_SERVER_URL")
	apiURL := os.Getenv("NOVA_API_URL")

	if serverURL == "" {
		serverURL = fmt.Sprintf("ws://localhost:%d/live", port)
	}
	if apiURL == "" {
		apiURL = fmt.Sprintf("http://localhost:%d", port)
	}

	// Ensure ws:// scheme
	if strings.HasPrefix(serverURL, "http://") {
		serverURL = "ws://" + serverURL[7:]
	}
	if !strings.HasSuffix(serverURL, "/live") {
		serverURL += "/live"
	}

	return &AppConfig{
		ServerURL:  serverURL,
		APIURL:     apiURL,
		ServerPort: port,
	}
}

// FetchNovaConfig fetches the assistant configuration from the running server
func FetchNovaConfig(apiURL string) (*NovaServerConfig, error) {
	resp, err := http.Get(apiURL + "/api/config")
	if err != nil {
		return nil, fmt.Errorf("cannot reach Nova server at %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read config response: %w", err)
	}

	var cfg NovaServerConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Defaults
	if cfg.WakeWord == "" {
		cfg.WakeWord = "nova"
	}
	if cfg.StopWord == "" {
		cfg.StopWord = "stop"
	}
	if cfg.UserName == "" {
		cfg.UserName = "User"
	}

	return &cfg, nil
}
