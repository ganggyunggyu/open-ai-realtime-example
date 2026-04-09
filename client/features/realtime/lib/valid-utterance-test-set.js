export const VALID_UTTERANCE_PLATFORM_OPTIONS = [
  {
    id: 'chrome-macos',
    label: 'Chrome macOS',
    operatingSystem: 'macOS',
    browser: 'Chrome',
    notes:
      'macOS Chrome에서 실제 대기 상태와 같은 마이크 경로로 반복 측정합니다.',
  },
  {
    id: 'chrome-windows',
    label: 'Chrome Windows',
    operatingSystem: 'Windows',
    browser: 'Chrome',
    notes:
      'Windows Chrome에서 실제 대기 상태와 같은 마이크 경로로 반복 측정합니다.',
  },
];

export const VALIDATION_CASE_EXPECTATION = {
  SUPPRESS: 'suppress',
  TRIGGER: 'trigger',
};

const CHROME_VALIDATION_PLATFORM_IDS = VALID_UTTERANCE_PLATFORM_OPTIONS.map(
  ({ id }) => id
);

export const VALID_UTTERANCE_TEST_SET_VERSION = '2026-03-31-valid-speech-v1';

export const VALID_UTTERANCE_TEST_SET = [
  {
    id: 'short-time-question',
    label: 'short-question',
    prompt: '지금 몇 시야?',
    acceptedPhrases: ['지금 몇 시야', '지금 몇시야', '지금 몇 시예요'],
    expectedKeywords: ['지금', '시'],
    minimumKeywordMatches: 2,
    tags: ['short', 'question', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '짧은 직접 질문을 자연스럽게 한 번만 말합니다.',
  },
  {
    id: 'daily-summary-request',
    label: 'direct-request',
    prompt: '오늘 일정 요약해줘.',
    acceptedPhrases: ['오늘 일정 요약해줘', '오늘 일정 요약해 줘'],
    expectedKeywords: ['오늘', '일정', '요약'],
    minimumKeywordMatches: 2,
    tags: ['command', 'short', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '평소 말투로 또렷하게 말합니다.',
  },
  {
    id: 'follow-up-repeat',
    label: 'follow-up',
    prompt: '방금 답변 한 줄로 다시 말해줘.',
    acceptedPhrases: [
      '방금 답변 한 줄로 다시 말해줘',
      '방금 답변 한 줄로 다시 말해 줘',
    ],
    expectedKeywords: ['방금', '답변', '다시'],
    minimumKeywordMatches: 2,
    tags: ['follow-up', 'memory', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '이전 대화 맥락을 잇는 자연스러운 후속 발화입니다.',
  },
  {
    id: 'tomorrow-morning-check',
    label: 'multi-clause',
    prompt: '내일 오전 일정이 있으면 알려줘.',
    acceptedPhrases: [
      '내일 오전 일정이 있으면 알려줘',
      '내일 오전 일정 있으면 알려줘',
    ],
    expectedKeywords: ['내일', '오전', '일정', '알려'],
    minimumKeywordMatches: 3,
    tags: ['multi-clause', 'planning', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '짧지만 절이 두 개인 자연어 요청입니다.',
  },
  {
    id: 'pre-meeting-list',
    label: 'list-request',
    prompt: '회의 전에 확인할 일 세 가지만 말해줘.',
    acceptedPhrases: [
      '회의 전에 확인할 일 세 가지만 말해줘',
      '회의 전에 확인할 일 세 가지만 말해 줘',
    ],
    expectedKeywords: ['회의', '확인', '세', '가지'],
    minimumKeywordMatches: 3,
    tags: ['list', 'planning', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '중간 길이 발화로 응답 시작 지연도 함께 확인합니다.',
  },
  {
    id: 'confirmation-continue',
    label: 'confirmation',
    prompt: '응, 그 방향으로 진행해줘.',
    acceptedPhrases: [
      '응 그 방향으로 진행해줘',
      '응 그 방향으로 진행해 줘',
      '그 방향으로 진행해줘',
    ],
    expectedKeywords: ['방향', '진행'],
    minimumKeywordMatches: 2,
    tags: ['short', 'confirmation', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '짧은 긍정 후속 발화가 놓치지 않는지 봅니다.',
  },
  {
    id: 'correction-previous-mode',
    label: 'correction',
    prompt: '아니, 방금 거 말고 이전 방식으로 해줘.',
    acceptedPhrases: [
      '아니 방금 거 말고 이전 방식으로 해줘',
      '방금 거 말고 이전 방식으로 해줘',
    ],
    expectedKeywords: ['방금', '이전', '방식'],
    minimumKeywordMatches: 2,
    tags: ['correction', 'follow-up', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '부정형 시작 문장에서도 정상 반응하는지 확인합니다.',
  },
  {
    id: 'short-language-control',
    label: 'style-control',
    prompt: '한국어로 짧게 답해줘.',
    acceptedPhrases: ['한국어로 짧게 답해줘', '한국어로 짧게 답해 줘'],
    expectedKeywords: ['한국어', '짧게', '답'],
    minimumKeywordMatches: 2,
    tags: ['style', 'short', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '짧은 제어형 발화의 미검출을 확인합니다.',
  },
  {
    id: 'time-reminder-long',
    label: 'numeric',
    prompt: '오후 다섯 시 오십 분 전에 다시 알려줘.',
    acceptedPhrases: [
      '오후 다섯 시 오십 분 전에 다시 알려줘',
      '오후 다섯시 오십분 전에 다시 알려줘',
    ],
    expectedKeywords: ['오후', '다섯', '오십', '다시'],
    minimumKeywordMatches: 3,
    tags: ['numeric', 'time', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '숫자와 시간 표현이 들어간 자연어 요청입니다.',
  },
  {
    id: 'five-minute-follow-up',
    label: 'numeric',
    prompt: '5분 뒤에 다시 확인하자.',
    acceptedPhrases: [
      '5분 뒤에 다시 확인하자',
      '오분 뒤에 다시 확인하자',
      '5 분 뒤에 다시 확인하자',
    ],
    expectedKeywords: ['5분', '다시', '확인'],
    minimumKeywordMatches: 2,
    tags: ['numeric', 'short', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '짧은 숫자 발화의 누락 여부를 봅니다.',
  },
  {
    id: 'noise-robustness-meta',
    label: 'robustness-check',
    prompt: 'TV 소리 말고 내 말에만 반응해줘.',
    acceptedPhrases: [
      'TV 소리 말고 내 말에만 반응해줘',
      '티비 소리 말고 내 말에만 반응해줘',
    ],
    expectedKeywords: ['tv', '말', '반응'],
    minimumKeywordMatches: 2,
    tags: ['robustness', 'environment', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '배경 소음 억제 목적의 메타 지시 문장입니다.',
  },
  {
    id: 'task-priority-request',
    label: 'planning',
    prompt: '오늘 해야 할 일부터 차근차근 알려줘.',
    acceptedPhrases: [
      '오늘 해야 할 일부터 차근차근 알려줘',
      '오늘 해야 할 일부터 차근차근 알려 줘',
    ],
    expectedKeywords: ['오늘', '해야', '일', '알려'],
    minimumKeywordMatches: 3,
    tags: ['planning', 'longer', 'directed'],
    targetPlatforms: ['chrome-macos', 'chrome-windows'],
    notes: '길이가 조금 더 긴 일반 대화형 요청입니다.',
  },
].map((testCase) => ({
  ...testCase,
  executionMode: 'spoken-utterance',
  expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
  targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
}));

export const NON_TRIGGER_VALIDATION_TEST_SET = [
  {
    id: 'tv-background-dialogue',
    label: 'suppression-tv',
    prompt: 'TV 뉴스나 예능 대사를 평소 시청 볼륨으로 5초간 틀어둔다.',
    notes:
      '사용자에게 말을 거는 상황이 아닌 TV 대사만 들리게 해서 자동응답이 일어나지 않는지 확인합니다.',
    tags: ['negative', 'tv-audio', 'ambient-noise'],
    executionMode: 'ambient-scenario',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
  {
    id: 'nearby-conversation-snippet',
    label: 'suppression-nearby-chat',
    prompt: '옆사람 둘의 짧은 대화가 5초 정도 들리게 한다.',
    notes:
      '사용자를 향하지 않는 주변 대화가 들려도 응답하지 않는지 확인합니다.',
    tags: ['negative', 'incidental-speech', 'nearby-conversation'],
    executionMode: 'ambient-scenario',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
  {
    id: 'short-exclamation-burst',
    label: 'suppression-exclamation',
    prompt: '와 대박이다.',
    notes:
      '짧은 감탄사를 한 번 말했을 때도 사용자 지시로 오인하지 않는지 확인합니다.',
    tags: ['negative', 'incidental-speech', 'short-exclamation'],
    executionMode: 'spoken-utterance',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
  {
    id: 'short-laughter-burst',
    label: 'suppression-laughter',
    prompt: '하하하.',
    notes:
      '짧은 웃음이나 반사적인 리액션 소리만 있을 때 자동응답이 시작되지 않는지 확인합니다.',
    tags: ['negative', 'incidental-speech', 'brief-laughter'],
    executionMode: 'spoken-utterance',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
  {
    id: 'brief-reaction-question',
    label: 'suppression-reaction-question',
    prompt: '뭐야?',
    notes:
      '짧은 반응성 질문이나 놀람 섞인 추임새가 실제 명령으로 오인되지 않는지 확인합니다.',
    tags: ['negative', 'incidental-speech', 'brief-reaction'],
    executionMode: 'spoken-utterance',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
  {
    id: 'daily-ambient-noise',
    label: 'suppression-ambient',
    prompt: '키보드 타건, 컵 소리, 문 여닫기 같은 생활 소음을 5초 동안 낸다.',
    notes:
      '일상 배경 소음만 있을 때 허용 전사나 자동응답이 시작되지 않아야 합니다.',
    tags: ['negative', 'ambient-noise', 'household'],
    executionMode: 'ambient-scenario',
    expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
    targetPlatforms: [...CHROME_VALIDATION_PLATFORM_IDS],
  },
];

export const CHROME_VALIDATION_TEST_SET_VERSION =
  '2026-03-31-chrome-validation-v3';

export const CHROME_VALIDATION_TEST_SET = [
  ...VALID_UTTERANCE_TEST_SET,
  ...NON_TRIGGER_VALIDATION_TEST_SET,
];

export const CHROME_RESPONSE_LATENCY_VALIDATION_CASE_IDS = [
  'short-time-question',
  'daily-summary-request',
  'follow-up-repeat',
  'tomorrow-morning-check',
  'task-priority-request',
];

export const CHROME_RESPONSE_LATENCY_VALIDATION_CASES =
  VALID_UTTERANCE_TEST_SET.filter(({ id }) =>
    CHROME_RESPONSE_LATENCY_VALIDATION_CASE_IDS.includes(id)
  );

export const VALID_UTTERANCE_EVALUATION_NOTES = [
  '각 플랫폼에서 같은 테스트 세트를 각각 1회 이상 끝까지 수행합니다.',
  'Chrome 탭을 전면에 둔 채, 평소 사용 거리에서 자연스럽게 한 번씩 발화합니다.',
  '하네스는 전사 매칭과 실제 응답 시작 이벤트를 모두 확인해 통과 여부를 계산합니다.',
  '측정 중에는 푸시투토크나 버튼 입력 없이 기존 핸즈프리 흐름만 사용합니다.',
];

export const CHROME_VALIDATION_EVALUATION_NOTES = [
  '각 플랫폼에서 같은 양성/음성 검증 세트를 각각 1회 이상 끝까지 수행합니다.',
  '양성 케이스는 평소 사용 거리에서 자연스럽게 한 번 말하고, 음성 케이스는 메모된 소음/주변 대화 시나리오를 그대로 재현합니다.',
  '통과 조건은 케이스별 기대 동작에 따릅니다. 양성은 허용 전사와 응답 시작이 모두 필요하고, 음성은 둘 다 없어야 합니다.',
  '대표 양성 5개 문장은 별도로 1초 first-response-start budget도 함께 판정합니다.',
  '측정 중에는 푸시투토크나 버튼 입력 없이 기존 핸즈프리 흐름만 사용합니다.',
];

export const CHROME_RESPONSE_LATENCY_EVALUATION_NOTES = [
  '대표 양성 5개 문장은 Chrome macOS와 Chrome Windows에서 각각 모두 측정해야 교차 플랫폼 latency verdict가 완성됩니다.',
  '각 대표 문장은 허용 전사 이후 실제 첫 응답 시작이 1,000ms 이하여야 통과합니다.',
];
