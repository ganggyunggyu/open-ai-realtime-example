import { useState } from 'react';
import { Zap, Send, Power, Loader } from 'react-feather';

function SessionStopped({ startSession }) {
  const [isActivating, setIsActivating] = useState(false);

  function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    startSession();
  }

  return (
    <button
      onClick={handleStartSession}
      disabled={isActivating}
      className={`
        flex items-center justify-center gap-3
        w-full sm:w-auto px-8 py-4
        rounded-2xl font-medium text-base
        transition-all duration-300 transform
        ${
          isActivating
            ? 'bg-[var(--color-gray-200)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-500)] cursor-not-allowed'
            : 'gradient-primary text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
        }
      `}
    >
      {isActivating ? (
        <>
          <Loader size={20} className="animate-spin" />
          <span>연결 중...</span>
        </>
      ) : (
        <>
          <Zap size={20} />
          <span>대화 시작하기</span>
        </>
      )}
    </button>
  );
}

function SessionActive({ stopSession, sendTextMessage, isAISpeaking }) {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  function handleSendClientEvent() {
    if (isAISpeaking || !message.trim()) return;
    sendTextMessage(message);
    setMessage('');
  }

  return (
    <div className="flex items-center gap-3">
      {/* Input Field */}
      <div className="flex-1 relative">
        <input
          onKeyDown={(e) => {
            const composing =
              e.isComposing ||
              (e.nativeEvent && e.nativeEvent.isComposing) ||
              isComposing;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!composing && message.trim() && !isAISpeaking) {
                handleSendClientEvent();
              }
            }
          }}
          type="text"
          placeholder={isAISpeaking ? 'AI가 응답 중이에요...' : '메시지를 입력하세요'}
          className={`
            w-full px-5 py-3.5
            rounded-2xl text-[15px]
            bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)]
            text-[var(--color-gray-900)] dark:text-white
            placeholder:text-[var(--color-gray-400)]
            border-2 border-transparent
            focus:border-[var(--color-primary)] focus:bg-white dark:focus:bg-[var(--color-gray-700)]
            focus:outline-none
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          disabled={isAISpeaking}
        />
      </div>

      {/* Send Button */}
      <button
        onClick={() => {
          if (message.trim() && !isAISpeaking) {
            handleSendClientEvent();
          }
        }}
        disabled={isAISpeaking || !message.trim()}
        className={`
          flex-shrink-0 p-3.5 rounded-2xl
          transition-all duration-200 transform
          ${
            message.trim() && !isAISpeaking
              ? 'gradient-primary text-white shadow-md hover:shadow-lg hover:scale-[1.05] active:scale-[0.95]'
              : 'bg-[var(--color-gray-200)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-400)] cursor-not-allowed'
          }
        `}
      >
        <Send size={20} />
      </button>

      {/* Disconnect Button */}
      <button
        onClick={stopSession}
        className="
          flex-shrink-0 p-3.5 rounded-2xl
          bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)]
          text-[var(--color-gray-500)]
          hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]
          transition-all duration-200 transform
          hover:scale-[1.05] active:scale-[0.95]
        "
        title="연결 종료"
      >
        <Power size={20} />
      </button>
    </div>
  );
}

export default function SessionControls({
  startSession,
  stopSession,
  sendTextMessage,
  isSessionActive,
  isAISpeaking,
}) {
  return (
    <div className="w-full">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendTextMessage={sendTextMessage}
          isAISpeaking={isAISpeaking}
        />
      ) : (
        <div className="flex justify-center">
          <SessionStopped startSession={startSession} />
        </div>
      )}
    </div>
  );
}
