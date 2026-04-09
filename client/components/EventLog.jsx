import { User, Cpu, ChevronUp, Mic, Code, Info, Clock } from 'react-feather';
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  extractTextContent,
  formatEventSummary,
  getEventRole,
  getRenderableMessageKey,
  isVoiceInputEvent,
} from '@/features/realtime/lib/event-log';
import { cn } from '@/shared/lib/cn';
import {
  formatTurnLatency,
  isTurnLatencyMeasurementComplete,
} from '@/shared/lib/response-latency';

const EventDetails = ({ event, viewMode }) => {
  const summary = formatEventSummary(event);

  if (viewMode === 'summary') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-[var(--color-gray-50)] dark:bg-[var(--color-gray-800)] space-y-2">
        {summary.map(({ label, value }, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <span className="text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)] min-w-[80px] flex-shrink-0">
              {label}
            </span>
            <span className="text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)] break-all">
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'raw') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] overflow-x-auto">
        <pre className="text-xs text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)] whitespace-pre-wrap font-mono">
          {JSON.stringify(event, null, 2)}
        </pre>
      </div>
    );
  }

  return null;
};

const ChatBubble = ({ event, timestamp }) => {
  const [viewMode, setViewMode] = useState('closed');
  const textContent = extractTextContent(event);
  const isVoice = isVoiceInputEvent(event);
  const role = getEventRole(event);
  const hasCompletedLatencyMeasurement = isTurnLatencyMeasurementComplete(
    event.latencyMeasurement
  );
  const latencyText = formatTurnLatency(event.latencyMeasurement);
  const isClient =
    role === 'user' ||
    (!role && event.event_id && !event.event_id.startsWith('event_'));

  if (!textContent) return null;

  const cycleViewMode = () => {
    if (viewMode === 'closed') setViewMode('summary');
    else if (viewMode === 'summary') setViewMode('raw');
    else setViewMode('closed');
  };

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isClient ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div
        className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl', 
          isClient
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]'
        )}
      >
        {isClient ? <User size={16} /> : <Cpu size={16} />}
      </div>

      <div className={`max-w-[75%] ${isClient ? 'items-end' : 'items-start'}`}>
        <div
          className={cn('rounded-2xl px-4 py-3 shadow-sm',
            isClient
              ? 'bg-[var(--color-primary)] text-white rounded-tr-md'
              : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] text-[var(--color-gray-900)] dark:text-[var(--color-gray-100)] rounded-tl-md'
          )}
        >
          {isVoice && (
            <div
              className={cn('mb-1.5 flex items-center gap-1.5 text-xs',
                isClient
                  ? 'text-white/70'
                  : 'text-[var(--color-gray-500)]'
              )}
            >
              <Mic size={12} />
              <span>음성 메시지</span>
            </div>
          )}
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {textContent}
          </p>
        </div>

        <div
          className={`flex items-center gap-2 mt-1.5 text-xs text-[var(--color-gray-400)] ${
            isClient ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{timestamp}</span>
          {hasCompletedLatencyMeasurement ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                isClient
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:bg-[var(--color-gray-800)] dark:text-[var(--color-gray-300)]'
              )}
            >
              <Clock size={11} />
              <span>응답 시작 {latencyText}</span>
            </span>
          ) : null}
          <button
            onClick={cycleViewMode}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all duration-200 ${
              viewMode !== 'closed'
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'hover:bg-[var(--color-gray-100)] dark:hover:bg-[var(--color-gray-700)] hover:text-[var(--color-gray-600)] dark:hover:text-[var(--color-gray-300)]'
            }`}
          >
            {viewMode === 'closed' && (
              <div className="flex items-center gap-1">
                <Info size={12} />
                <span>상세</span>
              </div>
            )}
            {viewMode === 'summary' && (
              <div className="flex items-center gap-1">
                <Code size={12} />
                <span>코드</span>
              </div>
            )}
            {viewMode === 'raw' && (
              <div className="flex items-center gap-1">
                <ChevronUp size={12} />
                <span>닫기</span>
              </div>
            )}
          </button>
        </div>

        <EventDetails event={event} viewMode={viewMode} />
      </div>
    </div>
  );
};

