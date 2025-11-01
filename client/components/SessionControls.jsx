import { useState } from "react";
import { CloudLightning, CloudOff, MessageSquare } from "react-feather";
import Button from "./Button";

function SessionStopped({ startSession }) {
  const [isActivating, setIsActivating] = useState(false);

  function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    startSession();
  }

  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <Button
        onClick={handleStartSession}
        className={`${isActivating ? "bg-gray-600" : "bg-red-600"} w-full md:w-auto`}
        icon={<CloudLightning height={16} />}
      >
        {isActivating ? (
          <span>연결 중...</span>
        ) : (
          <>
            <span className="hidden md:inline">start session</span>
            <span className="md:hidden">시작하기</span>
          </>
        )}
      </Button>
    </div>
  );
}

function SessionActive({ stopSession, sendTextMessage, isAISpeaking }) {
  const [message, setMessage] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  function handleSendClientEvent() {
    if (isAISpeaking) return;
    sendTextMessage(message);
    setMessage("");
  }

  return (
    <div className="flex flex-col md:flex-row items-center justify-center w-full h-full gap-2 md:gap-4">
      <input
        onKeyDown={(e) => {
          const composing = e.isComposing || (e.nativeEvent && e.nativeEvent.isComposing) || isComposing;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!composing && message.trim() && !isAISpeaking) {
              handleSendClientEvent();
            }
          }
        }}
        type="text"
        placeholder={isAISpeaking ? "AI가 말하는 중..." : "메시지 입력..."}
        className="border border-gray-200 dark:border-gray-600 rounded-full px-4 py-2 md:py-3 flex-1 w-full text-sm md:text-base bg-white dark:bg-gray-800 dark:text-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:dark:bg-gray-700"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        disabled={isAISpeaking}
      />
      <div className="flex gap-2 w-full md:w-auto">
        <Button
          onClick={() => {
            if (message.trim() && !isAISpeaking) {
              handleSendClientEvent();
            }
          }}
          icon={<MessageSquare height={16} />}
          className="bg-blue-400 flex-1 md:flex-initial text-xs md:text-sm"
          disabled={isAISpeaking}
        >
          <span className="hidden md:inline">send text</span>
          <span className="md:hidden">전송</span>
        </Button>
        <Button
          onClick={stopSession}
          icon={<CloudOff height={16} />}
          className="flex-1 md:flex-initial text-xs md:text-sm"
        >
          <span className="hidden md:inline">disconnect</span>
          <span className="md:hidden">종료</span>
        </Button>
      </div>
    </div>
  );
}

export default function SessionControls({
  startSession,
  stopSession,
  sendClientEvent,
  sendTextMessage,
  serverEvents,
  isSessionActive,
  isAISpeaking,
}) {
  return (
    <div className="h-full w-full">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendClientEvent={sendClientEvent}
          sendTextMessage={sendTextMessage}
          serverEvents={serverEvents}
          isAISpeaking={isAISpeaking}
        />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
}
