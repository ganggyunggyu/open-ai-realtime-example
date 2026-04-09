import { useEffect, useState } from 'react';
import { Zap, Send, Power, Loader } from 'react-feather';
import { cn } from '@/shared/lib/cn';

const SessionStopped = ({ isSessionActive, startSession }) => {
  const [isActivating, setIsActivating] = useState(false);

  const handleStartSession = async () => {
    if (isActivating) return;

    setIsActivating(true);
    try {
      await startSession();
    } catch (error) {
      console.error(error);
      setIsActivating(false);
    }
  };

  useEffect(() => {
    if (!isSessionActive) {
      setIsActivating(false);
    }
  }, [isSessionActive]);

  return (
    <button
      type="button"
      onClick={handleStartSession}
      disabled={isActivating}
      className={cn(
        'flex w-full items-center justify-center gap-3 rounded-2xl px-8 py-4 text-base font-medium transition-all duration-300 transform sm:w-auto',
        isActivating
          ? 'cursor-not-allowed bg-[var(--color-gray-200)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-700)]'
          : 'gradient-primary text-white shadow-lg hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]'
      )}
    >
      {isActivating ? (
        <div className="flex items-center gap-3">
          <Loader size={20} className="animate-spin" />
          <span>연결 중...</span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Zap size={20} />
          <span>대화 시작하기</span>
        </div>
      )}
    </button>
  );
};

const SessionActive = ({ stopSession, sendTextMessage, isAISpeaking }) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const handleSendClientEvent = () => {
    if (isAISpeaking || !message.trim()) return;
    sendTextMessage(message);
    setMessage('');
  };

  const handleInputChange = (event) => {
    setMessage(event.target.value);
  };

  const handleInputKeyDown = (event) => {
    const composing =
      event.isComposing ||
      (event.nativeEvent && event.nativeEvent.isComposing) ||
      isComposing;

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      if (!composing && message.trim() && !isAISpeaking) {
        handleSendClientEvent();
      }
    }
  };

  const handleSendButtonClick = () => {
    if (message.trim() && !isAISpeaking) {
      handleSendClientEvent();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 relative">
        <input
          onKeyDown={handleInputKeyDown}
          type="text"
          placeholder={isAISpeaking ? 'AI가 응답 중이에요...' : '메시지를 입력하세요'}
          className={cn(
            'w-full rounded-2xl border-2 border-transparent bg-[var(--color-gray-100)] px-5 py-3.5 text-[15px] text-[var(--color-gray-900)] transition-all duration-200 placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[var(--color-gray-800)] dark:text-white dark:focus:bg-[var(--color-gray-700)]'
          )}
          value={message}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          disabled={isAISpeaking}
        />
      </div>

      <button
        type="button"
        onClick={handleSendButtonClick}
        disabled={isAISpeaking || !message.trim()}
        className={cn(
          'flex-shrink-0 rounded-2xl p-3.5 transition-all duration-200 transform',
          message.trim() && !isAISpeaking
            ? 'gradient-primary text-white shadow-md hover:scale-[1.05] hover:shadow-lg active:scale-[0.95]'
            : 'cursor-not-allowed bg-[var(--color-gray-200)] text-[var(--color-gray-400)] dark:bg-[var(--color-gray-700)]'
        )}
      >
        <Send size={20} />
      </button>

      <button
        type="button"
        onClick={stopSession}
        className={cn(
          'flex-shrink-0 rounded-2xl bg-[var(--color-gray-100)] p-3.5 text-[var(--color-gray-500)] transition-all duration-200 transform hover:scale-[1.05] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] active:scale-[0.95] dark:bg-[var(--color-gray-800)]'
        )}
        title="연결 종료"
      >
        <Power size={20} />
      </button>
    </div>
  );
};

const SessionControls = ({
  startSession,
  stopSession,
  sendTextMessage,
  isSessionActive,
  isAISpeaking,
}) => {
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
          <SessionStopped
            isSessionActive={isSessionActive}
            startSession={startSession}
          />
        </div>
      )}
    </div>
  );
};

export default SessionControls;
