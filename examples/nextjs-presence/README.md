# Yorkie Presence Rooms - Next.js Example

A Next.js application demonstrating real-time user presence tracking across multiple rooms using [Yorkie](https://yorkie.dev).

## 🚀 Features

- **Multiple Rooms**: Switch between different chat rooms with independent presence tracking
- **Real-time Updates**: See users join and leave in real-time
- **Secure API Handling**: Secret keys are handled server-side via Next.js API Routes
- **Beautiful UI**: Modern gradient design with smooth animations
- **Responsive**: Works great on desktop and mobile devices

## 🔒 Security

This example supports two deployment modes:

### 1. Full-Featured Mode (with API Routes)

Uses **Next.js API Routes** to securely handle the Yorkie Admin API calls that require a secret key. The secret key is never exposed to the client browser.

**Architecture:**

- **Client Side**: Uses `NEXT_PUBLIC_YORKIE_API_KEY` for user authentication
- **Server Side (API Route)**: Uses `YORKIE_API_SECRET_KEY` for admin operations
- **API Endpoint**: `/api/channels` handles secure server-side requests to Yorkie's Admin API
- **Features**: Shows real-time presence counts for all rooms

### 2. Static Hosting Mode (GitHub Pages, etc.)

When deployed to static hosting platforms without a backend, the example still works with basic functionality.

**Architecture:**

- **Client Side Only**: Uses `NEXT_PUBLIC_YORKIE_API_KEY` for user authentication
- **No Secret Key**: Leave `YORKIE_API_SECRET_KEY` empty
- **Features**: Room presence tracking works, but initial presence counts show as 0

## 📋 Prerequisites

- Node.js 18+ and pnpm
- A Yorkie account with API keys from [Yorkie Dashboard](https://yorkie.dev/dashboard)

## 🛠️ Setup

1. Clone the repository and navigate to this example:

```bash
cd examples/nextjs-presence
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env.local` file in the root of this example with your Yorkie credentials:

**For Full-Featured Mode (with server):**

```bash
# Client-side API key (safe to expose)
NEXT_PUBLIC_YORKIE_API_KEY=your-api-key-here
NEXT_PUBLIC_YORKIE_API_ADDR=https://api.yorkie.dev

# Server-side secret key (NEVER expose to client)
# Setting this enables API server features
YORKIE_API_SECRET_KEY=your-secret-key-here
```

**For Static Hosting Mode (GitHub Pages, etc.):**

```bash
# Client-side API key (safe to expose)
NEXT_PUBLIC_YORKIE_API_KEY=your-api-key-here
NEXT_PUBLIC_YORKIE_API_ADDR=https://api.yorkie.dev

# Leave secret key empty for static hosting
YORKIE_API_SECRET_KEY=
```

> ⚠️ **Important**: Never commit your `.env.local` file or expose your secret key in client-side code!

## 🏃 Running the Example

```bash
# Development mode
pnpm dev

# Production build
pnpm build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) in multiple browser windows to see presence tracking in action!

## 📁 Project Structure

```
nextjs-presence/
├── app/
│   ├── api/
│   │   └── channels/
│   │       └── route.ts          # Server-side API route (uses secret key)
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main app component
│   ├── App.css                   # App styles
│   └── globals.css               # Global styles
├── components/
│   ├── RoomSelector.tsx          # Room selection component
│   ├── RoomSelector.css
│   ├── RoomView.tsx              # Individual room view
│   ├── RoomView.css
│   ├── PresenceCounter.tsx       # Presence counter component
│   └── PresenceCounter.css
├── .env                          # Example env file
├── .env.production               # Production env template
├── package.json
├── next.config.ts
└── README.md
```

## 🎯 How It Works

1. **Room Selection**: Users select a room from the main screen
2. **API Route**: Client fetches presence data from `/api/channels` (server-side)
3. **Server Request**: API route uses secret key to call Yorkie Admin API
4. **Real-time Connection**: Upon entering a room, client connects with `ChannelProvider`
5. **Presence Tracking**: `useChannel` hook tracks real-time user count
6. **Live Updates**: UI updates automatically as users join/leave

## 🔑 Environment Variables

### Client-side (NEXT*PUBLIC*\*)

- `NEXT_PUBLIC_YORKIE_API_KEY`: Your Yorkie API key for client authentication
- `NEXT_PUBLIC_YORKIE_API_ADDR`: Yorkie API server address

### Server-side

- `YORKIE_API_SECRET_KEY`: Your Yorkie secret key (used in API routes only)

## 🧪 Testing

1. Open the app in multiple browser windows or tabs
2. Select different rooms in each window
3. Watch the presence counters update in real-time
4. Try switching rooms to see independent tracking

## 📚 Learn More

- [Yorkie Documentation](https://yorkie.dev/docs)
- [Yorkie JS SDK](https://github.com/yorkie-team/yorkie-js-sdk)
- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

## 🤝 Contributing

Contributions are welcome! Please check out our [contributing guidelines](../../CONTRIBUTING.md).

## 📄 License

Apache License 2.0
