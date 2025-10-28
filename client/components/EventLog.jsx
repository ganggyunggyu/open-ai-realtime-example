import { ArrowUp, ArrowDown, MessageSquare, Volume2, Activity } from "react-feather";
import { useMemo, useState } from "react";

function extractTextContent(event) {
  // response.done에서 transcript 추출
  if (event.type === "response.done" && event.response?.output) {
    const transcripts = event.response.output
      .flatMap(item => item.content || [])
      .filter(content => content.transcript)
      .map(content => content.transcript);
    return transcripts.length > 0 ? transcripts.join(" ") : null;
  }

  // conversation.item.create에서 사용자 입력 추출
  if (event.type === "conversation.item.create" && event.item?.content) {
    const texts = event.item.content
      .filter(content => content.type === "input_text")
      .map(content => content.text);
    return texts.length > 0 ? texts.join(" ") : null;
  }

  // response.output_audio_transcript.done
  if (event.type === "response.output_audio_transcript.done" && event.transcript) {
    return event.transcript;
  }

  return null;
}

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isClient = event.event_id && !event.event_id.startsWith("event_");
  const textContent = extractTextContent(event);

  return (
    <div className="flex flex-col gap-2 p-2 rounded-md bg-gray-50">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isClient ? (
          <ArrowDown className="text-blue-400" />
        ) : (
          <ArrowUp className="text-green-400" />
        )}
        <div className="text-sm text-gray-500">
          {isClient ? "client:" : "server:"}
          &nbsp;{event.type} | {timestamp}
        </div>
      </div>
      {textContent && (
        <div className="text-sm px-2 py-1 bg-white rounded border-l-2 border-gray-400 flex items-center gap-2">
          {isClient ? (
            <MessageSquare size={14} className="text-blue-500" />
          ) : (
            <Volume2 size={14} className="text-green-500" />
          )}
          <span>{textContent}</span>
        </div>
      )}
      <div
        className={`text-gray-500 bg-gray-200 p-2 rounded-md overflow-x-auto ${
          isExpanded ? "block" : "hidden"
        }`}
      >
        <pre className="text-xs">{JSON.stringify(event, null, 2)}</pre>
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  const [messagesOnly, setMessagesOnly] = useState(true);

  const filtered = useMemo(() => {
    if (!events || events.length === 0) return [];
    if (!messagesOnly) return events;

    const list = [];
    for (const ev of events) {
      if (ev.type === "conversation.item.create") {
        list.push(ev);
        continue;
      }
      if (ev.type === "response.done") {
        // 우선순위: response.done 한 건만 채택
        list.push(ev);
        continue;
      }
      // 그 외 서버 이벤트는 messagesOnly일 땐 숨김
    }
    return list;
  }, [events, messagesOnly]);

  const eventsToDisplay = [];
  const deltaSeen = {};

  filtered.forEach((event) => {
    if (event?.type?.endsWith("delta")) {
      if (deltaSeen[event.type]) return;
      deltaSeen[event.type] = true;
    }
    eventsToDisplay.push(
      <Event key={event.event_id} event={event} timestamp={event.timestamp} />,
    );
  });

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Activity size={14} />
          <span>{messagesOnly ? "Messages view" : "All events"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded border ${
              messagesOnly ? "bg-gray-800 text-white" : "bg-white"
            }`}
            onClick={() => setMessagesOnly(true)}
          >
            Messages
          </button>
          <button
            type="button"
            className={`text-xs px-2 py-1 rounded border ${
              !messagesOnly ? "bg-gray-800 text-white" : "bg-white"
            }`}
            onClick={() => setMessagesOnly(false)}
          >
            All
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-gray-500">Awaiting events...</div>
      ) : (
        eventsToDisplay
      )}
    </div>
  );
}
