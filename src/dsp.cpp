#include "dsp.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace {

constexpr double kDefaultSampleRate = 44100.0;
constexpr double kPi = 3.14159265358979323846;
double gSampleRate = kDefaultSampleRate;
uint32_t gRandState = 0x13579BDFu;

inline double clamp(double value, double minValue, double maxValue) {
  return value < minValue ? minValue : (value > maxValue ? maxValue : value);
}

inline float randomNoise() {
  gRandState = gRandState * 1664525u + 1013904223u;
  uint32_t bits = gRandState >> 1;
  const float scale = 1.0f / 1073741824.0f; // 2^30
  return static_cast<float>(static_cast<int32_t>(bits) * scale);
}

struct Biquad {
  double b0 = 1.0;
  double b1 = 0.0;
  double b2 = 0.0;
  double a1 = 0.0;
  double a2 = 0.0;
  double z1 = 0.0;
  double z2 = 0.0;

  void configureLowpass(double cutoff, double q) {
    const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
    const double nyquist = sr * 0.5;
    const double fc = clamp(cutoff, 10.0, nyquist * 0.99);
    const double resonance = clamp(q, 0.1, 20.0);

    const double omega = 2.0 * kPi * fc / sr;
    const double sin_omega = std::sin(omega);
    const double cos_omega = std::cos(omega);
    const double alpha = sin_omega / (2.0 * resonance);

    const double b0_raw = (1.0 - cos_omega) * 0.5;
    const double b1_raw = 1.0 - cos_omega;
    const double b2_raw = (1.0 - cos_omega) * 0.5;
    const double a0_raw = 1.0 + alpha;
    const double a1_raw = -2.0 * cos_omega;
    const double a2_raw = 1.0 - alpha;

    b0 = b0_raw / a0_raw;
    b1 = b1_raw / a0_raw;
    b2 = b2_raw / a0_raw;
    a1 = a1_raw / a0_raw;
    a2 = a2_raw / a0_raw;
    z1 = 0.0;
    z2 = 0.0;
  }

  float process(float in) {
    const double out = in * b0 + z1;
    z1 = in * b1 + z2 - a1 * out;
    z2 = in * b2 - a2 * out;
    return static_cast<float>(out);
  }
};

inline double timeToSamples(double seconds) {
  return seconds * (gSampleRate > 0 ? gSampleRate : kDefaultSampleRate);
}

inline double envelopeValue(double t, double attack, double decay, double sustain, double sustainDuration, double release) {
  const double sustainLevel = clamp(sustain, 0.0, 1.0);
  if (attack <= 0.0) attack = 0.0001;
  if (decay < 0.0) decay = 0.0;
  if (release <= 0.0) release = 0.0001;

  if (t < attack) {
    return clamp(t / attack, 0.0, 1.0);
  }

  const double decayStart = attack;
  const double decayEnd = attack + decay;
  if (t < decayEnd) {
    const double pos = (t - decayStart) / std::max(decay, 0.000001);
    return 1.0 + (sustainLevel - 1.0) * pos;
  }

  const double sustainEnd = decayEnd + sustainDuration;
  if (t < sustainEnd) {
    return sustainLevel;
  }

  const double releaseStart = sustainEnd;
  const double releasePos = (t - releaseStart) / release;
  if (releasePos >= 1.0) return 0.0;
  return sustainLevel * (1.0 - releasePos);
}

inline void clampBuffer(float* out, int length) {
  for (int i = 0; i < length; ++i) {
    const double value = clamp(out[i], -1.0, 1.0);
    out[i] = static_cast<float>(value);
  }
}

} // namespace

