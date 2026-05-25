package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// WsMessage represents messages sent to/from the Nova server
type WsMessage struct {
	Audio       string `json:"audio,omitempty"`
	Text        string `json:"text,omitempty"`
	Interrupted bool   `json:"interrupted,omitempty"`
	Action      string `json:"action,omitempty"`
	Error       string `json:"error,omitempty"`
}

// NovaClient manages the WebSocket connection to the Nova server
type NovaClient struct {
	conn      *websocket.Conn
	mu        sync.Mutex
	connected bool
	onAudio   func(pcm []byte)       // called when audio arrives from server
	onAction  func(action string)    // called for server-sent actions (endSession, etc.)
	onError   func(err string)       // called on server errors
	onConnect func()                 // called when connection opens
	onClose   func()                 // called when connection closes
	done      chan struct{}
}

// NewNovaClient creates a new WebSocket client (not yet connected)
func NewNovaClient(
	onAudio func([]byte),
	onAction func(string),
	onError func(string),
	onConnect func(),
	onClose func(),
) *NovaClient {
	return &NovaClient{
		onAudio:   onAudio,
		onAction:  onAction,
		onError:   onError,
		onConnect: onConnect,
		onClose:   onClose,
		done:      make(chan struct{}),
	}
}

// Connect establishes the WebSocket connection to the Nova server
func (c *NovaClient) Connect(serverURL string) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.Dial(serverURL, nil)
	if err != nil {
		return err
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.done = make(chan struct{})
	c.mu.Unlock()

	if c.onConnect != nil {
		c.onConnect()
	}

	go c.readLoop()
	return nil
}

// readLoop processes incoming messages from the server
func (c *NovaClient) readLoop() {
	defer func() {
		c.mu.Lock()
		c.connected = false
		c.mu.Unlock()
		if c.onClose != nil {
			c.onClose()
		}
		close(c.done)
	}()

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			return
		}

		var msg WsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[WS] Failed to parse message: %v", err)
			continue
		}

		if msg.Audio != "" {
			pcm, err := base64.StdEncoding.DecodeString(msg.Audio)
			if err != nil {
				log.Printf("[WS] Failed to decode audio: %v", err)
				continue
			}
			if c.onAudio != nil {
				c.onAudio(pcm)
			}
		}

		if msg.Action != "" {
			if c.onAction != nil {
				c.onAction(msg.Action)
			}
		}

		if msg.Error != "" {
			log.Printf("[WS] Server error: %s", msg.Error)
			if c.onError != nil {
				c.onError(msg.Error)
			}
		}
	}
}

// SendAudio encodes PCM audio as base64 and sends it to the server
func (c *NovaClient) SendAudio(pcm []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.conn == nil {
		return nil
	}

	b64 := base64.StdEncoding.EncodeToString(pcm)
	msg := WsMessage{Audio: b64}
	data, _ := json.Marshal(msg)
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// SendText sends a text message to the server
func (c *NovaClient) SendText(text string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.conn == nil {
		return nil
	}

	msg := WsMessage{Text: text}
	data, _ := json.Marshal(msg)
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// Disconnect cleanly closes the WebSocket connection
func (c *NovaClient) Disconnect() {
	c.mu.Lock()
	conn := c.conn
	c.connected = false
	c.mu.Unlock()

	if conn != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		conn.Close()
	}
}

// IsConnected returns whether the WebSocket is currently open
func (c *NovaClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// Wait blocks until the connection is closed
func (c *NovaClient) Wait() {
	<-c.done
}
