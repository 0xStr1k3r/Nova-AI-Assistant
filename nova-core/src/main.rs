use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tokio::runtime::Runtime;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread;
use std::collections::VecDeque;
use vosk::{Model, Recognizer};
use base64::{engine::general_purpose, Engine as _};

#[derive(Serialize)]
struct AudioMessage {
    audio: String,
}

fn resample_linear(input: &[i16], src_rate: f32, dst_rate: f32) -> Vec<i16> {
    if input.is_empty() {
        return Vec::new();
    }
    if (src_rate - dst_rate).abs() < 1.0 {
        return input.to_vec();
    }
    
    let ratio = src_rate / dst_rate;
    let new_len = (input.len() as f32 / ratio).round() as usize;
    let mut output = Vec::with_capacity(new_len);
    
    for i in 0..new_len {
        let pos = i as f32 * ratio;
        let idx = pos.floor() as usize;
        let frac = pos - idx as f32;
        
        if idx + 1 < input.len() {
            let s1 = input[idx] as f32;
            let s2 = input[idx + 1] as f32;
            let interpolated = s1 + (s2 - s1) * frac;
            output.push(interpolated.clamp(i16::MIN as f32, i16::MAX as f32) as i16);
        } else if idx < input.len() {
            output.push(input[idx]);
        }
    }
    output
}

fn is_wake_word(text: &str) -> bool {
    let cleaned = text.to_lowercase();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    if words.is_empty() {
        return false;
    }
    
    // Check for exact single-word matches or phonetic variations
    for (i, &word) in words.iter().enumerate() {
        match word {
            "nova" | "no-a" | "novo" | "noah" | "nora" | "nona" | "noba" | "mova" | "neva" | "nowa" | "nova's" | "novas" => {
                return true;
            }
            _ => {}
        }
        
        // Check for 2-word wake word phrases with exact word boundaries
        if i + 1 < words.len() {
            let next_word = words[i + 1];
            if (word == "no" && next_word == "a") || 
               (word == "now" && next_word == "a") || 
               (word == "know" && next_word == "a") {
                return true;
            }
        }
    }
    
    // Single word phonetic fallbacks
    if words.len() == 1 {
        let w = words[0];
        match w {
            "now" | "know" | "over" | "never" | "number" => {
                return true;
            }
            _ => {}
        }
    }
    
    false
}

fn is_stop_word(text: &str) -> bool {
    let cleaned = text.to_lowercase();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    if words.is_empty() {
        return false;
    }
    
    // Check for exact word stop signals
    for (i, &word) in words.iter().enumerate() {
        match word {
            "stop" | "exit" | "goodbye" | "bye" | "cancel" | "quit" | "close" | "terminate" => {
                return true;
            }
            _ => {}
        }
        
        // Check for 2-word stop phrases with exact boundaries
        if i + 1 < words.len() {
            let next_word = words[i + 1];
            if (word == "end" && next_word == "session") || 
               (word == "stop" && next_word == "listening") || 
               (word == "good" && next_word == "bye") {
                return true;
            }
        }
    }
    
    // Single word phonetic fallbacks
    if words.len() == 1 {
        let w = words[0];
        match w {
            "step" | "stark" | "top" | "end" => {
                return true;
            }
            _ => {}
        }
    }
    
    false
}

