package main

// #cgo pkg-config: portaudio-2.0
import "C"

import (
	"encoding/binary"
	"log"
	"math"
	"sync"
	"time"

	"github.com/gordonklaus/portaudio"
)

const (
	// Capture: 16kHz mono 16-bit PCM — what Gemini Live API expects
	SampleRate      = 16000
	Channels        = 1
	FramesPerBuf    = 1600 // 100ms per chunk at 16kHz

	// Playback: 24kHz mono 16-bit PCM — what Gemini Live API returns
	PlaybackSampleRate = 24000
	PlaybackFrames     = 2400 // 100ms playback chunks at 24kHz

	// Voice activity detection thresholds
	rmsActive   = 400  // RMS above this = voice is present
	rmsSilence  = 250  // RMS below this counts as silence
)

// AudioEngine manages microphone capture and speaker playback via PortAudio.
type AudioEngine struct {
	mu sync.Mutex

	capturing bool
	playing   bool

	captureStop  chan struct{}
	playbackStop chan struct{}
	// Buffered channel of raw PCM bytes ready to play.
	// Using a large buffer avoids dropping bursts of server audio.
	playbackBuf chan []byte

	// Called with each 100 ms PCM chunk from the microphone.
	onChunk func(pcm []int16)
}

// NewAudioEngine initialises PortAudio and returns an engine.
// Call Terminate() when done.
func NewAudioEngine(onChunk func([]int16)) *AudioEngine {
	portaudio.Initialize()
	return &AudioEngine{
		onChunk:     onChunk,
		playbackBuf: make(chan []byte, 100),
	}
}

// Terminate releases PortAudio resources.
func (a *AudioEngine) Terminate() {
	portaudio.Terminate()
}

// StartCapture opens the default input device and calls onChunk for every frame.
func (a *AudioEngine) StartCapture() error {
	a.mu.Lock()
	if a.capturing {
		a.mu.Unlock()
		return nil
	}
	a.captureStop = make(chan struct{})
	a.capturing = true
	a.mu.Unlock()

	buf := make([]int16, FramesPerBuf)
	stream, err := portaudio.OpenDefaultStream(Channels, 0, float64(SampleRate), len(buf), buf)
	if err != nil {
		a.mu.Lock()
		a.capturing = false
		a.mu.Unlock()
		return err
	}
	if err := stream.Start(); err != nil {
		stream.Close()
		a.mu.Lock()
		a.capturing = false
		a.mu.Unlock()
		return err
	}

	go func() {
		defer func() {
			stream.Stop()
			stream.Close()
			a.mu.Lock()
			a.capturing = false
			a.mu.Unlock()
			log.Println("[AUDIO] Capture goroutine exited")
		}()
		for {
			select {
			case <-a.captureStop:
				return
			default:
			}
			if err := stream.Read(); err != nil {
				log.Printf("[AUDIO] Capture read error: %v", err)
				return
			}
			chunk := make([]int16, len(buf))
			copy(chunk, buf)
			if a.onChunk != nil {
				a.onChunk(chunk)
			}
		}
	}()

	log.Println("[AUDIO] Capture started — 16 kHz mono")
	return nil
}

// StopCapture signals the capture goroutine to stop.
func (a *AudioEngine) StopCapture() {
	a.mu.Lock()
	stop := a.captureStop
	a.mu.Unlock()
	if stop != nil {
		select {
		case <-stop:
		default:
			close(stop)
		}
	}
}

// StartPlayback starts a goroutine that drains playbackBuf through the speaker.
func (a *AudioEngine) StartPlayback() error {
	a.mu.Lock()
	if a.playing {
		a.mu.Unlock()
		return nil
	}
	a.playbackStop = make(chan struct{})
	a.playing = true
	a.mu.Unlock()

	buf := make([]int16, PlaybackFrames)
	stream, err := portaudio.OpenDefaultStream(0, Channels, float64(PlaybackSampleRate), len(buf), buf)
	if err != nil {
		a.mu.Lock()
		a.playing = false
		a.mu.Unlock()
		return err
	}
	if err := stream.Start(); err != nil {
		stream.Close()
		a.mu.Lock()
		a.playing = false
		a.mu.Unlock()
		return err
	}

	go func() {
		defer func() {
			stream.Stop()
			stream.Close()
			a.mu.Lock()
			a.playing = false
			a.mu.Unlock()
			log.Println("[AUDIO] Playback goroutine exited")
		}()
		for {
			select {
			case <-a.playbackStop:
				return
			case raw, ok := <-a.playbackBuf:
				if !ok {
					return
				}
				// Convert raw bytes → int16 samples
				nSamples := len(raw) / 2
				samples := make([]int16, nSamples)
				for i := 0; i < nSamples; i++ {
					samples[i] = int16(binary.LittleEndian.Uint16(raw[2*i : 2*i+2]))
				}
				// Write in PlaybackFrames-sized chunks
				offset := 0
				for offset < len(samples) {
					n := copy(buf, samples[offset:])
					// Zero-pad if last partial chunk
					for i := n; i < PlaybackFrames; i++ {
						buf[i] = 0
					}
					offset += n
					if err := stream.Write(); err != nil {
						// Non-fatal — the stream may have underflowed briefly
						time.Sleep(2 * time.Millisecond)
					}
				}
			}
		}
	}()

	log.Println("[AUDIO] Playback started — 24 kHz mono")
	return nil
}

// StopPlayback signals the playback goroutine to stop.
func (a *AudioEngine) StopPlayback() {
	a.mu.Lock()
	stop := a.playbackStop
	a.mu.Unlock()
	if stop != nil {
		select {
		case <-stop:
		default:
			close(stop)
		}
	}
}

// QueuePlayback enqueues raw 24 kHz 16-bit little-endian PCM bytes for playback.
func (a *AudioEngine) QueuePlayback(raw []byte) {
	if len(raw) < 2 {
		return
	}
	cp := make([]byte, len(raw))
	copy(cp, raw)
	select {
	case a.playbackBuf <- cp:
	default:
		log.Println("[AUDIO] Playback buffer full — dropping chunk")
	}
}

// ClearPlayback drains the playback queue (used when Nova is interrupted).
func (a *AudioEngine) ClearPlayback() {
	for {
		select {
		case <-a.playbackBuf:
		default:
			return
		}
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// RMS returns the root-mean-square amplitude of a PCM buffer (higher = louder).
func RMS(samples []int16) float64 {
	if len(samples) == 0 {
		return 0
	}
	var sum float64
	for _, s := range samples {
		v := float64(s)
		sum += v * v
	}
	return math.Sqrt(sum / float64(len(samples)))
}

// Int16ToBytes converts []int16 to little-endian []byte for the WebSocket wire format.
func Int16ToBytes(samples []int16) []byte {
	raw := make([]byte, len(samples)*2)
	for i, s := range samples {
		binary.LittleEndian.PutUint16(raw[2*i:], uint16(s))
	}
	return raw
}
