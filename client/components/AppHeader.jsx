import {
  BarChart2,
  Mic,
  MicOff,
  Moon,
  Radio,
  Sun,
  Volume2,
  Wifi,
  WifiOff,
} from 'react-feather';
import { cn } from '@/shared/lib/cn';

const AppHeader = ({
  isEvaluationVisible,
  isAISpeaking,
  isDarkMode,
  isSessionActive,
  isSoftSleeping,
  isVoiceAutoReplyEnabled,
  micLevel,
  micSensitivity,
  onMicSensitivityChange,
  onToggleEvaluationVisibility,
  onToggleDarkMode,
  onToggleVoiceAutoReply,
  onVolumeChange,
  volume,
}) => {
  const handleVolumeChange = (event) => {
    onVolumeChange(Number.parseFloat(event.target.value));
  };

  const handleMicSensitivityChange = (event) => {
    onMicSensitivityChange(Number.parseFloat(event.target.value));
  };

  const handleToggleEvaluationVisibility = () => {
    onToggleEvaluationVisibility();
  };

  const volumeLabel = `${Math.round(volume * 100)}%`;
  const micSensitivityLabel = `${Math.round((1 - micSensitivity) * 100)}%`;

  return (
    <header className="glass sticky top-0 z-50 border-b border-[var(--color-gray-200)] dark:border-[var(--color-gray-700)]">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-2xl shadow-md">
              <span className="text-lg font-bold text-white">S</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-gray-900)] dark:text-white">
                사라도령
              </h1>
              <p className="text-xs text-[var(--color-gray-500)]">
                AI Voice Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all duration-300',
                isSessionActive
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-700)]'
              )}
            >
              {isSessionActive ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">
                {isSessionActive
                  ? '연결됨'
                  : isSoftSleeping
                    ? '절전 중'
                    : '연결 끊김'}
              </span>
            </div>

            {isSessionActive ? (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all duration-300',
                  isAISpeaking
                    ? 'animate-pulse-soft bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-700)]'
                )}
              >
                {isAISpeaking ? (
                  <div className="flex items-center gap-2">
                    <MicOff size={14} />
                    <span className="hidden sm:inline">AI 응답 중</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[0.2, 0.4, 0.6, 0.8].map((threshold, index) => (
                        <div
                          key={index}
                          className={cn(
                            'w-1 rounded-full transition-all duration-75',
                            micLevel > threshold
                              ? 'bg-[var(--color-success)]'
                              : 'bg-[var(--color-gray-300)] dark:bg-[var(--color-gray-600)]'
                          )}
                          style={{ height: `${8 + index * 3}px` }}
                        />
                      ))}
                    </div>
                    <span className="hidden sm:inline">대기 중</span>
                  </div>
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleToggleEvaluationVisibility}
              className={cn(
                'hidden rounded-full px-3 py-1.5 text-sm transition-all duration-200 sm:flex sm:items-center sm:gap-2',
                isEvaluationVisible
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-700)]'
              )}
              title="유효 발화 평가 패널 토글"
            >
              <BarChart2 size={14} />
              <span>평가</span>
            </button>

            <button
              type="button"
              onClick={onToggleVoiceAutoReply}
              className={cn(
                'hidden rounded-full px-3 py-1.5 text-sm transition-all duration-200 sm:flex sm:items-center sm:gap-2',
                isVoiceAutoReplyEnabled
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-700)]'
              )}
              title="평가용 자동응답 토글"
            >
              <Radio size={14} />
              <span>자동응답</span>
            </button>

            <div className="hidden items-center gap-2 rounded-full bg-[var(--color-gray-100)] px-3 py-1.5 dark:bg-[var(--color-gray-700)] sm:flex">
              <Volume2 size={14} className="text-[var(--color-gray-500)]" />
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[var(--color-gray-300)] accent-[var(--color-primary)] dark:bg-[var(--color-gray-600)]"
              />
              <span className="w-8 text-right text-xs text-[var(--color-gray-500)]">
                {volumeLabel}
              </span>
            </div>

            <div className="hidden items-center gap-2 rounded-full bg-[var(--color-gray-100)] px-3 py-1.5 dark:bg-[var(--color-gray-700)] sm:flex">
              <Mic size={14} className="text-[var(--color-gray-500)]" />
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={micSensitivity}
                onChange={handleMicSensitivityChange}
                className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[var(--color-gray-300)] accent-[var(--color-primary)] dark:bg-[var(--color-gray-600)]"
              />
              <span className="w-8 text-right text-xs text-[var(--color-gray-500)]">
                {micSensitivityLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="rounded-xl bg-[var(--color-gray-100)] p-2.5 transition-all duration-200 hover:bg-[var(--color-gray-200)] dark:bg-[var(--color-gray-700)] dark:hover:bg-[var(--color-gray-600)]"
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
  );
};

export default AppHeader;
