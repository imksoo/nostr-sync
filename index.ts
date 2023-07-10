import "websocket-polyfill";
import 'dotenv/config';
import * as Nostr from "nostr-tools";
import { RelayPool } from "nostr-relaypool";
import { NostrFetcher } from "nostr-fetch";

const SECKEY = process.env.SECKEY || "";
const PUBKEY = process.env.PUBKEY || ""
if (!process.env.SECKEY || !process.env.PUBKEY) {
  console.error("秘密鍵と公開鍵を環境変数か.envファイルにSECKEYとして定義してください")
  process.exit(1);
}

const loggingInterval = 10 * 60 * 1000;
const maxQueueLength = 20;

const feedRelays = ["ws://localhost:8888"];
const pool = new RelayPool(feedRelays);

postMessage("新旧リレーのコピー処理を開始したよ");

process.on('SIGINT', async () => {
  printStatus();
  postMessage("新旧リレーのコピー処理がCtrl+Cで途中終了されたよ");

  await Promise.all(promises);

  setTimeout(() => {
    process.exit();
  }, 3 * 1000)
});

let receivedEvents = 0;
let ackedEvents = 0;
let duplicatedEvents = 0;
let nonDuplicatedEvents = 0;
const eventKinds = new Map<number, number>();

const srcRelay = "ws://localhost:8080";
const dstRelay = 'ws://localhost:8888';

const resolveResponseMap = new Map<string, (value?: void) => void>();
let promises: Promise<void>[] = [];

const sync = async () => {
  const fetcher = NostrFetcher.init();

  const eventsIter = fetcher.allEventsIterator(
    [srcRelay],
    {},
    {},
    { enableBackpressure: true }
  );

  for await (const ev of eventsIter) {
    if (promises.length > maxQueueLength) {
      await Promise.race(promises);
    }

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
    responseReceived.then(() => {
      const index = promises.indexOf(responseReceived);
      if (index > -1) {
        promises.splice(index, 1);
      }
    });

    dstSocket.send(event_json);
    promises.push(responseReceived);
  }

  await Promise.all(promises);
  fetcher.shutdown();
};

const dstSocket = new WebSocket(dstRelay);
dstSocket.onopen = () => {
  sync()
    .then(() => {
      printStatus();
      postMessage("新旧リレーのコピー処理が正常終了したよ");

      setTimeout(() => {
        process.exit();
      }, 3 * 1000)
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
    queueLength: promises.length,
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

pool.subscribe([
  {
    kinds: [1],
    "#p": [PUBKEY],
  }
],
  feedRelays,
  (event, _isAfterEose, _relayUrl) => {
    if (event.content.includes("status")) {
      printStatus();
    }
  });