namespace kj::dsp {

void setSampleRate(int sampleRate) {
  gSampleRate = sampleRate > 0 ? static_cast<double>(sampleRate) : kDefaultSampleRate;
}

int calculateSynthSamples(double attack, double decay, double release) {
  const double total = std::max(0.25, attack) + std::max(0.0, decay) + 0.35 + std::max(0.05, release);
  return std::max(1, static_cast<int>(std::ceil(timeToSamples(total))));
}

int calculateKickSamples(double ampDecay) {
  const double total = std::max(0.2, ampDecay + 0.12);
  return std::max(1, static_cast<int>(std::ceil(timeToSamples(total))));
}

int calculateSnareSamples(double decay) {
  const double total = std::max(0.12, decay + 0.12);
  return std::max(1, static_cast<int>(std::ceil(timeToSamples(total))));
}

int calculateHatSamples(double decay) {
  const double total = std::max(0.08, decay + 0.05);
  return std::max(1, static_cast<int>(std::ceil(timeToSamples(total))));
}

int calculateClapSamples(double tail, double spread, int bursts) {
  const int burstCount = std::max(1, bursts);
  const double spacing = std::max(0.001, spread);
  const double duration = std::max(0.05, tail);
  const double total = (burstCount - 1) * spacing + duration + 0.05;
  return std::max(1, static_cast<int>(std::ceil(timeToSamples(total))));
}

void generateSynth(
  float* out,
  int length,
  double baseFreq,
  double cutoff,
  double resonance,
  double attack,
  double decay,
  double sustain,
  double release,
  double velocity,
  int semitoneOffset)
{
  if (!out || length <= 0) return;
  std::fill(out, out + length, 0.0f);

  const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
  const double freq = clamp(baseFreq, 20.0, 20000.0) * std::pow(2.0, semitoneOffset / 12.0);
  const double dt = 1.0 / sr;
  double phase = 0.0;
  const double sustainDuration = 0.25;
  const double sustainLevel = clamp(sustain, 0.0, 1.0);
  const double amp = clamp(velocity, 0.0, 1.5) * 0.4;

  Biquad lpf;
  lpf.configureLowpass(cutoff <= 0.0 ? 2000.0 : cutoff, resonance <= 0.0 ? 1.0 : resonance);

  for (int i = 0; i < length; ++i) {
    const double t = i * dt;
    const double env = envelopeValue(t, attack, decay, sustainLevel, sustainDuration, release);
    phase += freq * dt;
    if (phase >= 1.0) phase -= std::floor(phase);
    const double saw = 2.0 * (phase - std::floor(phase + 0.5));
    const float filtered = lpf.process(static_cast<float>(saw));
    out[i] = static_cast<float>(filtered * env * amp);
  }

  clampBuffer(out, length);
}

void generateKick(
  float* out,
  int length,
  double freq,
  double pitchDecay,
  double ampDecay,
  double click,
  double velocity)
{
  if (!out || length <= 0) return;
  std::fill(out, out + length, 0.0f);

  const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
  const double dt = 1.0 / sr;
  const double baseFreq = clamp(freq, 20.0, 200.0);
  const double pitchDecaySec = clamp(pitchDecay, 0.001, 1.0);
  const double ampDecaySec = clamp(ampDecay, 0.05, 2.0);
  const double clickAmount = clamp(click, 0.0, 1.0);
  const double vel = clamp(velocity, 0.0, 2.0);

  double phase = 0.0;
  for (int i = 0; i < length; ++i) {
    const double t = i * dt;
    const double pitchEnv = std::exp(-t / pitchDecaySec);
    const double currentFreq = baseFreq + (baseFreq * 2.5) * pitchEnv;
    phase += currentFreq * dt;
    if (phase >= 1.0) phase -= std::floor(phase);
    const double env = std::exp(-t / ampDecaySec);
    double sample = std::sin(phase * 2.0 * kPi) * env * vel;
    if (t < 0.01 && clickAmount > 0.0) {
      sample += randomNoise() * clickAmount * (1.0 - t / 0.01) * vel;
    }
    out[i] = static_cast<float>(sample);
  }

  clampBuffer(out, length);
}

void generateSnare(
  float* out,
  int length,
  double tone,
  double noiseAmount,
  double decay,
  double velocity)
{
  if (!out || length <= 0) return;
  std::fill(out, out + length, 0.0f);

  const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
  const double dt = 1.0 / sr;
  const double toneHz = clamp(tone, 60.0, 2000.0);
  const double noiseAmt = clamp(noiseAmount, 0.0, 1.5);
  const double decaySec = clamp(decay, 0.01, 2.0);
  const double vel = clamp(velocity, 0.0, 2.0);

  double tonePhase = 0.0;
  double hpPrevIn = 0.0;
  double hpPrevOut = 0.0;
  const double hpCutoff = 1200.0;
  const double rc = 1.0 / (2.0 * kPi * hpCutoff);
  const double alpha = rc / (rc + dt);

  for (int i = 0; i < length; ++i) {
    const double t = i * dt;
    const double env = std::exp(-t / decaySec);

    tonePhase += toneHz * dt;
    if (tonePhase >= 1.0) tonePhase -= std::floor(tonePhase);
    const double sine = std::sin(tonePhase * 2.0 * kPi);
    const double toneSample = sine * 0.3 * vel;

    const double white = randomNoise();
    const double hpOut = alpha * (hpPrevOut + white - hpPrevIn);
    hpPrevIn = white;
    hpPrevOut = hpOut;
    const double noiseSample = hpOut * noiseAmt * vel;

    out[i] = static_cast<float>((toneSample + noiseSample) * env);
  }

  clampBuffer(out, length);
}

void generateHat(
  float* out,
  int length,
  double decay,
  double highpassHz,
  double velocity)
{
  if (!out || length <= 0) return;
  std::fill(out, out + length, 0.0f);

  const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
  const double dt = 1.0 / sr;
  const double decaySec = clamp(decay, 0.01, 1.0);
  const double vel = clamp(velocity, 0.0, 2.0);
  const double cutoff = clamp(highpassHz, 2000.0, sr * 0.49);
  const double rc = 1.0 / (2.0 * kPi * cutoff);
  const double alpha = rc / (rc + dt);
  double prevIn = 0.0;
  double prevOut = 0.0;

  for (int i = 0; i < length; ++i) {
    const double t = i * dt;
    const double env = std::exp(-t / decaySec);
    const double noise = randomNoise();
    const double hp = alpha * (prevOut + noise - prevIn);
    prevIn = noise;
    prevOut = hp;
    out[i] = static_cast<float>(hp * env * vel * 0.6);
  }

  clampBuffer(out, length);
}

void generateClap(
  float* out,
  int length,
  int bursts,
  double spread,
  double tail,
  double velocity)
{
  if (!out || length <= 0) return;
  std::fill(out, out + length, 0.0f);

  const int burstCount = std::max(1, bursts);
  const double sr = gSampleRate > 0 ? gSampleRate : kDefaultSampleRate;
  const double dt = 1.0 / sr;
  const double spacing = clamp(spread, 0.001, 0.1);
  const double tailSec = clamp(tail, 0.02, 2.0);
  const double vel = clamp(velocity, 0.0, 2.0);

  for (int b = 0; b < burstCount; ++b) {
    const int startSample = static_cast<int>(std::round(timeToSamples(b * spacing)));
    for (int i = startSample; i < length; ++i) {
      const double t = (i - startSample) * dt;
      const double env = std::exp(-t / tailSec);
      if (env < 0.0001) break;
      out[i] += randomNoise() * static_cast<float>(env);
    }
  }

  // Simple band-pass shaping using two one-pole filters
  Biquad lpf;
  lpf.configureLowpass(3500.0, 0.7);
  double hpPrevIn = 0.0;
  double hpPrevOut = 0.0;
  const double hpCutoff = 400.0;
  const double rc = 1.0 / (2.0 * kPi * hpCutoff);
  const double alpha = rc / (rc + dt);

  for (int i = 0; i < length; ++i) {
    const double hp = alpha * (hpPrevOut + out[i] - hpPrevIn);
    hpPrevIn = out[i];
    hpPrevOut = hp;
    const float shaped = lpf.process(static_cast<float>(hp));
    out[i] = shaped * static_cast<float>(vel * 0.5);
  }

  clampBuffer(out, length);
}

} // namespace kj::dsp

