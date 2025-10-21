import { ArrowUp, ArrowDown } from "react-feather";
import { useState } from "react";

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
        <div className="text-sm px-2 py-1 bg-white rounded border-l-2 border-gray-400">
          {isClient ? "📝" : "💬"} {textContent}
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
  const eventsToDisplay = [];
  let deltaEvents = {};

  events.forEach((event) => {
    if (event.type.endsWith("delta")) {
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(
      <Event key={event.event_id} event={event} timestamp={event.timestamp} />,
    );
  });

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      {events.length === 0 ? (
        <div className="text-gray-500">Awaiting events...</div>
      ) : (
        eventsToDisplay
      )}
    </div>
  );
}
