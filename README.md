# Nostr Relay Event Synchronizer

This is a tool for cloning all past events between Nostr relays. It's useful when switching Nostr relay implementations.

## How It Works

The tool syncs between two Nostr relays. It iterates through events from the source relay and sends them to the destination. It tracks received, acknowledged, duplicated, and non-duplicated events. Logs are generated periodically. If the process is interrupted (e.g., Ctrl+C), it logs the status and exits gracefully.

## Prerequisites

You need Node.js and npm installed.

## Setup & Usage

1. Clone the repo: `git clone https://github.com/imksoo/nostr-sync.git`
2. Navigate to the project directory: `cd nostr-relay-sync`
3. Install dependencies: `npm install`
4. Set up environment variables: Create a `.env` file at the root and add:

```
SECKEY=your_secret_key
PUBKEY=your_public_key
```
Replace `your_secret_key` and `your_public_key` with your Nostr keys.

5. Start the script: `npx ts-node sync.ts`

Make sure the script runs in an environment with a stable connection to the relays.

## Example of this program

https://snort.social/p/npub1yf3lgamj6aqpm77k7cn9l2e7vrfcy7yaf8zttxqzauwgpnevag6srxkfre

## Contributing

All pull requests are welcome. For major changes, start with opening an issue.

## License

This project is under the MIT license.