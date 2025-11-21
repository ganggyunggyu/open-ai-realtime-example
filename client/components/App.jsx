import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import logo from '/assets/openai-logomark.svg';
import EventLog from './EventLog';
import SessionControls from './SessionControls';
import { Moon, Sun } from 'react-feather';

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
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
      const tokenResponse = await fetch('/token');
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.value;

      const pc = new RTCPeerConnection();

      if (audioElement.current) {
        audioElement.current.pause();
        audioElement.current.srcObject = null;
        audioElement.current.remove();
        logWithTime('[AUDIO] 기존 오디오 element 제거');
      }

      audioElement.current = document.createElement('audio');
      audioElement.current.autoplay = true;

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
          console.error(
            `[${getTimestamp()}] [AUDIO_ERROR] audio element가 없음`
          );
          return;
        }

        audioElement.current.srcObject = e.streams[0];

        try {
          await audioElement.current.play();
          logWithTime('[AUDIO] 오디오 재생 시작 성공');
        } catch (error) {
          console.error(
            `[${getTimestamp()}] [AUDIO_ERROR] 오디오 재생 실패:`,
            error
          );
        }
      };

      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      pc.addTrack(ms.getTracks()[0]);

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
              threshold: 0.1,
              prefix_padding_ms: 100,
              silence_duration_ms: 100,
            },
          },
        };
        dc.send(JSON.stringify(sessionConfig));
        logWithTime('[CONFIG] 음성 활성화 + VAD 설정 (침묵 1초)');
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = 'https://api.openai.com/v1/realtime/calls';
      const model = 'gpt-realtime-mini-2025-10-06';
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });

      const sdp = await sdpResponse.text();
      const answer = { type: 'answer', sdp };
      await pc.setRemoteDescription(answer);

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
    if (!dataChannel) return;

    const handleClose = () => {
      logWithTime('[DATACHANNEL] DataChannel closed');
      setIsSessionActive(false);
    };

    const handleError = (error) => {
      console.error(`[${getTimestamp()}] [ERROR] DataChannel error:`, error);
    };

    const handleMessage = (e) => {
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
          event_id: event.event_id || crypto.randomUUID(),
          timestamp: event.timestamp,
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

        // 디버깅: 생성된 이벤트 확인
        logWithTime('[DEBUG] userVoiceEvent:', JSON.stringify(userVoiceEvent));

        setEvents((prev) => {
          logWithTime('[DEBUG] 이벤트 추가 전 개수:', prev.length);
          const newEvents = [userVoiceEvent, ...prev];
          logWithTime('[DEBUG] 이벤트 추가 후 개수:', newEvents.length);
          return newEvents;
        });
        return;
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
        return;
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

        return;
      }

      setEvents((prev) => {
        if (event.event_id && prev.some((e) => e.event_id === event.event_id)) {
          return prev;
        }
        return [event, ...prev];
      });
    };

    const handleOpen = () => {
      setIsSessionActive(true);
      setEvents([]);
    };

    dataChannel.addEventListener('close', handleClose);
    dataChannel.addEventListener('error', handleError);
    dataChannel.addEventListener('message', handleMessage);
    dataChannel.addEventListener('open', handleOpen);

    return () => {
      dataChannel.removeEventListener('close', handleClose);
      dataChannel.removeEventListener('error', handleError);
      dataChannel.removeEventListener('message', handleMessage);
      dataChannel.removeEventListener('open', handleOpen);
    };
  }, [dataChannel]);

  return (
    <>
      <nav className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 md:gap-4 w-full">
          <img className="w-6 h-6" src={logo} alt="logo" />
          <h1 className="text-lg md:text-xl font-semibold dark:text-white">
            사라도령
          </h1>
          {isSessionActive && (
            <div className="flex items-center gap-2 ml-auto">
              <div
                className={`w-2 h-2 rounded-full ${
                  isAISpeaking ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}
              />
              <span className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                {isAISpeaking ? 'AI 말하는 중...' : '대기 중'}
              </span>
            </div>
          )}
          <button
            onClick={toggleDarkMode}
            className="ml-auto p-2 rounded-lg transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
            aria-label="다크모드 토글"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            )}
          </button>
        </div>
      </nav>
      <main className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-white dark:bg-gray-900">
        {/* 왼쪽: EventLog + Controls */}
        <section className="flex-1 flex flex-col h-full">
          {isSessionActive ? (
            <>
              <section className="flex-1 px-2 md:px-4 py-2 overflow-y-auto">
                <EventLog events={events} />
              </section>
              <section className="h-28 md:h-32 p-2 md:p-4 border-t border-gray-200 dark:border-gray-700">
                <SessionControls
                  startSession={startSession}
                  stopSession={stopSession}
                  sendClientEvent={sendClientEvent}
                  sendTextMessage={sendTextMessage}
                  events={events}
                  isSessionActive={isSessionActive}
                  isAISpeaking={isAISpeaking}
                />
              </section>
            </>
          ) : (
            <section className="flex items-center justify-center h-full">
              <SessionControls
                startSession={startSession}
                stopSession={stopSession}
                sendClientEvent={sendClientEvent}
                sendTextMessage={sendTextMessage}
                events={events}
                isSessionActive={isSessionActive}
                isAISpeaking={isAISpeaking}
              />
            </section>
          )}
        </section>
      </main>
    </>
  );
}