fn main() {
    println!("Starting Nova Native Audio Engine...");
    
    // Attempt to load Vosk model
    let model_path = "vosk-model-small-en-us-0.15";
    let model = match Model::new(model_path) {
        Some(m) => m,
        None => {
            eprintln!("Failed to load Vosk model at {}", model_path);
            std::process::exit(1);
        }
    };

    let host = cpal::default_host();
    
    // --- Setup Input (Microphone) ---
    let in_device = host.default_input_device().expect("Failed to get default input device");
    
    // Force 16000 Hz if possible, otherwise use default
    let mut in_config = in_device.default_input_config().expect("Failed to get default input config");
    let mut is_16k_supported = false;
    if let Ok(supported_configs) = in_device.supported_input_configs() {
        for config in supported_configs {
            if config.min_sample_rate().0 <= 16000 && config.max_sample_rate().0 >= 16000 {
                let fmt = config.sample_format();
                if fmt == cpal::SampleFormat::F32 || fmt == cpal::SampleFormat::I16 {
                    in_config = config.with_sample_rate(cpal::SampleRate(16000));
                    is_16k_supported = true;
                    break;
                }
            }
        }
    }
    
    if !is_16k_supported {
        println!("Warning: 16000Hz not natively supported by input device. Using {}", in_config.sample_rate().0);
    }
    
    println!("Input device: {}", in_device.name().unwrap_or_default());
    
    // --- Setup Output (Speaker) ---
    let out_device = host.default_output_device().expect("Failed to get default output device");
    let out_config = out_device.default_output_config().expect("Failed to get default output config");
    let out_sample_rate = out_config.sample_rate().0 as f32;
    let out_channels = out_config.channels() as usize;
    println!("Output device: {}", out_device.name().unwrap_or_default());

    let sample_rate = in_config.sample_rate().0 as f32;
    
    let mut recognizer = Recognizer::new(&model, sample_rate).expect("Failed to create recognizer");
    recognizer.set_max_alternatives(0);
    recognizer.set_words(true);
    recognizer.set_partial_words(true);

    let (in_tx, in_rx) = mpsc::channel::<Vec<i16>>();
    
    let in_channels = in_config.channels() as usize;
    
    // Input Stream
    let in_stream = match in_config.sample_format() {
        cpal::SampleFormat::F32 => in_device.build_input_stream(
            &in_config.into(),
            move |data: &[f32], _: &_| {
                let mut mono_data = Vec::with_capacity(data.len() / in_channels);
                for chunk in data.chunks_exact(in_channels) {
                    let mut sample = chunk[0] * (i16::MAX as f32); // No gain for raw recording
                    sample = sample.clamp(i16::MIN as f32, i16::MAX as f32);
                    mono_data.push(sample as i16);
                }
                let _ = in_tx.send(mono_data);
            },
            |err| eprintln!("Input stream error: {}", err),
            None,
        ).unwrap(),
        cpal::SampleFormat::I16 => in_device.build_input_stream(
            &in_config.into(),
            move |data: &[i16], _: &_| {
                let mut mono_data = Vec::with_capacity(data.len() / in_channels);
                for chunk in data.chunks_exact(in_channels) {
                    let sample = chunk[0]; // No gain for raw recording
                    mono_data.push(sample);
                }
                let _ = in_tx.send(mono_data);
            },
            |err| eprintln!("Input stream error: {}", err),
            None,
        ).unwrap(),
        _ => panic!("Unsupported input sample format"),
    };

    // Playback Buffer
    let playback_buffer: Arc<Mutex<VecDeque<i16>>> = Arc::new(Mutex::new(VecDeque::new()));
    let playback_buffer_clone = Arc::clone(&playback_buffer);

    // Output Stream
    let out_stream = match out_config.sample_format() {
        cpal::SampleFormat::F32 => out_device.build_output_stream(
            &out_config.into(),
            move |data: &mut [f32], _: &_| {
                let mut buf = playback_buffer_clone.lock().unwrap();
                for sample in data.iter_mut() {
                    if let Some(i16_sample) = buf.pop_front() {
                        *sample = i16_sample as f32 / i16::MAX as f32;
                    } else {
                        *sample = 0.0;
                    }
                }
            },
            |err| eprintln!("Output stream error: {}", err),
            None,
        ).unwrap(),
        cpal::SampleFormat::I16 => out_device.build_output_stream(
            &out_config.into(),
            move |data: &mut [i16], _: &_| {
                let mut buf = playback_buffer_clone.lock().unwrap();
                for sample in data.iter_mut() {
                    if let Some(i16_sample) = buf.pop_front() {
                        *sample = i16_sample;
                    } else {
                        *sample = 0;
                    }
                }
            },
            |err| eprintln!("Output stream error: {}", err),
            None,
        ).unwrap(),
        _ => panic!("Unsupported output sample format"),
    };

    in_stream.play().unwrap();
    out_stream.play().unwrap();

    let is_listening = Arc::new(AtomicBool::new(false));
    
    // We run the WebSocket inside a dedicated thread so it doesn't block the main Vosk loop
    let (ws_tx, ws_rx) = mpsc::channel::<Vec<i16>>();
    
    let ws_rx = Arc::new(Mutex::new(ws_rx));
    let is_listening_clone = Arc::clone(&is_listening);
    let pb_buffer_clone2 = Arc::clone(&playback_buffer);
    let out_sample_rate_clone = out_sample_rate;
    let out_channels_clone = out_channels;
    
    thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            loop {
                // Wait until we need to connect
                while !is_listening_clone.load(Ordering::Relaxed) {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
                
                let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
                let url_str = format!("ws://localhost:{}/live?role=audio", port);
                let url = url::Url::parse(&url_str).unwrap();
                
                match connect_async(url).await {
                    Ok((ws_stream, _)) => {
                        println!("Connected to Nova backend!");
                        let (mut write, mut read) = ws_stream.split();
                        
                        let is_l = Arc::clone(&is_listening_clone);
                        let ws_rx_clone = Arc::clone(&ws_rx);
                        
                        // Writer task
                        let _writer_handle = tokio::spawn(async move {
                            while is_l.load(Ordering::Relaxed) {
                                let pcm_opt = {
                                    ws_rx_clone.lock().unwrap().try_recv().ok()
                                };
                                if let Some(pcm_data) = pcm_opt {
                                    // We need to convert i16 to u8 bytes (little endian)
                                    let mut u8_data = Vec::with_capacity(pcm_data.len() * 2);
                                    for &sample in &pcm_data {
                                        u8_data.extend_from_slice(&sample.to_le_bytes());
                                    }
                                    
                                    let base64_audio = general_purpose::STANDARD.encode(&u8_data);
                                    
                                    let msg = AudioMessage {
                                        audio: base64_audio,
                                    };
                                    
                                    let json_str = serde_json::to_string(&msg).unwrap();
                                    if write.send(Message::Text(json_str)).await.is_err() {
                                        break;
                                    }
                                } else {
                                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                                }
                            }
                        });

                        // Reader task
                        while let Some(msg) = read.next().await {
                            if !is_listening_clone.load(Ordering::Relaxed) {
                                break;
                            }
                            if let Ok(Message::Text(text)) = msg {
                                if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&text) {
                                    if let Some(audio_b64) = json_data.get("audio").and_then(|a| a.as_str()) {
                                        if let Ok(decoded) = general_purpose::STANDARD.decode(audio_b64) {
                                            // Convert bytes back to i16 (little-endian PCM)
                                            let mut pcm_out = Vec::new();
                                            for chunk in decoded.chunks_exact(2) {
                                                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                                                pcm_out.push(sample);
                                            }
                                            
                                            // Resample from 24kHz mono to output sample rate and channels
                                            let resampled = resample_linear(&pcm_out, 24000.0, out_sample_rate_clone);
                                            let mut final_pcm = Vec::with_capacity(resampled.len() * out_channels_clone);
                                            for sample in resampled {
                                                for _ in 0..out_channels_clone {
                                                    final_pcm.push(sample);
                                                }
                                            }
                                            
                                            pb_buffer_clone2.lock().unwrap().extend(final_pcm);
                                        }
                                    }
                                    if let Some(interrupted) = json_data.get("interrupted").and_then(|i| i.as_bool()) {
                                        if interrupted {
                                            println!("Response interrupted by server");
                                            pb_buffer_clone2.lock().unwrap().clear();
                                        }
                                    }
                                    if let Some(action) = json_data.get("action").and_then(|a| a.as_str()) {
                                        if action == "endSession" {
                                            println!("Session ended by server command");
                                            is_listening_clone.store(false, Ordering::Relaxed);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        is_listening_clone.store(false, Ordering::Relaxed);
                        println!("Disconnected from Nova backend.");
                    },
                    Err(e) => {
                        eprintln!("Failed to connect to backend: {}", e);
                        is_listening_clone.store(false, Ordering::Relaxed);
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    }
                }
            }
        });
    });

    println!("Listening for wake word 'nova'...");
    
    // Main Vosk Loop
    loop {
        if let Ok(data) = in_rx.recv() {
            let currently_listening = is_listening.load(Ordering::Relaxed);
            
            if currently_listening {
                // Forward directly to WebSocket
                let _ = ws_tx.send(data.clone());
            }
            
            // Apply 2.5x gain ONLY for Vosk offline speech recognition (so quiet speaking wakes it up)
            let mut vosk_data = Vec::with_capacity(data.len());
            for &sample in &data {
                let mut amplified = (sample as f32) * 2.5;
                amplified = amplified.clamp(i16::MIN as f32, i16::MAX as f32);
                vosk_data.push(amplified as i16);
            }
            
            // Feed to Vosk regardless to detect stop words
            if let Ok(state) = recognizer.accept_waveform(&vosk_data) {
                let mut wake_detected = false;
                let mut stop_detected = false;
                
                match state {
                    vosk::DecodingState::Running => {
                        let partial = recognizer.partial_result();
                        let text = partial.partial.to_lowercase();
                        if !text.is_empty() {
                            println!("[Vosk Partial] {}", text);
                        }
                        
                        let is_wake = is_wake_word(&text);
                        let is_stop = is_stop_word(&text);

                        if !currently_listening && is_wake {
                            println!("Wake word detected (partial): '{}'", text);
                            wake_detected = true;
                        } else if currently_listening && is_stop {
                            println!("Stop word detected (partial): '{}'", text);
                            stop_detected = true;
                        }
                    },
                    vosk::DecodingState::Finalized => {
                        if let Some(res) = recognizer.result().single() {
                            let text = res.text.to_lowercase();
                            if !text.is_empty() {
                                println!("[Vosk Final] {}", text);
                            }
                            
                            let is_wake = is_wake_word(&text);
                            let is_stop = is_stop_word(&text);

                            if !currently_listening && is_wake {
                                println!("Wake word detected (final): '{}'", text);
                                wake_detected = true;
                            } else if currently_listening && is_stop {
                                println!("Stop word detected (final): '{}'", text);
                                stop_detected = true;
                            }
                        }
                    },
                    _ => {}
                }
                
                if wake_detected {
                    is_listening.store(true, Ordering::Relaxed);
                    playback_buffer.lock().unwrap().clear();
                    recognizer.reset();
                } else if stop_detected {
                    is_listening.store(false, Ordering::Relaxed);
                    playback_buffer.lock().unwrap().clear();
                    recognizer.reset();
                }
            }
        }
    }
}
