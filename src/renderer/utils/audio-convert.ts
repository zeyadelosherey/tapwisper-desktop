/**
 * Recorded audio is WebM/Opus (MediaRecorder). whisper.cpp — and several
 * self-hosted servers — only read WAV, so local engines get a 16 kHz mono copy.
 */
import { encodeWav } from '../../shared/audio/wav'

const SAMPLE_RATE = 16_000

/** Average all channels into one */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const mono = new Float32Array(channels[0].length)
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length
  }
  return mono
}

/** Decode any browser-playable audio to 16 kHz mono WAV */
export async function toWav16k(blob: Blob): Promise<{ wav: Uint8Array; seconds: number }> {
  // decodeAudioData resamples to the context's rate, so a tiny offline context does it all
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const decoded = await context.decodeAudioData(await blob.arrayBuffer())
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
    decoded.getChannelData(i)
  )
  return { wav: encodeWav(downmix(channels), SAMPLE_RATE), seconds: decoded.duration }
}
