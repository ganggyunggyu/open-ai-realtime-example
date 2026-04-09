import { useEffect, useState } from 'react';
import AppHeader from '@/components/AppHeader';
import EventLog from '@/components/EventLog';
import SessionControls from '@/components/SessionControls';
import ValidSpeechEvaluationPanel from '@/components/ValidSpeechEvaluationPanel';
import { useRealtimeSession } from '@/features/realtime/hooks/useRealtimeSession';
import { cn } from '@/shared/lib/cn';

const DARK_MODE_STORAGE_KEY = 'darkMode';
const EVALUATION_PANEL_STORAGE_KEY = 'validSpeechEvaluationVisible';

const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isEvaluationVisible, setIsEvaluationVisible] = useState(false);
  const {
    events,
    isAISpeaking,
    isSessionActive,
    isSoftSleeping,
    isVoiceAutoReplyEnabled,
    latestAcceptedTranscript,
    latestResponseStartedEvent,
    micLevel,
    micSensitivity,
    sendTextMessage,
    setMicSensitivity,
    setVolume,
    startSession,
    stopSession,
    toggleVoiceAutoReply,
    updateVoiceAutoReplyEnabled,
    volume,
  } = useRealtimeSession();

  useEffect(() => {
    const savedDarkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
    const savedEvaluationVisible =
      localStorage.getItem(EVALUATION_PANEL_STORAGE_KEY) === 'true';
    setIsDarkMode(savedDarkMode);
    setIsEvaluationVisible(savedEvaluationVisible);

    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    const autoStartTimer = window.setTimeout(() => {
      startSession().catch((error) => {
        console.error(error);
      });
    }, 0);

    return () => {
      window.clearTimeout(autoStartTimer);
    };
  }, []);

  const handleToggleDarkMode = () => {
    const nextDarkMode = !isDarkMode;
    setIsDarkMode(nextDarkMode);
    localStorage.setItem(DARK_MODE_STORAGE_KEY, nextDarkMode.toString());

    if (nextDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleToggleEvaluationVisibility = () => {
    const nextValue = !isEvaluationVisible;
    setIsEvaluationVisible(nextValue);
    localStorage.setItem(EVALUATION_PANEL_STORAGE_KEY, nextValue.toString());
  };

  return (
    <div
      className={cn(
        'flex h-screen flex-col bg-[var(--color-bg)] dark:bg-[var(--color-bg)]'
      )}
    >
      <AppHeader
        isEvaluationVisible={isEvaluationVisible}
        isAISpeaking={isAISpeaking}
        isDarkMode={isDarkMode}
        isSessionActive={isSessionActive}
        isSoftSleeping={isSoftSleeping}
        isVoiceAutoReplyEnabled={isVoiceAutoReplyEnabled}
        micLevel={micLevel}
        micSensitivity={micSensitivity}
        onMicSensitivityChange={setMicSensitivity}
        onToggleEvaluationVisibility={handleToggleEvaluationVisibility}
        onToggleDarkMode={handleToggleDarkMode}
        onToggleVoiceAutoReply={toggleVoiceAutoReply}
        onVolumeChange={setVolume}
        volume={volume}
      />

      <main className="flex-1 overflow-hidden">
        <div className="mx-auto flex h-full max-w-5xl flex-col">
          {isEvaluationVisible ? (
            <section className="border-b border-[var(--color-gray-200)] px-4 py-4 dark:border-[var(--color-gray-700)] sm:px-6">
              <div className="max-h-[48vh] overflow-y-auto">
                <ValidSpeechEvaluationPanel
                  isSessionActive={isSessionActive}
                  isVoiceAutoReplyEnabled={isVoiceAutoReplyEnabled}
                  latestAcceptedTranscript={latestAcceptedTranscript}
                  latestResponseStartedEvent={latestResponseStartedEvent}
                  startSession={startSession}
                  updateVoiceAutoReplyEnabled={updateVoiceAutoReplyEnabled}
                />
              </div>
            </section>
          ) : null}

          {isSessionActive ? (
            <div className="flex h-full flex-col">
              <section className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <EventLog events={events} />
              </section>

              <section className="border-t border-[var(--color-gray-200)] bg-[var(--color-bg)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-bg)]">
                <div className="px-4 py-4 sm:px-6">
                  <SessionControls
                    isAISpeaking={isAISpeaking}
                    isSessionActive={isSessionActive}
                    sendTextMessage={sendTextMessage}
                    startSession={startSession}
                    stopSession={stopSession}
                  />
                </div>
              </section>
            </div>
          ) : (
            <section className="flex flex-1 items-center justify-center px-4 sm:px-6">
              <div className="animate-fade-in text-center">
                <div className="gradient-primary mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg">
                  <span className="text-3xl font-semibold text-white">S</span>
                </div>
                <h2 className="mb-2 text-2xl font-semibold text-[var(--color-gray-900)] dark:text-white">
                  {isSoftSleeping ? '절전 상태예요' : '자동으로 연결 중이에요'}
                </h2>
                <p className="mx-auto mb-4 max-w-sm text-[var(--color-gray-500)]">
                  {isSoftSleeping
                    ? '10분 동안 음성 입력이 없어서 세션을 절전으로 전환했습니다. 음성이 확실히 감지되면 자동으로 다시 연결됩니다.'
                    : '링크를 열면 바로 세션이 시작됩니다. 연결이 늦으면 아래 버튼으로 다시 시도해 주세요.'}
                </p>
                <p className="mx-auto mb-8 max-w-sm text-sm text-[var(--color-gray-400)]">
                  자격을 통과한 음성만 자동으로 응답합니다.
                  상단 자동응답 버튼은 평가 중 강제 자동응답 유지용입니다.
                </p>
                <SessionControls
                  isAISpeaking={isAISpeaking}
                  isSessionActive={isSessionActive}
                  sendTextMessage={sendTextMessage}
                  startSession={startSession}
                  stopSession={stopSession}
                />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
