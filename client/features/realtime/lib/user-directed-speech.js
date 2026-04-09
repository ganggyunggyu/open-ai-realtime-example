const RECENT_ASSISTANT_CONTEXT_WINDOW_MS = 45_000;

const STRONG_DEVICE_REQUEST_PATTERNS = [
  /(알려줘|말해줘|답해줘|요약해줘|정리해줘|설명해줘|추천해줘|확인해줘|기록해줘|메모해줘|번역해줘|반응해줘|예약해줘|읽어줘|보여줘|찾아줘|검색해줘)/i,
  /\b(tell me|show me|answer|summarize|explain|translate|search|look up)\b/i,
];

const GENERIC_DEVICE_REQUEST_PATTERNS = [
  /(진행해줘|계속해줘|해줘|해주세요|해 줄래|해줄래|도와줘|도와줄래|틀어줘|켜줘|꺼줘|바꿔줘|변경해줘|시작해줘|멈춰줘)/i,
  /\b(can you|could you|would you|please|start|stop|turn on|turn off|set|play)\b/i,
];

const DEVICE_TASK_PATTERNS = [
  /(몇\s*시|time\b)/i,
  /(일정|스케줄|캘린더|할 일|todo|미팅|회의|약속)/i,
  /(요약|정리|설명|추천|답변|답해|번역|메모|기록|반응|검색|찾아)/i,
  /(한국어|영어|한\s*줄|차근차근|세\s*가지만|이전\s*방식|그\s*방향)/i,
  /(tv|티비|볼륨|소리|음악|노래|타이머|알람|리마인더|날씨)/i,
  /((\d+|[가-힣]+)\s*분|오전|오후).*(다시|확인|알려)/i,
];

