import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateAutoTurnState,
  buildQualifiedTurnHandoff,
  buildQualifiedTurnResponse,
  createAutoTurnState,
  isAutoTurnReady,
  reduceAutoTurnState,
} from './turn-flow.js';

const buildQualifiedDecision = (overrides = {}) => ({
  isQualified: true,
  reason: 'direct_intent_with_near_field_audio',
  transcript: '오늘 일정 정리해줘',
  ...overrides,
});

test('does not create a model response for rejected utterances', () => {
  const responseDecision = buildQualifiedTurnResponse({
    utteranceDecision: buildQualifiedDecision({
      isQualified: false,
      reason: 'filler_or_chatter',
      transcript: '와',
    }),
  });

  assert.equal(responseDecision, null);
});

test('does not hand off nearby conversation rejection into response generation', () => {
  const handoffDecision = buildQualifiedTurnHandoff({
    utteranceDecision: buildQualifiedDecision({
      isQualified: false,
      reason: 'nearby_conversation_not_device_directed',
      transcript: '엄마, 오늘 일정 정리해줘',
    }),
  });

  assert.equal(handoffDecision, null);
});

test('creates a response.create event for qualified utterances by default', () => {
  const responseDecision = buildQualifiedTurnResponse({
    isVoiceAutoReplyEnabled: false,
    utteranceDecision: buildQualifiedDecision(),
  });

  assert.deepEqual(responseDecision, {
    event: {
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
      },
    },
    measurementMeta: {
      reason: 'direct_intent_with_near_field_audio',
      transcript: '오늘 일정 정리해줘',
      trigger: 'qualified_utterance_default',
    },
    nextTurnState: {
      activeResponseTrigger: 'qualified_utterance_default',
      status: 'awaiting_auto_response_completion',
    },
    trigger: 'qualified_utterance_default',
  });
});

test('creates an immediate commit and response handoff for qualified utterances', () => {
  const handoffDecision = buildQualifiedTurnHandoff({
    utteranceDecision: buildQualifiedDecision(),
  });

  assert.deepEqual(handoffDecision?.handoffEvents, [
    {
      type: 'input_audio_buffer.commit',
    },
    {
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
      },
    },
  ]);
  assert.equal(handoffDecision?.event.type, 'response.create');
});

test('keeps wake recovery as a distinct auto-response trigger', () => {
  const responseDecision = buildQualifiedTurnResponse({
    forceAutoReplyOnWake: true,
    utteranceDecision: buildQualifiedDecision(),
  });

  assert.equal(responseDecision?.event.type, 'response.create');
  assert.equal(responseDecision?.measurementMeta.trigger, 'wake_recovery');
  assert.equal(responseDecision?.trigger, 'wake_recovery');
});

test('locks auto turn state after a qualified auto-trigger response', () => {
  const initialTurnState = createAutoTurnState();
  const responseDecision = buildQualifiedTurnResponse({
    turnState: initialTurnState,
    utteranceDecision: buildQualifiedDecision(),
  });

  assert.equal(isAutoTurnReady(initialTurnState), true);
  assert.deepEqual(responseDecision?.nextTurnState, {
    activeResponseTrigger: 'qualified_utterance_default',
    status: 'awaiting_auto_response_completion',
  });
  assert.equal(isAutoTurnReady(responseDecision?.nextTurnState), false);
});

test('does not auto-trigger another response while a prior auto turn is active', () => {
  const activeTurnState = activateAutoTurnState({
    trigger: 'qualified_utterance_default',
  });
  const responseDecision = buildQualifiedTurnResponse({
    turnState: activeTurnState,
    utteranceDecision: buildQualifiedDecision({
      transcript: '내일 날씨 알려줘',
    }),
  });

  assert.equal(responseDecision, null);
});

test('re-arms the auto turn state after response.done completes an auto turn', () => {
  const activeTurnState = activateAutoTurnState({
    trigger: 'wake_recovery',
  });
  const resetTurnState = reduceAutoTurnState({
    event: {
      type: 'response.done',
    },
    turnState: activeTurnState,
  });

  assert.deepEqual(resetTurnState, createAutoTurnState());
  assert.equal(isAutoTurnReady(resetTurnState), true);
});

test('keeps the auto turn locked for non-completion realtime events', () => {
  const activeTurnState = activateAutoTurnState({
    trigger: 'qualified_utterance_default',
  });
  const unchangedTurnState = reduceAutoTurnState({
    event: {
      type: 'output_audio_buffer.started',
    },
    turnState: activeTurnState,
  });

  assert.deepEqual(unchangedTurnState, activeTurnState);
});
