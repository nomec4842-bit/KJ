#pragma once

#include <cstddef>

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#else
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif
#endif

namespace kj::dsp {

void setSampleRate(int sampleRate);
int calculateSynthSamples(double attack, double decay, double release);
int calculateKickSamples(double ampDecay);
int calculateSnareSamples(double decay);
int calculateHatSamples(double decay);
int calculateClapSamples(double tail, double spread, int bursts);

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
  int semitoneOffset);

void generateKick(
  float* out,
  int length,
  double freq,
  double pitchDecay,
  double ampDecay,
  double click,
  double velocity);

void generateSnare(
  float* out,
  int length,
  double tone,
  double noiseAmount,
  double decay,
  double velocity);

void generateHat(
  float* out,
  int length,
  double decay,
  double highpassHz,
  double velocity);

void generateClap(
  float* out,
  int length,
  int bursts,
  double spread,
  double tail,
  double velocity);

} // namespace kj::dsp

extern "C" {

EMSCRIPTEN_KEEPALIVE void kj_set_sample_rate(int sampleRate);
EMSCRIPTEN_KEEPALIVE int kj_calculate_synth_samples(double attack, double decay, double release);
EMSCRIPTEN_KEEPALIVE int kj_calculate_kick_samples(double ampDecay);
EMSCRIPTEN_KEEPALIVE int kj_calculate_snare_samples(double decay);
EMSCRIPTEN_KEEPALIVE int kj_calculate_hat_samples(double decay);
EMSCRIPTEN_KEEPALIVE int kj_calculate_clap_samples(int bursts, double spread, double tail);

EMSCRIPTEN_KEEPALIVE void kj_generate_synth(float* out, int length, double baseFreq, double cutoff, double resonance, double attack, double decay, double sustain, double release, double velocity, int semitoneOffset);
EMSCRIPTEN_KEEPALIVE void kj_generate_kick(float* out, int length, double freq, double pitchDecay, double ampDecay, double click, double velocity);
EMSCRIPTEN_KEEPALIVE void kj_generate_snare(float* out, int length, double tone, double noiseAmount, double decay, double velocity);
EMSCRIPTEN_KEEPALIVE void kj_generate_hat(float* out, int length, double decay, double highpassHz, double velocity);
EMSCRIPTEN_KEEPALIVE void kj_generate_clap(float* out, int length, int bursts, double spread, double tail, double velocity);

}

