import { useEffect, useRef, useState } from 'react';
import {
  createAudioElement,
  createMicrophoneProcessingGraph,
  getAudioContext,
  getMicrophoneConstraints,
  setInputGateEnabled,
  setPeerAudioTrackEnabled,
  stopMediaStream,
} from '@/features/realtime/lib/audio';
import {
  DEFAULT_MIC_SENSITIVITY,
  DEFAULT_SPEAKER_VOLUME,
  DEFAULT_VOICE_AUTO_REPLY_ENABLED,
  LOCAL_NOISE_FLOOR_ALPHA,
  LOCAL_SPEECH_COOLDOWN_MS,
  LOCAL_SPEECH_LEVEL_THRESHOLD,
  MAX_MIC_SENSITIVITY,
  MAX_RECONNECT_ATTEMPTS,
  MIC_LEVEL_MULTIPLIER,
  MIC_SENSITIVITY_STORAGE_KEY,
  MIN_MIC_SENSITIVITY,
  SOFT_SLEEP_IDLE_MS,
  VOICE_AUTO_REPLY_STORAGE_KEY,
} from '@/features/realtime/lib/constants';
import {
  createInputLevelNormalizerState,
  getInputGateDecision,
  normalizeInputLevel,
  updateInputLevelNormalizerState,
} from '@/features/realtime/lib/input-gate';
import {
  createTimestamp,
  createVoiceDisplayEvent,
  enrichIncomingEvent,
  enrichOutgoingEvent,
  getLogTimestamp,
} from '@/features/realtime/lib/session-events';
import {
  completeTurnLatencyMeasurement,
  createTurnLatencyMeasurement,
} from '@/shared/lib/response-latency';
import {
  buildResponseCreateEvent,
  buildSessionUpdateEvent,
  buildTextMessageEvent,
} from '@/features/realtime/lib/session-config';
import {
  buildQualifiedTurnHandoff,
  createAutoTurnState,
  isAutoTurnReady,
  reduceAutoTurnState,
} from '@/features/realtime/lib/turn-flow';
import {
  finalizeAudioActivityState,
  isLocalSpeechLevelActive,
  qualifyUtterance,
  recordAudioActivitySample,
  selectRecentAudioActivity,
  shouldFinalizeAudioActivity,
  shouldWakeFromLocalSpeech,
} from '@/features/realtime/lib/utterance-qualification';
import { qualifyUserDirectedSpeech } from '@/features/realtime/lib/user-directed-speech';

const ROLLED_BACK_DEFAULT_MIC_SENSITIVITY = 0.7;

const getValidatedMicSensitivity = (value) => {
  const parsedValue = Number.parseFloat(value);

  if (Number.isNaN(parsedValue)) {
    return DEFAULT_MIC_SENSITIVITY;
  }

  if (parsedValue === ROLLED_BACK_DEFAULT_MIC_SENSITIVITY) {
    return DEFAULT_MIC_SENSITIVITY;
  }

  return Math.min(
    MAX_MIC_SENSITIVITY,
    Math.max(MIN_MIC_SENSITIVITY, parsedValue)
  );
};

const getStoredBoolean = (key, fallbackValue) => {
  const value = localStorage.getItem(key);
  if (value === null) {
    return fallbackValue;
  }

  return value === 'true';
};

const calculateNormalizedMicLevel = (analyser) => {
  const dataArray = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(dataArray);

  let sum = 0;
  for (const sample of dataArray) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  const rms = Math.sqrt(sum / dataArray.length);
  return Math.min(1, rms * MIC_LEVEL_MULTIPLIER);
};