const SystemEvent = ({ event, timestamp }) => {
  const [viewMode, setViewMode] = useState('closed');

  const cycleViewMode = () => {
    if (viewMode === 'closed') setViewMode('summary');
    else if (viewMode === 'summary') setViewMode('raw');
    else setViewMode('closed');
  };

  return (
    <div className="flex justify-center animate-fade-in">
      <div className="max-w-[90%]">
        <button
          onClick={cycleViewMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-colors ${
            viewMode !== 'closed'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] text-[var(--color-gray-500)] hover:bg-[var(--color-gray-200)] dark:hover:bg-[var(--color-gray-700)]'
          }`}
        >
          <span className="truncate max-w-[200px]">{event.type}</span>
          <span className="text-[var(--color-gray-400)]">{timestamp}</span>
          {viewMode === 'closed' && <Info size={12} />}
          {viewMode === 'summary' && <Code size={12} />}
          {viewMode === 'raw' && <ChevronUp size={12} />}
        </button>

        <EventDetails event={event} viewMode={viewMode} />
      </div>
    </div>
  );
};

const EventLog = ({ events }) => {
  const [messagesOnly, setMessagesOnly] = useState(true);
  const containerRef = useRef(null);
  const handleShowMessagesOnly = () => setMessagesOnly(true);
  const handleShowAllEvents = () => setMessagesOnly(false);

  const filtered = useMemo(() => {
    if (!events || events.length === 0) return [];
    if (!messagesOnly) return events;

    const list = [];
    const seenMessageKeys = new Set();

    for (const ev of events) {
      const textContent = extractTextContent(ev);
      const role = getEventRole(ev);

      if (!textContent) {
        continue;
      }

      if (role === 'user' && ev.type !== 'conversation.item.create') {
        continue;
      }

      const messageKey = getRenderableMessageKey(ev);
      if (messageKey && seenMessageKeys.has(messageKey)) {
        continue;
      }

      if (messageKey) {
        seenMessageKeys.add(messageKey);
      }

      list.push(ev);
    }

    return list;
  }, [events, messagesOnly]);

  const eventsToDisplay = useMemo(() => {
    const deltaSeen = {};
    const result = [];

    filtered.forEach((event) => {
      if (event?.type?.endsWith('delta')) {
        if (deltaSeen[event.type]) return;
        deltaSeen[event.type] = true;
      }

      const textContent = extractTextContent(event);
      if (messagesOnly && textContent) {
        result.push(
          <ChatBubble
            key={event.event_id}
            event={event}
            timestamp={event.timestamp}
          />
        );
      } else if (!messagesOnly) {
        if (textContent) {
          result.push(
            <ChatBubble
              key={event.event_id}
              event={event}
              timestamp={event.timestamp}
            />
          );
        } else {
          result.push(
            <SystemEvent
              key={event.event_id}
              event={event}
              timestamp={event.timestamp}
            />
          );
        }
      }
    });

    return result;
  }, [filtered, messagesOnly]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-gray-200)] dark:border-[var(--color-gray-700)]">
        <span className="text-sm font-medium text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)]">
          {messagesOnly ? '대화 내역' : '전체 이벤트'}
        </span>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)]">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
              messagesOnly
                ? 'bg-white dark:bg-[var(--color-gray-700)] text-[var(--color-gray-900)] dark:text-white shadow-sm'
                : 'text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] dark:hover:text-[var(--color-gray-300)]'
            }`}
            onClick={handleShowMessagesOnly}
          >
            대화
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
              !messagesOnly
                ? 'bg-white dark:bg-[var(--color-gray-700)] text-[var(--color-gray-900)] dark:text-white shadow-sm'
                : 'text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] dark:hover:text-[var(--color-gray-300)]'
            }`}
            onClick={handleShowAllEvents}
          >
            전체
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex flex-col-reverse gap-4 overflow-y-auto"
      >
        {eventsToDisplay.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] flex items-center justify-center">
              <Cpu size={28} className="text-[var(--color-gray-400)]" />
            </div>
            <p className="text-[var(--color-gray-500)] text-sm">
              대화를 시작해보세요
            </p>
            <p className="text-[var(--color-gray-400)] text-xs mt-1">
              음성이나 텍스트로 메시지를 보낼 수 있어요
            </p>
          </div>
        ) : (
          eventsToDisplay
        )}
      </div>
    </div>
  );
};

export default EventLog;
