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

  // 다크모드 초기화 (localStorage에서 읽기)
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // 다크모드 토글
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
      // Get a session token for OpenAI Realtime API
      const tokenResponse = await fetch('/token');
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.value;

      // Create a peer connection
      const pc = new RTCPeerConnection();

      // Set up to play remote audio from the model
      audioElement.current = document.createElement('audio');
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

      // Add local audio track for microphone input in the browser
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      pc.addTrack(ms.getTracks()[0]);

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
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

      // 연결 상태 모니터링 - 자동 재연결
      pc.addEventListener('connectionstatechange', () => {
        console.log('[CONNECTION] 연결 상태:', pc.connectionState);

        if (
          (pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected') &&
          !manualDisconnect.current &&
          reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
        ) {
          console.log(
            `[RECONNECT] 재연결 시도 ${
              reconnectAttempts.current + 1
            }/${MAX_RECONNECT_ATTEMPTS}`
          );
          reconnectAttempts.current += 1;

          // 기존 연결 정리
          if (peerConnection.current) {
            peerConnection.current.close();
          }
          if (dataChannelRef.current) {
            dataChannelRef.current.close();
          }

          // 재연결 (3초 후)
          setTimeout(() => {
            startSession();
          }, 3000);
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[ERROR] 재연결 최대 시도 횟수 초과');
        }
      });

      // ICE 연결 상태 모니터링
      pc.addEventListener('iceconnectionstatechange', () => {
        console.log('[ICE] ICE 연결 상태:', pc.iceConnectionState);
      });

      peerConnection.current = pc;

      // 연결 성공 시 재연결 카운터 초기화
      reconnectAttempts.current = 0;
      manualDisconnect.current = false;

      return true;
    } catch (error) {
      console.error('[ERROR] 세션 시작 실패:', error);
      throw error;
    }
  }

  // 자동 세션 시작 (페이지 로드 시 한 번만 실행)
  useQuery({
    queryKey: ['session-init'],
    queryFn: startSession,
    staleTime: Infinity,
    retry: false,
  });

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    console.log('[DISCONNECT] 수동 종료 - 재연결 안함');
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

    setIsSessionActive(false);
    setIsAISpeaking(false);
    setDataChannel(null);
    dataChannelRef.current = null;
    peerConnection.current = null;
    reconnectAttempts.current = 0;
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      // send event before setting timestamp since the backend peer doesn't expect this field
      dataChannel.send(JSON.stringify(message));

      // if guard just in case the timestamp exists by miracle
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        'Failed to send message - no data channel available',
        message
      );
    }
  }

  // Send a text message to the model
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

  // 영업시간 체크 (08:00 ~ 18:00)
  const isBusinessHours = () => {
    const now = new Date();
    const hour = now.getHours();
    return hour >= 8 && hour < 18;
  };

  // 연결 상태 변화 감지
  useEffect(() => {
    console.log(
      '[SESSION_STATE] 연결 상태 변화:',
      isSessionActive ? '연결됨' : '연결 끊김'
    );
  }, [isSessionActive]);

  // 자동 접속/종료 스케줄링
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // 08:00 자동 접속 (영업시간 시작)
      if (hour === 9 && minute === 50 && !isSessionActive) {
        console.log('[SCHEDULE] 08:00 자동 접속 시작');
        startSession();
      }

      // 18:00 자동 종료 (영업시간 종료)
      if (hour === 18 && minute === 1 && isSessionActive) {
        console.log('[SCHEDULE] 18:00 자동 종료');
        stopSession();
      }
    };

    // 1분마다 체크
    const scheduleInterval = setInterval(checkSchedule, 60000);

    return () => clearInterval(scheduleInterval);
  }, [isSessionActive]);

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // DataChannel close 감지
      dataChannel.addEventListener('close', () => {
        console.log('[DATACHANNEL] DataChannel closed');
        setIsSessionActive(false);
      });

      // DataChannel error 감지
      dataChannel.addEventListener('error', (error) => {
        console.error('[ERROR] DataChannel error:', error);
      });

      // Append new server events to the list
      dataChannel.addEventListener('message', (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        // AI 음성 시작 감지
        if (event.type === 'output_audio_buffer.started') {
          console.log('[AI_START] AI 말하기 시작 - 마이크 차단');
          setIsAISpeaking(true);
          // 마이크 입력 차단
          if (peerConnection.current) {
            peerConnection.current.getSenders().forEach((sender) => {
              if (sender.track && sender.track.kind === 'audio') {
                sender.track.enabled = false;
              }
            });
          }
        }

        // AI 음성 종료 감지
        if (event.type === 'output_audio_buffer.stopped') {
          console.log('[AI_STOP] AI 말하기 종료 - 마이크 활성화');
          setIsAISpeaking(false);
          // 마이크 입력 재활성화
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

      // Set session active when the data channel is opened
      dataChannel.addEventListener('open', () => {
        setIsSessionActive(true);
        setEvents([]);
      });
    }
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