extern "C" {

void kj_set_sample_rate(int sampleRate) {
  kj::dsp::setSampleRate(sampleRate);
}

int kj_calculate_synth_samples(double attack, double decay, double release) {
  return kj::dsp::calculateSynthSamples(attack, decay, release);
}

int kj_calculate_kick_samples(double ampDecay) {
  return kj::dsp::calculateKickSamples(ampDecay);
}

int kj_calculate_snare_samples(double decay) {
  return kj::dsp::calculateSnareSamples(decay);
}

int kj_calculate_hat_samples(double decay) {
  return kj::dsp::calculateHatSamples(decay);
}

int kj_calculate_clap_samples(int bursts, double spread, double tail) {
  return kj::dsp::calculateClapSamples(tail, spread, bursts);
}

void kj_generate_synth(float* out, int length, double baseFreq, double cutoff, double resonance, double attack, double decay, double sustain, double release, double velocity, int semitoneOffset) {
  kj::dsp::generateSynth(out, length, baseFreq, cutoff, resonance, attack, decay, sustain, release, velocity, semitoneOffset);
}

void kj_generate_kick(float* out, int length, double freq, double pitchDecay, double ampDecay, double click, double velocity) {
  kj::dsp::generateKick(out, length, freq, pitchDecay, ampDecay, click, velocity);
}

void kj_generate_snare(float* out, int length, double tone, double noiseAmount, double decay, double velocity) {
  kj::dsp::generateSnare(out, length, tone, noiseAmount, decay, velocity);
}

void kj_generate_hat(float* out, int length, double decay, double highpassHz, double velocity) {
  kj::dsp::generateHat(out, length, decay, highpassHz, velocity);
}

void kj_generate_clap(float* out, int length, int bursts, double spread, double tail, double velocity) {
  kj::dsp::generateClap(out, length, bursts, spread, tail, velocity);
}

}

