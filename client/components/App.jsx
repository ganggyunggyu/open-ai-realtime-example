import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import EventLog from './EventLog';
import SessionControls from './SessionControls';
import { Moon, Sun, Volume2, Wifi, WifiOff, Mic, MicOff } from 'react-feather';

const DEFAULT_SPEAKER_VOLUME = 2.5;
const DEFAULT_MIC_SENSITIVITY = 0.75;

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_SPEAKER_VOLUME);
  const [micSensitivity, setMicSensitivity] = useState(
    DEFAULT_MIC_SENSITIVITY
  );
  const [micLevel, setMicLevel] = useState(0);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const dataChannelRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const manualDisconnect = useRef(false);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const logWithTime = (message, ...args) => {
    console.log(`[${getTimestamp()}]`, message, ...args);
  };

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  async function startSession() {
    try {
      logWithTime('[SESSION] 세션 시작 요청...');

      const tokenResponse = await fetch('/token');
      const data = await tokenResponse.json();

      logWithTime('[TOKEN] 토큰 응답:', JSON.stringify(data, null, 2));

      if (data.error) {
        throw new Error(`Token error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const EPHEMERAL_KEY = data.client_secret?.value || data.value;

      if (!EPHEMERAL_KEY) {
        throw new Error('Ephemeral key not found in response');
      }

      logWithTime('[TOKEN] Ephemeral key 획득 성공');

      const pc = new RTCPeerConnection();

      // 기존 오디오 엘리먼트 정리
      if (audioElement.current) {
        audioElement.current.pause();
        audioElement.current.srcObject = null;
        audioElement.current.remove();
        logWithTime('[AUDIO] 기존 오디오 element 제거');
      }

      // 새 오디오 엘리먼트 생성
      audioElement.current = document.createElement('audio');
      audioElement.current.autoplay = true;

      // AudioContext로 볼륨 조절
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      audioElement.current.addEventListener('canplay', () => {
        logWithTime('[AUDIO] 오디오 재생 준비 완료');
      });

      audioElement.current.addEventListener('playing', () => {
        logWithTime('[AUDIO] 오디오 재생 시작');
      });

      audioElement.current.addEventListener('error', (e) => {
        console.error(`[${getTimestamp()}] [AUDIO_ERROR] 오디오 재생 실패:`, e);
      });

      pc.ontrack = async (e) => {
        logWithTime('[TRACK] 오디오 트랙 수신');

        if (!audioElement.current) {
          console.error(`[${getTimestamp()}] [AUDIO_ERROR] audio element가 없음`);
          return;
        }

        // AudioContext로 볼륨 조절 연결
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        const source = audioContextRef.current.createMediaStreamSource(e.streams[0]);
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.gain.value = volume;
        gainNodeRef.current.connect(audioContextRef.current.destination);
        source.connect(gainNodeRef.current);

        // 백업용 audio 엘리먼트도 연결 (브라우저 호환성)
        audioElement.current.srcObject = e.streams[0];

        try {
          await audioElement.current.play();
          // AudioContext가 제대로 작동하면 audio 엘리먼트는 음소거
          audioElement.current.volume = 0;
          logWithTime('[AUDIO] AudioContext로 재생 중');
        } catch (error) {
          console.error(`[${getTimestamp()}] [AUDIO_ERROR] 오디오 재생 실패:`, error);
        }
      };

      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      pc.addTrack(ms.getTracks()[0]);

      // 마이크 레벨 시각화를 위한 AnalyserNode 설정
      const micSource = audioContextRef.current.createMediaStreamSource(ms);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      micSource.connect(analyserRef.current);

      const updateMicLevel = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(average / 255);
        animationFrameRef.current = requestAnimationFrame(updateMicLevel);
      };
      updateMicLevel();

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
      setDataChannel(dc);

      dc.addEventListener('open', () => {
        const sessionConfig = {
          type: 'session.update',
          session: {
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: micSensitivity,
              prefix_padding_ms: 300,
              silence_duration_ms: 700,
            },
          },
        };
        dc.send(JSON.stringify(sessionConfig));
        logWithTime('[CONFIG] 음성 활성화, 마이크 감도:', micSensitivity);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      logWithTime('[SDP] Offer 생성 완료, API 요청 중...');

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });

      logWithTime('[SDP] API 응답 상태:', sdpResponse.status);

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        logWithTime('[SDP_ERROR] 응답 내용:', errorText);
        throw new Error(`SDP API error: ${sdpResponse.status} - ${errorText}`);
      }

      const sdp = await sdpResponse.text();

      if (!sdp || !sdp.startsWith('v=')) {
        logWithTime('[SDP_ERROR] 유효하지 않은 SDP 응답:', sdp.substring(0, 200));
        throw new Error('Invalid SDP response from API');
      }

      logWithTime('[SDP] 유효한 SDP 응답 수신');

      const answer = { type: 'answer', sdp };
      await pc.setRemoteDescription(answer);

      logWithTime('[SDP] Remote description 설정 완료');

      pc.addEventListener('connectionstatechange', () => {
        logWithTime('[CONNECTION] 연결 상태:', pc.connectionState);

        if (
          (pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected') &&
          !manualDisconnect.current &&
          reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
        ) {
          logWithTime(
            `[RECONNECT] 재연결 시도 ${
              reconnectAttempts.current + 1
            }/${MAX_RECONNECT_ATTEMPTS}`
          );
          reconnectAttempts.current += 1;

          if (peerConnection.current) {
            peerConnection.current.close();
          }
          if (dataChannelRef.current) {
            dataChannelRef.current.close();
          }

          setTimeout(() => {
            startSession();
          }, 3000);
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error(
            `[${getTimestamp()}] [ERROR] 재연결 최대 시도 횟수 초과`
          );
        }
      });

      pc.addEventListener('iceconnectionstatechange', () => {
        logWithTime('[ICE] ICE 연결 상태:', pc.iceConnectionState);
      });

      peerConnection.current = pc;

      reconnectAttempts.current = 0;
      manualDisconnect.current = false;

      return true;
    } catch (error) {
      console.error(`[${getTimestamp()}] [ERROR] 세션 시작 실패:`, error);
      throw error;
    }
  }

  useQuery({
    queryKey: ['session-init'],
    queryFn: startSession,
    staleTime: Infinity,
    retry: false,
  });

  function stopSession() {
    logWithTime('[DISCONNECT] 수동 종료 - 재연결 안함');
    manualDisconnect.current = true;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    if (audioElement.current) {
      audioElement.current.pause();
      audioElement.current.srcObject = null;
      audioElement.current.remove();
      audioElement.current = null;
      logWithTime('[AUDIO] 오디오 element 정리 완료');
    }

    setIsSessionActive(false);
    setIsAISpeaking(false);
    setMicLevel(0);
    setDataChannel(null);
    dataChannelRef.current = null;
    peerConnection.current = null;
    reconnectAttempts.current = 0;
  }

  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      dataChannel.send(JSON.stringify(message));

      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        `[${getTimestamp()}] Failed to send message - no data channel available`,
        message
      );
    }
  }

  function sendTextMessage(message) {
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: 'response.create' });
  }

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // 마이크 감도 변경 시 session.update 전송
  useEffect(() => {
    if (dataChannel && dataChannel.readyState === 'open') {
      const sessionConfig = {
        type: 'session.update',
        session: {
          turn_detection: {
            type: 'server_vad',
            threshold: micSensitivity,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
        },
      };
      dataChannel.send(JSON.stringify(sessionConfig));
      logWithTime('[CONFIG] 마이크 감도 변경:', micSensitivity);
    }
  }, [micSensitivity]);

  useEffect(() => {
    logWithTime(
      '[SESSION_STATE] 연결 상태 변화:',
      isSessionActive ? '연결됨' : '연결 끊김'
    );
  }, [isSessionActive]);

  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      if (hour === 8 && minute === 50 && !isSessionActive) {
        logWithTime('[SCHEDULE] 08:50 자동 접속 시작');
        startSession();
      }

      if (hour === 17 && minute === 50 && isSessionActive) {
        logWithTime('[SCHEDULE] 17:50 자동 종료');
        stopSession();
      }
    };

    const scheduleInterval = setInterval(checkSchedule, 60000);

    return () => clearInterval(scheduleInterval);
  }, [isSessionActive]);

  useEffect(() => {
    if (dataChannel) {
      dataChannel.addEventListener('close', () => {
        logWithTime('[DATACHANNEL] DataChannel closed');
        setIsSessionActive(false);
      });

      dataChannel.addEventListener('error', (error) => {
        console.error(`[${getTimestamp()}] [ERROR] DataChannel error:`, error);
      });

      dataChannel.addEventListener('message', (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        if (
          event.type === 'conversation.item.input_audio_transcription.completed'
        ) {
          logWithTime('[USER_VOICE] 음성 입력 :', event.transcript);
          const userVoiceEvent = {
            type: 'conversation.item.create',
            event_id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  transcript: event.transcript,
                },
              ],
            },
          };
          setEvents((prev) => [userVoiceEvent, ...prev]);
        }

        if (event.type === 'output_audio_buffer.started') {
          logWithTime('[AI_START] AI 말하기 시작 - 마이크 차단');
          setIsAISpeaking(true);
          if (peerConnection.current) {
            peerConnection.current.getSenders().forEach((sender) => {
              if (sender.track && sender.track.kind === 'audio') {
                sender.track.enabled = false;
              }
            });
          }
        }

        if (event.type === 'output_audio_buffer.stopped') {
          logWithTime('[AI_STOP] AI 말하기 종료 - 마이크 활성화');
          setIsAISpeaking(false);
          if (peerConnection.current) {
            peerConnection.current.getSenders().forEach((sender) => {
              if (sender.track && sender.track.kind === 'audio') {
                sender.track.enabled = true;
              }
            });
          }
        }

        setEvents((prev) => [event, ...prev]);
      });

      dataChannel.addEventListener('open', () => {
        setIsSessionActive(true);
        setEvents([]);
      });
    }
  }, [dataChannel]);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)] dark:bg-[var(--color-bg)]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-[var(--color-gray-200)] dark:border-[var(--color-gray-700)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shadow-md">
                <span className="text-white text-lg font-bold">S</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[var(--color-gray-900)] dark:text-white">
                  사라도령
                </h1>
                <p className="text-xs text-[var(--color-gray-500)]">AI Voice Assistant</p>
              </div>
            </div>

            {/* Status & Controls */}
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
                isSessionActive
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-500)]'
              }`}>
                {isSessionActive ? (
                  <>
                    <Wifi size={14} />
                    <span className="hidden sm:inline">연결됨</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={14} />
                    <span className="hidden sm:inline">연결 끊김</span>
                  </>
                )}
              </div>

              {/* AI Speaking Status + Mic Level */}
              {isSessionActive && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
                  isAISpeaking
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] animate-pulse-soft'
                    : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-500)]'
                }`}>
                  {isAISpeaking ? (
                    <>
                      <MicOff size={14} />
                      <span className="hidden sm:inline">AI 응답 중</span>
                    </>
                  ) : (
                    <>
                      {/* Mic Level Indicator */}
                      <div className="flex items-center gap-0.5">
                        {[0.2, 0.4, 0.6, 0.8].map((threshold, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-75 ${
                              micLevel > threshold
                                ? 'bg-[var(--color-success)]'
                                : 'bg-[var(--color-gray-300)] dark:bg-[var(--color-gray-600)]'
                            }`}
                            style={{ height: `${8 + i * 3}px` }}
                          />
                        ))}
                      </div>
                      <span className="hidden sm:inline">대기 중</span>
                    </>
                  )}
                </div>
              )}

              {/* Volume Control */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)]">
                <Volume2 size={14} className="text-[var(--color-gray-500)]" />
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-[var(--color-gray-300)] dark:bg-[var(--color-gray-600)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--color-gray-500)] w-8 text-right">
                  {Math.round(volume * 100)}%
                </span>
              </div>

              {/* Mic Sensitivity Control */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)]">
                <Mic size={14} className="text-[var(--color-gray-500)]" />
                <input
                  type="range"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={micSensitivity}
                  onChange={(e) => setMicSensitivity(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-[var(--color-gray-300)] dark:bg-[var(--color-gray-600)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--color-gray-500)] w-8 text-right">
                  {Math.round((1 - micSensitivity) * 100)}%
                </span>
              </div>

              {/* Dark Mode Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2.5 rounded-xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)] dark:hover:bg-[var(--color-gray-600)] transition-all duration-200"
                aria-label="다크모드 토글"
              >
                {isDarkMode ? (
                  <Sun size={18} className="text-[var(--color-warning)]" />
                ) : (
                  <Moon size={18} className="text-[var(--color-gray-600)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-4xl mx-auto flex flex-col">
          {isSessionActive ? (
            <>
              {/* Chat Area */}
              <section className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                <EventLog events={events} />
              </section>

              {/* Input Area */}
              <section className="border-t border-[var(--color-gray-200)] dark:border-[var(--color-gray-700)] bg-[var(--color-bg)] dark:bg-[var(--color-bg)]">
                <div className="px-4 sm:px-6 py-4">
                  <SessionControls
                    startSession={startSession}
                    stopSession={stopSession}
                    sendClientEvent={sendClientEvent}
                    sendTextMessage={sendTextMessage}
                    events={events}
                    isSessionActive={isSessionActive}
                    isAISpeaking={isAISpeaking}
                  />
                </div>
              </section>
            </>
          ) : (
            /* Disconnected State */
            <section className="flex-1 flex items-center justify-center px-4 sm:px-6">
              <div className="text-center animate-fade-in">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl gradient-primary flex items-center justify-center shadow-lg">
                  <WifiOff size={32} className="text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-[var(--color-gray-900)] dark:text-white mb-2">
                  연결이 필요해요
                </h2>
                <p className="text-[var(--color-gray-500)] mb-8 max-w-sm mx-auto">
                  AI 어시스턴트와 대화를 시작하려면<br />아래 버튼을 눌러주세요
                </p>
                <SessionControls
                  startSession={startSession}
                  stopSession={stopSession}
                  sendClientEvent={sendClientEvent}
                  sendTextMessage={sendTextMessage}
                  events={events}
                  isSessionActive={isSessionActive}
                  isAISpeaking={isAISpeaking}
                />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
