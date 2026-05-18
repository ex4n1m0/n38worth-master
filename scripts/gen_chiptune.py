import numpy as np
import scipy.io.wavfile as wavfile
import os

# Parameters
sample_rate = 22050
duration = 10.0
freqs = [220, 246.94, 261.63, 293.66, 329.63, 369.99, 392, 440]  # Lounge-y scale
bpm = 120
beat_duration = 60 / bpm / 4

def square_wave(t, freq):
    return 2 * ((t * freq / sample_rate) % 1 >= 0.5) - 1

t = np.linspace(0, duration, int(sample_rate * duration), False)
audio = np.zeros_like(t)

# Melody: Custom pattern slightly different from LSL disco
melody_notes = [0, 2, 3, 0, 4, 5, 7, 0] * 4
mel_time = 0.0
for note_idx in melody_notes:
    start_sample = int(mel_time * sample_rate)
    end_sample = min(int((mel_time + beat_duration) * sample_rate), len(audio))
    note_len = end_sample - start_sample
    if note_len > 0:
        note_t = t[:note_len]
        note_freq = freqs[note_idx]
        wave = square_wave(note_t, note_freq)
        audio[start_sample:end_sample] += 0.5 * wave
    mel_time += beat_duration

# Bass
bass_notes = [0, 0, 2, 0] * 10
bass_time = 0.0
for note_idx in bass_notes:
    start_sample = int(bass_time * sample_rate)
    end_sample = min(int((bass_time + beat_duration * 2) * sample_rate), len(audio))
    note_len = end_sample - start_sample
    if note_len > 0:
        note_t = t[:note_len]
        note_freq = freqs[note_idx] * 0.5
        wave = square_wave(note_t, note_freq)
        audio[start_sample:end_sample] += 0.3 * wave
    bass_time += beat_duration * 2

# 8-bit style: Clip and quantize
audio = np.clip(audio * 0.4, -1, 1)

# Save as 16-bit WAV
out_path = os.path.join(os.path.dirname(__file__), "..", "public", "chiptune.wav")
out_path = os.path.normpath(out_path)
wavfile.write(out_path, sample_rate, (audio * 32767).astype(np.int16))
print(f"Written: {out_path}")
