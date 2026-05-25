package main

// #cgo pkg-config: portaudio-2.0
import "C"

import (
	"encoding/binary"
	"log"
	"math"
	"sync"
	"time"
	"unsafe"

	"github.com/gordonklaus/portaudio"
)

const (
	// Audio settings matching the Nova server (16kHz, 16-bit PCM, mono)
	SampleRate   = 16000
	Channels     = 1
	FramesPerBuf = 1600 // 100ms per chunk

	// Playback at 24kHz because Google's Live API returns 24kHz audio
	PlaybackSampleRate = 24000
	PlaybackFrames     = 2400 // 100ms playback chunks

	// Wake word VAD settings
	silenceThreshold  = 300  // RMS threshold below which we consider silence
	wakeWindowSec     = 2.0  // seconds of audio to buffer for wake word detection
	chunkDurationSec  = float64(FramesPerBuf) / float64(SampleRate)
)

// AudioEngine manages microphone capture and speaker playback via PortAudio
type AudioEngine struct {
	mu sync.Mutex

	// State
	capturing   bool
	playing     bool
	listening   bool // whether we are actively streaming to Nova server

	// Channels
	captureStop  chan struct{}
	playbackStop chan struct{}
	playbackBuf  chan []int16 // incoming PCM from server queued for playback

	// Callbacks
	onChunk    func(pcm []int16) // called with each captured 100ms chunk
	onActivity func(active bool) // called when voice activity starts/stops
}

// NewAudioEngine creates a new audio engine (call Init() before using)
func NewAudioEngine(onChunk func([]int16), onActivity func(bool)) *AudioEngine {
	portaudio.Initialize()
	return &AudioEngine{
		onChunk:     onChunk,
		onActivity:  onActivity,
		playbackBuf: make(chan []int16, 50),
	}
}

// Terminate cleans up PortAudio
func (a *AudioEngine) Terminate() {
	portaudio.Terminate()
}

// StartCapture starts listening on the default microphone
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
			log.Println("[AUDIO] Capture stopped")
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

			// Copy buffer to avoid race
			chunk := make([]int16, len(buf))
			copy(chunk, buf)

			if a.onChunk != nil {
				a.onChunk(chunk)
			}
		}
	}()

	log.Println("[AUDIO] Capture started at 16kHz mono")
	return nil
}

// StopCapture halts microphone capture
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

// StartPlayback starts the background goroutine that plays audio from the queue
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
			log.Println("[AUDIO] Playback stopped")
		}()

		for {
			select {
			case <-a.playbackStop:
				return
			case chunk, ok := <-a.playbackBuf:
				if !ok {
					return
				}
				// Fill output buffer, chunk by chunk
				offset := 0
				for offset < len(chunk) {
					end := offset + PlaybackFrames
					if end > len(chunk) {
						// Partial final chunk - pad with zeros
						copy(buf, chunk[offset:])
						for i := len(chunk) - offset; i < PlaybackFrames; i++ {
							buf[i] = 0
						}
						end = len(chunk)
					} else {
						copy(buf, chunk[offset:end])
					}
					offset = end
					if err := stream.Write(); err != nil {
						log.Printf("[AUDIO] Playback write error: %v", err)
						time.Sleep(5 * time.Millisecond)
					}
				}
			}
		}
	}()

	log.Println("[AUDIO] Playback started at 24kHz mono")
	return nil
}

// StopPlayback halts audio playback
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

// QueuePlayback enqueues raw PCM bytes (24kHz 16-bit LE signed) for playback
func (a *AudioEngine) QueuePlayback(raw []byte) {
	if len(raw) < 2 {
		return
	}
	samples := make([]int16, len(raw)/2)
	for i := range samples {
		samples[i] = int16(binary.LittleEndian.Uint16(raw[2*i : 2*i+2]))
	}
	select {
	case a.playbackBuf <- samples:
	default:
		log.Println("[AUDIO] Playback buffer full, dropping chunk")
	}
}

// ClearPlayback drains the playback buffer (used on interruption)
func (a *AudioEngine) ClearPlayback() {
	for {
		select {
		case <-a.playbackBuf:
		default:
			return
		}
	}
}

// RMS calculates the root-mean-square amplitude of a PCM chunk
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

// Int16ToBytes converts []int16 to little-endian []byte for sending to server
func Int16ToBytes(samples []int16) []byte {
	raw := make([]byte, len(samples)*2)
	for i, s := range samples {
		binary.LittleEndian.PutUint16(raw[2*i:], uint16(s))
	}
	return raw
}

// Dummy use of unsafe to suppress import error if CGo is disabled
var _ = unsafe.Sizeof(0)
