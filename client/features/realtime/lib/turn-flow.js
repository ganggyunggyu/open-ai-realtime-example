import { buildResponseCreateEvent } from './session-config.js';

const AUTO_TURN_STATE_IDLE = 'idle';
const AUTO_TURN_STATE_AWAITING_RESPONSE_COMPLETION =
  'awaiting_auto_response_completion';

export const createAutoTurnState = () => ({
  activeResponseTrigger: null,
  status: AUTO_TURN_STATE_IDLE,
});

export const isAutoTurnReady = (turnState = createAutoTurnState()) =>
  turnState.status !== AUTO_TURN_STATE_AWAITING_RESPONSE_COMPLETION;

export const activateAutoTurnState = ({
  trigger,
  turnState = createAutoTurnState(),
}) => {
  if (!trigger || !isAutoTurnReady(turnState)) {
    return turnState;
  }

  return {
    activeResponseTrigger: trigger,
    status: AUTO_TURN_STATE_AWAITING_RESPONSE_COMPLETION,
  };
};

export const reduceAutoTurnState = ({
  event,
  turnState = createAutoTurnState(),
}) => {
  if (
    isAutoTurnReady(turnState) ||
    !event?.type ||
    event.type !== 'response.done'
  ) {
    return turnState;
  }

  return createAutoTurnState();
};

export const buildQualifiedTurnResponse = ({
  forceAutoReplyOnWake = false,
  isVoiceAutoReplyEnabled = false,
  turnState = createAutoTurnState(),
  utteranceDecision,
}) => {
  if (!utteranceDecision?.isQualified || !isAutoTurnReady(turnState)) {
    return null;
  }

  const trigger = forceAutoReplyOnWake
    ? 'wake_recovery'
    : isVoiceAutoReplyEnabled
      ? 'qualified_utterance_explicit_auto_reply'
      : 'qualified_utterance_default';

  return {
    event: buildResponseCreateEvent(),
    measurementMeta: {
      reason: utteranceDecision.reason,
      transcript: utteranceDecision.transcript,
      trigger,
    },
    nextTurnState: activateAutoTurnState({
      trigger,
      turnState,
    }),
    trigger,
  };
};

export const buildQualifiedTurnHandoff = (options = {}) => {
  const responseDecision = buildQualifiedTurnResponse(options);

  if (!responseDecision) {
    return null;
  }

  return {
    ...responseDecision,
    handoffEvents: [responseDecision.event],
  };
};
