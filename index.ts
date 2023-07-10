import "websocket-polyfill";
import 'dotenv/config';
import * as Nostr from "nostr-tools";
import { RelayPool } from "nostr-relaypool";
import { NostrFetcher } from "nostr-fetch";

const SECKEY = process.env.SECKEY || "";
if (!process.env.SECKEY) {
  console.error("秘密鍵を環境変数か.envファイルにSECKEYとして定義してください")
  process.exit(1);
}

const loggingInterval = 5 * 1000;

const feedRelays = ["wss://relay.nostr.wirednet.jp/"];
const pool = new RelayPool(undefined, {
  autoReconnect: true,
  logErrorsAndNotices: true,
});

postMessage("新旧リレーのコピー処理を開始したよ");

let receivedEvents = 0;
let ackedEvents = 0;
let duplicatedEvents = 0;
let nonDuplicatedEvents = 0;
const eventKinds = new Map<number, number>();

const srcRelay = "ws://localhost:8080";
const dstRelay = 'ws://localhost:8888';

const resolveResponseMap = new Map<string, (value?: void) => void>();

const sync = async () => {
  const fetcher = NostrFetcher.init();

  const eventsIter = fetcher.allEventsIterator(
    [srcRelay],
    {},
    {},
    { enableBackpressure: true }
  );

  for await (const ev of eventsIter) {
    const event_json = JSON.stringify(['EVENT', ev]);
    ++receivedEvents;

    const kindCount = eventKinds.get(ev.kind);
    if (kindCount) {
      eventKinds.set(ev.kind, kindCount + 1);
    } else {
      eventKinds.set(ev.kind, 1);
    }

    const responseReceived = new Promise<void>(resolve => {
      resolveResponseMap.set(ev.id, resolve);
    });

    dstSocket.send(event_json);
    await responseReceived;
  }
  fetcher.shutdown();
};

const dstSocket = new WebSocket(dstRelay);
dstSocket.onopen = () => {
  sync()
    .then(() => {
      console.log("fin")
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

dstSocket.onmessage = (message) => {
  const ev = JSON.parse(message.data);
  ++ackedEvents;
  if (ev[0] === 'OK') {
    const id = ev[1];
    if ((ev[3] as string).includes('duplicate:')) {
      ++duplicatedEvents;
    } else {
      ++nonDuplicatedEvents;
    }

    const resolveResponse = resolveResponseMap.get(id);
    if (resolveResponse) {
      resolveResponse();
      resolveResponseMap.delete(id);
    }
  }
}

function printStatus() {
  const now = (new Date()).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", timeZone: 'Asia/Tokyo'
  });
  const status = JSON.stringify({
    receivedEvents, ackedEvents, duplicatedEvents, nonDuplicatedEvents,
    kinds: Object.fromEntries(eventKinds),
  }, undefined, 0);
  postMessage(`${now} の新旧リレー間の複製状況です。\n${status}`);
}

setInterval(() => {
  printStatus();
}, loggingInterval);

function postMessage(message: string): void {
  console.log(message);
  let post = Nostr.getBlankEvent(Nostr.Kind.Text);
  post.created_at = Math.floor(Date.now() / 1000);
  post.content = message;
  pool.publish(Nostr.finishEvent(post, SECKEY), feedRelays);
}