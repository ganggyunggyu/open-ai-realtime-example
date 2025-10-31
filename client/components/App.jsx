import { useEffect, useRef, useState } from 'react';
import logo from '/assets/openai-logomark.svg';
import EventLog from './EventLog';
import SessionControls from './SessionControls';
import ToolPanel from './ToolPanel';

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  async function startSession() {
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

    peerConnection.current = pc;
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setIsAISpeaking(false);
    setDataChannel(null);
    peerConnection.current = null;
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

  // 자동 접속/종료 스케줄링
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // 08:00 자동 접속
      if (hour === 7 && minute === 59 && !isSessionActive) {
        console.log('⏰ 08:00 자동 접속 시작');
        startSession();
      }

      // 18:00 자동 종료
      if (hour === 18 && minute === 1 && isSessionActive) {
        console.log('⏰ 18:00 자동 종료');
        stopSession();
      }
    };

    // 1분마다 체크
    const scheduleInterval = setInterval(checkSchedule, 60000);

    // 컴포넌트 마운트 시 즉시 체크
    checkSchedule();

    return () => clearInterval(scheduleInterval);
  }, [isSessionActive]);

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener('message', (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        // AI 음성 시작 감지
        if (event.type === 'output_audio_buffer.started') {
          console.log('🟢 AI 말하기 시작 - 마이크 차단');
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
          console.log('🔴 AI 말하기 종료 - 마이크 활성화');
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
      <nav className="h-16 flex items-center px-4 border-b border-gray-200">
        <div className="flex items-center gap-2 md:gap-4 w-full">
          <img className="w-6 h-6" src={logo} alt="logo" />
          <h1 className="text-lg md:text-xl font-semibold">사라도령</h1>
          {isSessionActive && (
            <div className="flex items-center gap-2 ml-auto">
              <div
                className={`w-2 h-2 rounded-full ${
                  isAISpeaking ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}
              />
              <span className="text-xs md:text-sm text-gray-600">
                {isAISpeaking ? 'AI 말하는 중...' : '대기 중'}
              </span>
            </div>
          )}
        </div>
      </nav>
      <main className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
        {/* 왼쪽: EventLog + Controls */}
        <section className="flex-1 flex flex-col h-full">
          {isSessionActive ? (
            <>
              <section className="flex-1 px-2 md:px-4 py-2 overflow-y-auto">
                <EventLog events={events} />
              </section>
              <section className="h-28 md:h-32 p-2 md:p-4 border-t border-gray-200">
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
