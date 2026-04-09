# OpenAI Realtime Console

This is an example application showing how to use the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) with [WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).

## Installation and usage

Before you begin, you'll need an OpenAI API key - [create one in the dashboard here](https://platform.openai.com/settings/api-keys). Create a `.env` file from the example file and set your API key in there:

```bash
cp .env.example .env
```

Running this application locally requires [Node.js](https://nodejs.org/) to be installed. Install dependencies for the application with:

```bash
npm install
```

Start the application server with:

```bash
npm run dev
```

This should start the console application on [http://localhost:3000](http://localhost:3000).

This application is a minimal template that uses [express](https://expressjs.com/) to serve the React frontend contained in the [`/client`](./client) folder. The server is configured to use [vite](https://vitejs.dev/) to build the React frontend.

This application shows how to send and receive Realtime API events over the WebRTC data channel and configure client-side function calling. You can also view the JSON payloads for client and server events using the logging panel in the UI.

For a more comprehensive example, see the [OpenAI Realtime Agents](https://github.com/openai/openai-realtime-agents) demo built with Next.js, using an agentic architecture inspired by [OpenAI Swarm](https://github.com/openai/swarm).

## Valid speech recall harness

The app now includes a browser-side evaluation panel for measuring how often genuine user-directed speech fails to trigger a response while the assistant is in always-on standby mode.

### What it measures

- A Chrome validation test set that is intended to be run separately on Chrome for macOS and Chrome for Windows
- Positive cases where natural user-directed speech should auto-trigger and produce both an accepted transcript and a real `output_audio_buffer.started` event
- Negative cases where TV audio, nearby conversation, short exclamations, or daily ambient noise should stay quiet and produce neither an accepted transcript nor a response start
- A representative five-utterance latency artifact that only passes when Chrome on macOS and Chrome on Windows both keep first-response-start delay at or below `1000ms`
- Positive-case recall, negative-case suppression rate, average response-start latency, and per-case outcomes

### How to run it

1. Start the app with `npm run dev`
2. Open the evaluation panel from the `평가` button in the header
3. Choose `Chrome macOS` or `Chrome Windows`
4. For `자동응답 기대` cases, read each prompted utterance naturally once with the same mic path and distance you use in normal standby mode
5. For `무반응 기대` cases, recreate the listed noise or incidental-speech scenario without pressing any buttons or using push-to-talk
6. Export the run as JSON when the platform pass is complete
7. Repeat the five `1s latency` tagged positive cases on both platforms and treat the latency artifact as a pass only when the dedicated latency card stays `PASS`
8. Import the exported macOS and Windows JSON files into the harness to see the combined valid-speech miss-rate verdict and the shared latency artifact verdict

The harness now shows a cross-platform verdict banner that only passes when every positive-case utterance has been measured on both Chrome platforms and the aggregate positive-case miss rate stays at or below 5%.

The exported JSON payload now includes the current cross-platform miss-rate summary together with the representative first-response-start latency artifact summary so the same evidence can be re-imported and reviewed later.

The harness stores the latest run per platform in browser local storage so you can stop and resume without rebuilding a separate tool.

## Standby soak coverage

The app also includes a dedicated standby soak route for repeatable long-idle suppression checks on Chrome for macOS and Chrome for Windows.

### What it measures

- A fixed three-fixture standby plan per platform: `ambient-noise`, `tv-audio`, and `nearby-conversation`
- Zero unintended `response.create` events across the full standby window while auto-reply remains enabled
- Per-fixture pass/fail coverage, turn-start counts, and the exact fixture that was active when a response was generated

### How to run it

1. Start the app with `npm run dev`
2. Open `http://localhost:3000/standby-soak`
3. Choose `Chrome macOS` or `Chrome Windows`
4. Let the page auto-start the session and recreate the listed fixture sequence with the same microphone path you use in real standby mode
5. Treat the run as a pass only if all three fixtures complete and `Response generations` stays at `0`

You can append `?durationHours=0.5` or another shorter value to rehearse the exact same fixture order before running the full soak window.

## Tests

Run the utility and dataset checks with:

```bash
npm test
```

## Previous WebSockets version

The previous version of this application that used WebSockets on the client (not recommended in browsers) [can be found here](https://github.com/openai/openai-realtime-console/tree/websockets).

## License

MIT