const DIRECT_DEVICE_QUERY_PATTERNS = [
  /(지금\s*몇\s*시(?:야|예요)?\??)/i,
  /(what time is it|what's the time)/i,
  /((오늘|내일).*(일정|스케줄).*(뭐야|뭔데|있(?:어|어요|니|나요|는지|으면)|알려|확인|보여|어때))/i,
  /((날씨|기온|온도).*(어때|어떻|알려))/i,
];

const FOLLOW_UP_PATTERNS = [
  /^(응|그래|맞아|아니|아냐|아니야|음|좋아|오케이|okay|ok|right)[,\s]/i,
  /(방금|그\s*방향|이전\s*방식|말고|다시|계속|한\s*줄로)/i,
];

const EXPLICIT_DEVICE_ADDRESS_PATTERNS = [
  /^(챗\s*gpt|챗지피티|chatgpt|지피티|gpt|assistant|어시스턴트|비서|컴퓨터)(야|아|님)?([,\s!?]|$)/i,
];

const HUMAN_ADDRESS_PATTERNS = [
  /^(너|네가|니가|걔|얘|쟤|엄마|아빠|여보|자기|오빠|언니|형|누나|팀장님|선생님|매니저)(야|아)?([,\s!?]|$)/i,
  /^[가-힣]{2,4}(야|아)([,\s!?]|$)/i,
];

const HUMAN_CONVERSATION_PATTERNS = [
  /(만나|갈래|갈까|먹을래|출발했|도착했|전화했|왔어|왔니|왔냐|집에|같이|누구랑)/i,
  /((몇\s*시|언제).*(만나|갈|출발|도착|끝나|와|오))/i,
  /(어디쯤|오는 중|가는 길)/i,
];

const normalizeTranscript = (transcript = '') =>
  transcript.toLowerCase().replace(/\s+/g, ' ').trim();

const matchesAnyPattern = (patterns, transcript) =>
  patterns.some((pattern) => pattern.test(transcript));

const hasRecentAssistantContext = ({
  now,
  recentAssistantActivityAtMs,
}) =>
  typeof recentAssistantActivityAtMs === 'number' &&
  now - recentAssistantActivityAtMs <= RECENT_ASSISTANT_CONTEXT_WINDOW_MS;

const createDecision = ({
  isQualified,
  reason,
  signals,
  utteranceDecision,
}) => ({
  ...utteranceDecision,
  isQualified,
  reason,
  userDirectedSignals: signals,
});

export const qualifyUserDirectedSpeech = ({
  now = Date.now(),
  recentAssistantActivityAtMs,
  utteranceDecision,
}) => {
  if (!utteranceDecision?.isQualified) {
    return utteranceDecision;
  }

  const normalizedTranscript = normalizeTranscript(
    utteranceDecision.transcript || ''
  );
  const hasDeviceTaskCue = matchesAnyPattern(
    DEVICE_TASK_PATTERNS,
    normalizedTranscript
  );
  const hasStrongDeviceRequest = matchesAnyPattern(
    STRONG_DEVICE_REQUEST_PATTERNS,
    normalizedTranscript
  );
  const hasGenericDeviceRequest = matchesAnyPattern(
    GENERIC_DEVICE_REQUEST_PATTERNS,
    normalizedTranscript
  );
  const hasDirectDeviceQuery = matchesAnyPattern(
    DIRECT_DEVICE_QUERY_PATTERNS,
    normalizedTranscript
  );
  const hasExplicitDeviceAddress = matchesAnyPattern(
    EXPLICIT_DEVICE_ADDRESS_PATTERNS,
    normalizedTranscript
  );
  const hasContextualFollowUp = matchesAnyPattern(
    FOLLOW_UP_PATTERNS,
    normalizedTranscript
  );
  const hasHumanAddressCue =
    !hasExplicitDeviceAddress &&
    matchesAnyPattern(HUMAN_ADDRESS_PATTERNS, normalizedTranscript);
  const hasHumanCoordinationCue = matchesAnyPattern(
    HUMAN_CONVERSATION_PATTERNS,
    normalizedTranscript
  );
  const isLikelyNearbyConversation =
    hasHumanAddressCue || hasHumanCoordinationCue;
  const hasRecentAssistantContextSignal = hasRecentAssistantContext({
    now,
    recentAssistantActivityAtMs,
  });
  const isSupportedFollowUp =
    hasContextualFollowUp && hasRecentAssistantContextSignal;
  const hasStrongDeviceCue =
    hasDirectDeviceQuery ||
    hasDeviceTaskCue ||
    hasStrongDeviceRequest ||
    isSupportedFollowUp;
  const signals = {
    hasContextualFollowUp,
    hasDeviceTaskCue,
    hasDirectDeviceQuery,
    hasExplicitDeviceAddress,
    hasGenericDeviceRequest,
    hasHumanAddressCue,
    hasHumanCoordinationCue,
    hasRecentAssistantContext: hasRecentAssistantContextSignal,
    hasStrongDeviceRequest,
    isLikelyContinuousPlayback:
      utteranceDecision.audioSignals?.isLikelyContinuousPlayback === true,
    isLikelyNearbyConversation,
    normalizedTranscript,
  };

  if (isSupportedFollowUp) {
    return createDecision({
      isQualified: true,
      reason: 'assistant_contextual_follow_up',
      signals,
      utteranceDecision,
    });
  }

  if (
    utteranceDecision.transcriptSignals?.isContinuationResponse &&
    !signals.hasRecentAssistantContext
  ) {
    return createDecision({
      isQualified: false,
      reason: 'ambiguous_follow_up_without_device_context',
      signals,
      utteranceDecision,
    });
  }

  if (signals.isLikelyContinuousPlayback) {
    return createDecision({
      isQualified: false,
      reason: 'background_media_playback',
      signals,
      utteranceDecision,
    });
  }

  if (
    isLikelyNearbyConversation &&
    !hasExplicitDeviceAddress &&
    !isSupportedFollowUp
  ) {
    return createDecision({
      isQualified: false,
      reason: 'nearby_conversation_not_device_directed',
      signals,
      utteranceDecision,
    });
  }

  if (
    hasDirectDeviceQuery ||
    hasStrongDeviceRequest ||
    (hasGenericDeviceRequest && hasDeviceTaskCue)
  ) {
    return createDecision({
      isQualified: true,
      reason: 'device_directed_request',
      signals,
      utteranceDecision,
    });
  }

  return createDecision({
    isQualified: false,
    reason: 'ambiguous_not_device_directed',
    signals,
    utteranceDecision,
  });
};