export const useRealtimeSession = (options = {}) => {
  const {
    forceVoiceAutoReplyEnabled = false,
    onSessionEvent,
    shouldUseDailySchedule = true,
  } = options;
  const [events, setEvents] = useState([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isSoftSleeping, setIsSoftSleeping] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_SPEAKER_VOLUME);
  const [micSensitivity, setMicSensitivity] = useState(
    DEFAULT_MIC_SENSITIVITY
  );
  const [micLevel, setMicLevel] = useState(0);
  const [isVoiceAutoReplyEnabled, setIsVoiceAutoReplyEnabled] = useState(
    forceVoiceAutoReplyEnabled || DEFAULT_VOICE_AUTO_REPLY_ENABLED
  );
  const [latestAcceptedTranscript, setLatestAcceptedTranscript] =
    useState(null);
  const [latestResponseStartedEvent, setLatestResponseStartedEvent] =
    useState(null);

  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const sessionTrackRef = useRef(null);

  const outputAudioElementRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const outputGainNodeRef = useRef(null);

  const monitorStreamRef = useRef(null);
  const monitorAudioContextRef = useRef(null);
  const monitorAnalyserRef = useRef(null);
  const monitorProcessedStreamRef = useRef(null);
  const monitorInputGateRef = useRef(null);
  const monitorProcessingReleaseRef = useRef(null);
  const monitorAnimationFrameRef = useRef(null);

  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const manualDisconnectRef = useRef(false);
  const suppressReconnectRef = useRef(false);
  const hasLoadedPreferencesRef = useRef(false);
  const lastVoiceActivityAtRef = useRef(Date.now());
  const lastLocalSpeechDetectedAtRef = useRef(0);
  const lastAssistantActivityAtRef = useRef(null);
  const hasConnectedOnceRef = useRef(false);
  const isSessionActiveRef = useRef(false);
  const startPromiseRef = useRef(null);
  const micSensitivityRef = useRef(DEFAULT_MIC_SENSITIVITY);
  const isVoiceAutoReplyEnabledRef = useRef(
    forceVoiceAutoReplyEnabled || DEFAULT_VOICE_AUTO_REPLY_ENABLED
  );
  const onSessionEventRef = useRef(onSessionEvent);
  const forceAutoReplyOnWakeRef = useRef(false);
  const ambientNoiseFloorRef = useRef(LOCAL_SPEECH_LEVEL_THRESHOLD * 0.25);
  const inputLevelNormalizerRef = useRef(createInputLevelNormalizerState());
  const activeSpeechActivityRef = useRef(null);
  const completedSpeechActivityRef = useRef(null);
  const isInputGateOpenRef = useRef(false);
  const lastInputGateSignalAtRef = useRef(0);
  const isAISpeakingRef = useRef(false);
  const autoTurnStateRef = useRef(createAutoTurnState());
  const pendingTurnLatencyMeasurementRef = useRef(null);

  const logWithTime = (message, ...args) => {
    console.log(getLogTimestamp(), message, ...args);
  };

  const appendEvent = (event) => {
    setEvents((previousEvents) => [event, ...previousEvents]);
  };

  const updateVoiceDisplayEventLatency = ({
    latencyMeasurement,
    sourceEventId,
  }) => {
    if (!sourceEventId) {
      return;
    }

    setEvents((previousEvents) =>
      previousEvents.map((event) =>
        event.sourceEventId === sourceEventId
          ? {
              ...event,
              latencyMeasurement,
            }
          : event
      )
    );
  };

  const resetAutoTurnState = () => {
    autoTurnStateRef.current = createAutoTurnState();
  };

  const emitSessionEvent = ({ direction, event, meta }) => {
    if (!onSessionEventRef.current) {
      return;
    }

    onSessionEventRef.current({
      direction,
      event,
      meta,
    });
  };

  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const clearIdleTimeout = () => {
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  };

  const clearMonitorAnimation = () => {
    if (monitorAnimationFrameRef.current) {
      cancelAnimationFrame(monitorAnimationFrameRef.current);
      monitorAnimationFrameRef.current = null;
    }
  };

  const cleanupOutputAudioResources = () => {
    if (outputAudioElementRef.current) {
      outputAudioElementRef.current.pause();
      outputAudioElementRef.current.srcObject = null;
      outputAudioElementRef.current.remove();
      outputAudioElementRef.current = null;
    }

    if (outputGainNodeRef.current) {
      outputGainNodeRef.current.disconnect();
      outputGainNodeRef.current = null;
    }

    if (outputAudioContextRef.current) {
      const activeContext = outputAudioContextRef.current;
      outputAudioContextRef.current = null;
      activeContext.close().catch(() => null);
    }
  };

  const cleanupMonitoringResources = () => {
    clearMonitorAnimation();

    setInputGateEnabled({
      gateGainNode: monitorInputGateRef.current,
      isEnabled: false,
    });

    if (monitorProcessingReleaseRef.current) {
      monitorProcessingReleaseRef.current();
      monitorProcessingReleaseRef.current = null;
    }

    monitorAnalyserRef.current = null;
    monitorInputGateRef.current = null;

    stopMediaStream(monitorProcessedStreamRef.current);
    monitorProcessedStreamRef.current = null;

    if (monitorAudioContextRef.current) {
      const activeContext = monitorAudioContextRef.current;
      monitorAudioContextRef.current = null;
      activeContext.close().catch(() => null);
    }

    stopMediaStream(monitorStreamRef.current);
    monitorStreamRef.current = null;
    activeSpeechActivityRef.current = null;
    completedSpeechActivityRef.current = null;
    lastAssistantActivityAtRef.current = null;
    pendingTurnLatencyMeasurementRef.current = null;
    resetAutoTurnState();
    ambientNoiseFloorRef.current = LOCAL_SPEECH_LEVEL_THRESHOLD * 0.25;
    inputLevelNormalizerRef.current = createInputLevelNormalizerState();
    isInputGateOpenRef.current = false;
    lastInputGateSignalAtRef.current = 0;
    setMicLevel(0);
  };

  const cleanupSessionConnection = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (sessionTrackRef.current) {
      sessionTrackRef.current.stop();
      sessionTrackRef.current = null;
    }

    cleanupOutputAudioResources();
  };

  const scheduleIdleSleep = () => {
    clearIdleTimeout();

    if (!isSessionActiveRef.current || manualDisconnectRef.current) {
      return;
    }

    idleTimeoutRef.current = window.setTimeout(() => {
      logWithTime('[SLEEP] 10분 무발화 - 세션 절전');
      suppressReconnectRef.current = true;
      isSessionActiveRef.current = false;
      cleanupSessionConnection();
      isAISpeakingRef.current = false;
      setIsSessionActive(false);
      setIsAISpeaking(false);
      if (hasConnectedOnceRef.current) {
        forceAutoReplyOnWakeRef.current = true;
        setIsSoftSleeping(true);
      }
      reconnectAttemptsRef.current = 0;
    }, SOFT_SLEEP_IDLE_MS);
  };

  const resetVoiceActivityTimer = () => {
    lastVoiceActivityAtRef.current = Date.now();
    scheduleIdleSleep();
  };

  const sendClientEvent = (event, options = {}) => {
    const dataChannel = dataChannelRef.current;

    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(
        `${getLogTimestamp()} Failed to send message - no data channel available`,
        event
      );
      return false;
    }

    const outgoingEvent = enrichOutgoingEvent(event);
    const loggedOutgoingEvent = {
      ...outgoingEvent,
      timestamp: createTimestamp(),
    };
    dataChannel.send(JSON.stringify(outgoingEvent));

    emitSessionEvent({
      direction: 'outgoing',
      event: loggedOutgoingEvent,
      meta: options.measurementMeta,
    });

    if (options.shouldLog !== false) {
      appendEvent(loggedOutgoingEvent);
    }

    return true;
  };

  const pushSessionUpdate = () =>
    sendClientEvent(
      buildSessionUpdateEvent({
        micSensitivity: micSensitivityRef.current,
      })
    );

  const stopSession = () => {
    logWithTime('[DISCONNECT] 수동 종료 - 모니터링도 중지');
    manualDisconnectRef.current = true;
    suppressReconnectRef.current = true;
    isSessionActiveRef.current = false;
    clearReconnectTimeout();
    clearIdleTimeout();
    cleanupSessionConnection();
    cleanupMonitoringResources();
    setIsSessionActive(false);
    isAISpeakingRef.current = false;
    setIsAISpeaking(false);
    setIsSoftSleeping(false);
    resetAutoTurnState();
    pendingTurnLatencyMeasurementRef.current = null;
    forceAutoReplyOnWakeRef.current = false;
    reconnectAttemptsRef.current = 0;
  };

  const updateInputGate = (isEnabled) => {
    if (isInputGateOpenRef.current === isEnabled) {
      return;
    }

    isInputGateOpenRef.current = isEnabled;
    setInputGateEnabled({
      gateGainNode: monitorInputGateRef.current,
      isEnabled,
    });
  };

  const startMonitoringLoop = () => {
    clearMonitorAnimation();

    const updateMicLevel = () => {
      const analyser = monitorAnalyserRef.current;
      if (!analyser) {
        return;
      }

      const now = Date.now();
      const rawMicLevel = calculateNormalizedMicLevel(analyser);
      inputLevelNormalizerRef.current = updateInputLevelNormalizerState({
        ambientNoiseFloor: ambientNoiseFloorRef.current,
        level: rawMicLevel,
        now,
        state: inputLevelNormalizerRef.current,
      });
      const normalizedAmbientNoiseFloor = normalizeInputLevel({
        level: ambientNoiseFloorRef.current,
        normalizerState: inputLevelNormalizerRef.current,
      });
      const nextMicLevel = normalizeInputLevel({
        level: rawMicLevel,
        normalizerState: inputLevelNormalizerRef.current,
      });
      setMicLevel(nextMicLevel);

      if (isAISpeakingRef.current) {
        updateInputGate(false);
        monitorAnimationFrameRef.current = requestAnimationFrame(updateMicLevel);
        return;
      }

      const gateDecision = getInputGateDecision({
        ambientNoiseFloor: normalizedAmbientNoiseFloor,
        isGateOpen: isInputGateOpenRef.current,
        lastGateSignalAt: lastInputGateSignalAtRef.current,
        level: nextMicLevel,
        now,
      });
      const isAboveSpeechThreshold =
        gateDecision.shouldTrackSpeech ||
        isLocalSpeechLevelActive({
          activity: activeSpeechActivityRef.current,
          level: nextMicLevel,
          noiseFloorLevel: normalizedAmbientNoiseFloor,
        });

      if (gateDecision.hasFreshGateSignal) {
        lastInputGateSignalAtRef.current = now;
      }

      updateInputGate(gateDecision.gateShouldBeOpen);

      if (!isAboveSpeechThreshold && !gateDecision.gateShouldBeOpen) {
        const ambientNoiseFloor = ambientNoiseFloorRef.current;
        ambientNoiseFloorRef.current =
          ambientNoiseFloor +
          (rawMicLevel - ambientNoiseFloor) * LOCAL_NOISE_FLOOR_ALPHA;
      }

      if (isAboveSpeechThreshold || activeSpeechActivityRef.current) {
        activeSpeechActivityRef.current = recordAudioActivitySample({
          activity: activeSpeechActivityRef.current,
          isAboveSpeechThreshold,
          level: nextMicLevel,
          noiseFloorLevel: normalizedAmbientNoiseFloor,
          now,
        });
      }

      if (
        shouldFinalizeAudioActivity({
          activity: activeSpeechActivityRef.current,
          now,
        })
      ) {
        completedSpeechActivityRef.current = finalizeAudioActivityState(
          activeSpeechActivityRef.current
        );
        activeSpeechActivityRef.current = null;
      }

      const localSpeechActivity = selectRecentAudioActivity({
        activeActivity: activeSpeechActivityRef.current,
        completedActivity: completedSpeechActivityRef.current,
      });
      const hasConfirmedSpeech = shouldWakeFromLocalSpeech({
        activity: localSpeechActivity,
        now,
      });
      const isOutOfCooldown =
        now - lastLocalSpeechDetectedAtRef.current >=
        LOCAL_SPEECH_COOLDOWN_MS;

      if (hasConfirmedSpeech && isOutOfCooldown) {
        lastLocalSpeechDetectedAtRef.current = now;
        resetVoiceActivityTimer();

        if (
          !isSessionActiveRef.current &&
          !manualDisconnectRef.current &&
          !startPromiseRef.current
        ) {
          logWithTime('[WAKE] 로컬 음성 감지 - 세션 재시작');
          startSession().catch((error) => {
            console.error(
              `${getLogTimestamp()} [ERROR] 음성 감지 자동 재시작 실패:`,
              error
            );
          });
        }
      }

      monitorAnimationFrameRef.current = requestAnimationFrame(updateMicLevel);
    };

    monitorAnimationFrameRef.current = requestAnimationFrame(updateMicLevel);
  };

  const ensureMonitoringReady = async () => {
    if (monitorStreamRef.current && monitorAnalyserRef.current) {
      if (monitorAudioContextRef.current?.state === 'suspended') {
        await monitorAudioContextRef.current.resume();
      }
      return monitorProcessedStreamRef.current || monitorStreamRef.current;
    }

    const monitorStream = await navigator.mediaDevices.getUserMedia(
      getMicrophoneConstraints()
    );
    const monitorAudioContext = getAudioContext();
    const monitorProcessingGraph = createMicrophoneProcessingGraph({
      audioContext: monitorAudioContext,
      stream: monitorStream,
    });

    monitorStreamRef.current = monitorStream;
    monitorAudioContextRef.current = monitorAudioContext;
    monitorProcessedStreamRef.current = monitorProcessingGraph.processedStream;
    monitorAnalyserRef.current = monitorProcessingGraph.analyser;
    monitorInputGateRef.current = monitorProcessingGraph.gateGain;
    monitorProcessingReleaseRef.current = monitorProcessingGraph.release;
    isInputGateOpenRef.current = false;
    setInputGateEnabled({
      gateGainNode: monitorInputGateRef.current,
      isEnabled: false,
    });

    startMonitoringLoop();
    return monitorProcessingGraph.processedStream;
  };

  const handleTranscriptionCompleted = (event) => {
    const observedAtMs = Date.now();
    const recentAudioActivity = selectRecentAudioActivity({
      activeActivity: activeSpeechActivityRef.current,
      completedActivity: completedSpeechActivityRef.current,
    });
    const utteranceDecision = qualifyUtterance({
      activity: recentAudioActivity,
      event,
      now: observedAtMs,
    });
    const userDirectedDecision = qualifyUserDirectedSpeech({
      now: observedAtMs,
      recentAssistantActivityAtMs: lastAssistantActivityAtRef.current,
      utteranceDecision,
    });

    if (!userDirectedDecision.isQualified) {
      logWithTime(
        `[USER_VOICE] 음성 입력 무시 (${userDirectedDecision.reason}):`,
        userDirectedDecision.transcript || '(빈 전사)'
      );
      return;
    }

    const { transcript } = userDirectedDecision;

    setLatestAcceptedTranscript({
      audioSignals: userDirectedDecision.audioSignals,
      eventId: event.event_id,
      observedAtMs,
      reason: userDirectedDecision.reason,
      transcript,
      transcriptSignals: userDirectedDecision.transcriptSignals,
      userDirectedSignals: userDirectedDecision.userDirectedSignals,
    });

    resetVoiceActivityTimer();
    appendEvent(
      createVoiceDisplayEvent(transcript, {
        sourceEventId: event.event_id,
      })
    );
    logWithTime('[USER_VOICE] 음성 입력 :', transcript);

    const qualifiedTurnHandoff = buildQualifiedTurnHandoff({
      forceAutoReplyOnWake: forceAutoReplyOnWakeRef.current,
      isVoiceAutoReplyEnabled:
        forceVoiceAutoReplyEnabled || isVoiceAutoReplyEnabledRef.current,
      turnState: autoTurnStateRef.current,
      utteranceDecision: userDirectedDecision,
    });

    if (!qualifiedTurnHandoff) {
      if (!isAutoTurnReady(autoTurnStateRef.current)) {
        logWithTime('[TURN] 이전 자동응답 완료 대기 중 - 새 발화는 다음 턴으로 보류');
      }
      return;
    }

    if (qualifiedTurnHandoff.trigger === 'wake_recovery') {
      logWithTime('[WAKE] 절전 복귀 직후 자동응답 실행');
    } else {
      logWithTime(
        `[TURN] 자격 통과 발화 즉시 handoff (${qualifiedTurnHandoff.trigger})`
      );
    }

    const turnLatencyMeasurement = createTurnLatencyMeasurement({
      transcript,
      turnId: event.event_id,
      utteranceEndedAtMs: recentAudioActivity?.lastSpeechAt || observedAtMs,
      utteranceEventId: event.event_id,
    });
    pendingTurnLatencyMeasurementRef.current = turnLatencyMeasurement;
    updateVoiceDisplayEventLatency({
      latencyMeasurement: turnLatencyMeasurement,
      sourceEventId: event.event_id,
    });

    const [commitEvent, responseEvent] = qualifiedTurnHandoff.handoffEvents;
    const didCommitInputAudio = sendClientEvent(commitEvent, {
      shouldLog: false,
    });

    if (!didCommitInputAudio) {
      pendingTurnLatencyMeasurementRef.current = null;
      updateVoiceDisplayEventLatency({
        latencyMeasurement: null,
        sourceEventId: event.event_id,
      });
      resetAutoTurnState();
      return;
    }

    const didSendAutoTurnResponse = sendClientEvent(responseEvent, {
      measurementMeta: qualifiedTurnHandoff.measurementMeta,
      shouldLog: false,
    });

    if (!didSendAutoTurnResponse) {
      pendingTurnLatencyMeasurementRef.current = null;
      updateVoiceDisplayEventLatency({
        latencyMeasurement: null,
        sourceEventId: event.event_id,
      });
      resetAutoTurnState();
      return;
    }

    autoTurnStateRef.current = qualifiedTurnHandoff.nextTurnState;
    forceAutoReplyOnWakeRef.current = false;
  };

  const handleRealtimeEvent = (rawEvent) => {
    let event = enrichIncomingEvent(rawEvent);
    const nextAutoTurnState = reduceAutoTurnState({
      event,
      turnState: autoTurnStateRef.current,
    });

    if (nextAutoTurnState !== autoTurnStateRef.current) {
      autoTurnStateRef.current = nextAutoTurnState;
      logWithTime('[TURN] 자동응답 턴 reset - 다음 자연 발화 재대기');
    }

    emitSessionEvent({
      direction: 'incoming',
      event,
    });

    if (event.type === 'output_audio_buffer.started') {
      const observedAtMs = Date.now();
      const completedTurnLatencyMeasurement = completeTurnLatencyMeasurement({
        measurement: pendingTurnLatencyMeasurementRef.current,
        responseEventId: event.event_id,
        responseStartedAtMs: observedAtMs,
      });

      if (completedTurnLatencyMeasurement) {
        pendingTurnLatencyMeasurementRef.current = null;
        updateVoiceDisplayEventLatency({
          latencyMeasurement: completedTurnLatencyMeasurement,
          sourceEventId: completedTurnLatencyMeasurement.utteranceEventId,
        });
        event = {
          ...event,
          latencyMeasurement: completedTurnLatencyMeasurement,
        };
      }

      logWithTime('[AI_START] AI 말하기 시작 - 마이크 차단');
      setLatestResponseStartedEvent({
        eventId: event.event_id,
        latencyMeasurement: completedTurnLatencyMeasurement,
        observedAtMs,
      });
      lastAssistantActivityAtRef.current = observedAtMs;
      isAISpeakingRef.current = true;
      setIsAISpeaking(true);
      updateInputGate(false);
      setPeerAudioTrackEnabled(peerConnectionRef.current, false);
    }

    if (event.type === 'output_audio_buffer.stopped') {
      logWithTime('[AI_STOP] AI 말하기 종료 - 마이크 활성화');
      lastAssistantActivityAtRef.current = Date.now();
      isAISpeakingRef.current = false;
      setIsAISpeaking(false);
      setPeerAudioTrackEnabled(peerConnectionRef.current, true);
    }

    if (event.type === 'error') {
      console.error(`${getLogTimestamp()} [REALTIME_ERROR]`, event.error);
    }

    if (event.type === 'response.done') {
      pendingTurnLatencyMeasurementRef.current = null;
    }

    appendEvent(event);

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      handleTranscriptionCompleted(event);
    }
  };

  const handleDataChannelOpen = () => {
    logWithTime('[DATACHANNEL] DataChannel open');
    hasConnectedOnceRef.current = true;
    isSessionActiveRef.current = true;
    activeSpeechActivityRef.current = null;
    completedSpeechActivityRef.current = null;
    lastAssistantActivityAtRef.current = null;
    pendingTurnLatencyMeasurementRef.current = null;
    resetAutoTurnState();
    setEvents([]);
    setIsSessionActive(true);
    setIsSoftSleeping(false);
    pushSessionUpdate();
    resetVoiceActivityTimer();
  };

  const startSession = async () => {
    if (isSessionActiveRef.current) {
      return true;
    }

    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    const startPromise = (async () => {
      try {
        logWithTime('[SESSION] 세션 시작 요청...');
        manualDisconnectRef.current = false;
        suppressReconnectRef.current = false;
        clearReconnectTimeout();
        clearIdleTimeout();
        cleanupSessionConnection();

        const processedMonitorStream = await ensureMonitoringReady();
        const tokenResponse = await fetch('/token');
        const data = await tokenResponse.json();

        if (data.error) {
          throw new Error(
            `Token error: ${data.error.message || JSON.stringify(data.error)}`
          );
        }

        const ephemeralKey = data.client_secret?.value || data.value;
        if (!ephemeralKey) {
          throw new Error('Ephemeral key not found in response');
        }

        const peerConnection = new RTCPeerConnection();
        const outputAudioContext = getAudioContext();
        const outputAudioElement = createAudioElement();

        peerConnectionRef.current = peerConnection;
        outputAudioContextRef.current = outputAudioContext;
        outputAudioElementRef.current = outputAudioElement;

        outputAudioElement.addEventListener('canplay', () => {
          logWithTime('[AUDIO] 오디오 재생 준비 완료');
        });

        outputAudioElement.addEventListener('playing', () => {
          logWithTime('[AUDIO] 오디오 재생 시작');
        });

        outputAudioElement.addEventListener('error', (error) => {
          console.error(
            `${getLogTimestamp()} [AUDIO_ERROR] 오디오 재생 실패:`,
            error
          );
        });

        peerConnection.ontrack = async (event) => {
          logWithTime('[TRACK] 오디오 트랙 수신');

          if (outputAudioContext.state === 'suspended') {
            await outputAudioContext.resume();
          }

          const source =
            outputAudioContext.createMediaStreamSource(event.streams[0]);
          outputGainNodeRef.current = outputAudioContext.createGain();
          outputGainNodeRef.current.gain.value = volume;
          source.connect(outputGainNodeRef.current);
          outputGainNodeRef.current.connect(outputAudioContext.destination);

          outputAudioElement.srcObject = event.streams[0];

          try {
            await outputAudioElement.play();
            outputAudioElement.volume = 0;
          } catch (error) {
            console.error(
              `${getLogTimestamp()} [AUDIO_ERROR] 오디오 재생 실패:`,
              error
            );
          }
        };

        const sessionTrack = processedMonitorStream.getAudioTracks()[0].clone();
        sessionTrackRef.current = sessionTrack;
        peerConnection.addTrack(sessionTrack, new MediaStream([sessionTrack]));

        const dataChannel = peerConnection.createDataChannel('oai-events');
        dataChannelRef.current = dataChannel;
        dataChannel.addEventListener('open', handleDataChannelOpen);
        dataChannel.addEventListener('close', () => {
          logWithTime('[DATACHANNEL] DataChannel closed');
          isSessionActiveRef.current = false;
          isAISpeakingRef.current = false;
          resetAutoTurnState();
          setIsSessionActive(false);
        });
        dataChannel.addEventListener('error', (error) => {
          console.error(`${getLogTimestamp()} [ERROR] DataChannel error:`, error);
        });
        dataChannel.addEventListener('message', (messageEvent) => {
          handleRealtimeEvent(JSON.parse(messageEvent.data));
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const sdpResponse = await fetch(
          'https://api.openai.com/v1/realtime/calls',
          {
            method: 'POST',
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${ephemeralKey}`,
              'Content-Type': 'application/sdp',
            },
          }
        );

        if (!sdpResponse.ok) {
          const errorText = await sdpResponse.text();
          throw new Error(`SDP API error: ${sdpResponse.status} - ${errorText}`);
        }

        const sdp = await sdpResponse.text();
        await peerConnection.setRemoteDescription({ type: 'answer', sdp });

        peerConnection.addEventListener('connectionstatechange', () => {
          logWithTime('[CONNECTION] 연결 상태:', peerConnection.connectionState);

          if (
            (peerConnection.connectionState === 'failed' ||
              peerConnection.connectionState === 'disconnected') &&
            !manualDisconnectRef.current &&
            !suppressReconnectRef.current &&
            reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
          ) {
            reconnectAttemptsRef.current += 1;
            cleanupSessionConnection();

            reconnectTimeoutRef.current = window.setTimeout(() => {
              startSession().catch((error) => {
                console.error(
                  `${getLogTimestamp()} [ERROR] 자동 재연결 실패:`,
                  error
                );
              });
            }, 3000);
          }
        });

        peerConnection.addEventListener('iceconnectionstatechange', () => {
          logWithTime('[ICE] ICE 연결 상태:', peerConnection.iceConnectionState);
        });

        reconnectAttemptsRef.current = 0;
        return true;
      } catch (error) {
        console.error(`${getLogTimestamp()} [ERROR] 세션 시작 실패:`, error);
        cleanupSessionConnection();
        clearIdleTimeout();
        isSessionActiveRef.current = false;
        isAISpeakingRef.current = false;
        resetAutoTurnState();
        setIsSessionActive(false);
        setIsAISpeaking(false);
        setIsSoftSleeping(
          Boolean(monitorStreamRef.current) && hasConnectedOnceRef.current
        );
        reconnectAttemptsRef.current = 0;
        throw error;
      } finally {
        startPromiseRef.current = null;
      }
    })();

    startPromiseRef.current = startPromise;
    return startPromise;
  };

  const sendTextMessage = (message) => {
    forceAutoReplyOnWakeRef.current = false;
    sendClientEvent(buildTextMessageEvent(message));
    sendClientEvent(buildResponseCreateEvent(), {
      measurementMeta: {
        transcript: message,
        trigger: 'text_message',
      },
    });
  };

  const updateVoiceAutoReplyEnabled = (nextValue) => {
    setIsVoiceAutoReplyEnabled(Boolean(nextValue));
  };

  const toggleVoiceAutoReply = () => {
    if (forceVoiceAutoReplyEnabled) {
      return;
    }

    setIsVoiceAutoReplyEnabled((previousValue) => !previousValue);
  };

  useEffect(() => {
    onSessionEventRef.current = onSessionEvent;
  }, [onSessionEvent]);

  useEffect(() => {
    if (forceVoiceAutoReplyEnabled) {
      setIsVoiceAutoReplyEnabled(true);
      isVoiceAutoReplyEnabledRef.current = true;
      hasLoadedPreferencesRef.current = true;
      return;
    }

    const savedMicSensitivity = localStorage.getItem(
      MIC_SENSITIVITY_STORAGE_KEY
    );
    const savedVoiceAutoReply = getStoredBoolean(
      VOICE_AUTO_REPLY_STORAGE_KEY,
      DEFAULT_VOICE_AUTO_REPLY_ENABLED
    );

    const nextMicSensitivity = getValidatedMicSensitivity(savedMicSensitivity);
    setMicSensitivity(nextMicSensitivity);
    micSensitivityRef.current = nextMicSensitivity;

    setIsVoiceAutoReplyEnabled(savedVoiceAutoReply);
    isVoiceAutoReplyEnabledRef.current = savedVoiceAutoReply;

    hasLoadedPreferencesRef.current = true;
  }, []);

  useEffect(() => {
    micSensitivityRef.current = micSensitivity;

    if (!hasLoadedPreferencesRef.current) {
      return;
    }

    localStorage.setItem(
      MIC_SENSITIVITY_STORAGE_KEY,
      micSensitivity.toString()
    );

    if (isSessionActiveRef.current) {
      pushSessionUpdate();
    }
  }, [micSensitivity]);

  useEffect(() => {
    isVoiceAutoReplyEnabledRef.current = isVoiceAutoReplyEnabled;

    if (!hasLoadedPreferencesRef.current || forceVoiceAutoReplyEnabled) {
      return;
    }

    localStorage.setItem(
      VOICE_AUTO_REPLY_STORAGE_KEY,
      isVoiceAutoReplyEnabled.toString()
    );
  }, [isVoiceAutoReplyEnabled]);

  useEffect(() => {
    if (outputGainNodeRef.current) {
      outputGainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  useEffect(() => {
    if (!shouldUseDailySchedule) {
      return;
    }

    const checkSchedule = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      if (hour === 8 && minute === 50 && !isSessionActive) {
        logWithTime('[SCHEDULE] 08:50 자동 접속 시작');
        startSession().catch((error) => {
          console.error(`${getLogTimestamp()} [ERROR] 예약 접속 실패:`, error);
        });
      }

      if (hour === 17 && minute === 50 && isSessionActive) {
        logWithTime('[SCHEDULE] 17:50 자동 종료');
        stopSession();
      }
    };

    const scheduleInterval = window.setInterval(checkSchedule, 60000);
    return () => window.clearInterval(scheduleInterval);
  }, [isSessionActive, shouldUseDailySchedule]);

  useEffect(
    () => () => {
      manualDisconnectRef.current = true;
      suppressReconnectRef.current = true;
      clearReconnectTimeout();
      clearIdleTimeout();
      cleanupSessionConnection();
      cleanupMonitoringResources();
    },
    []
  );

  return {
    createTimestamp,
    events,
    isAISpeaking,
    isSessionActive,
    isSoftSleeping,
    isVoiceAutoReplyEnabled,
    latestAcceptedTranscript,
    latestResponseStartedEvent,
    micLevel,
    micSensitivity,
    sendClientEvent,
    sendTextMessage,
    setMicSensitivity,
    setVolume,
    startSession,
    stopSession,
    toggleVoiceAutoReply,
    updateVoiceAutoReplyEnabled,
    volume,
  };
};
