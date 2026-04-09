export const createAudioElement = () => {
  const element = document.createElement('audio');
  element.autoplay = true;
  element.playsInline = true;
  return element;
};

export const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass();
};

export const getMicrophoneConstraints = () => ({
  audio: {
    autoGainControl: false,
    channelCount: 1,
    echoCancellation: true,
    latency: 0.01,
    noiseSuppression: true,
    sampleRate: 48000,
    sampleSize: 16,
  },
});

const disconnectAudioNode = (node) => {
  node?.disconnect();
};

const createFilterNode = ({
  audioContext,
  frequency,
  gain = 0,
  q = 0.707,
  type,
}) => {
  const filter = audioContext.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;

  if (type === 'peaking') {
    filter.gain.value = gain;
  }

  return filter;
};

export const createMicrophoneProcessingGraph = ({ audioContext, stream }) => {
  const source = audioContext.createMediaStreamSource(stream);
  const highPassFilter = createFilterNode({
    audioContext,
    frequency: 140,
    type: 'highpass',
  });
  const lowPassFilter = createFilterNode({
    audioContext,
    frequency: 4200,
    type: 'lowpass',
  });
  const presenceFilter = createFilterNode({
    audioContext,
    frequency: 1700,
    gain: 3,
    q: 1.2,
    type: 'peaking',
  });
  const compressor = audioContext.createDynamicsCompressor();
  const analyser = audioContext.createAnalyser();
  const gateGain = audioContext.createGain();
  const destination = audioContext.createMediaStreamDestination();

  compressor.threshold.value = -30;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  gateGain.gain.value = 0;

  source.connect(highPassFilter);
  highPassFilter.connect(lowPassFilter);
  lowPassFilter.connect(presenceFilter);
  presenceFilter.connect(compressor);
  compressor.connect(analyser);
  compressor.connect(gateGain);
  gateGain.connect(destination);

  return {
    analyser,
    gateGain,
    processedStream: destination.stream,
    release: () => {
      disconnectAudioNode(source);
      disconnectAudioNode(highPassFilter);
      disconnectAudioNode(lowPassFilter);
      disconnectAudioNode(presenceFilter);
      disconnectAudioNode(compressor);
      disconnectAudioNode(analyser);
      disconnectAudioNode(gateGain);
    },
  };
};

export const setInputGateEnabled = ({ gateGainNode, isEnabled }) => {
  if (!gateGainNode) {
    return;
  }

  const now = gateGainNode.context.currentTime;
  const targetValue = isEnabled ? 1 : 0;
  const timeConstant = isEnabled ? 0.015 : 0.08;

  gateGainNode.gain.cancelScheduledValues(now);
  gateGainNode.gain.setValueAtTime(gateGainNode.gain.value, now);
  gateGainNode.gain.setTargetAtTime(targetValue, now, timeConstant);
};

export const setPeerAudioTrackEnabled = (peerConnection, isEnabled) => {
  if (!peerConnection) {
    return;
  }

  peerConnection.getSenders().forEach((sender) => {
    if (sender.track?.kind === 'audio') {
      sender.track.enabled = isEnabled;
    }
  });
};

export const stopMediaStream = (stream) => {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
};
