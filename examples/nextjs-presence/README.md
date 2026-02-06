# Yorkie Presence Rooms - Next.js Example

<p>
    <a href="https://yorkie.dev/yorkie-js-sdk/examples/nextjs-presence/" target="_blank">
        <img src="https://img.shields.io/badge/preview-message?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTUiIHZpZXdCb3g9IjAgMCAyNCAxNSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTYuODU3MTcgMi43ODE5OUwxMS4yNzUxIDkuMTI2NzhDMTEuNTU0NCA5LjUyODAxIDEyLjEwNjIgOS42MjY3NiAxMi41MDc0IDkuMzQ3NDRDMTIuNTkzNCA5LjI4NzUgMTIuNjY4MSA5LjIxMjggMTIuNzI4MSA5LjEyNjc4TDE3LjE0NiAyLjc4MTk5QzE3LjcwNDggMS45Nzk1NCAxNy41MDcyIDAuODc2MTMxIDE2LjcwNDggMC4zMTc0OTRDMTYuNDA4IDAuMTEwODM3IDE2LjA1NSAwIDE1LjY5MzIgMEg4LjMxMDAxQzcuMzMyMiAwIDYuNTM5NTUgMC43OTI2NTQgNi41Mzk1NSAxLjc3MDQ2QzYuNTM5NjggMi4xMzIxMSA2LjY1MDUxIDIuNDg1MTEgNi44NTcxNyAyLjc4MTk5WiIgZmlsbD0iIzUxNEM0OSIvPgo8cGF0aCBkPSJNMTMuODA4OSAxNC4yMzg4QzE0LjEyMzEgMTQuNDE4IDE0LjQ4NDcgMTQuNDk2NiAxNC44NDUgMTQuNDY0MkwyMi45MjYgMTMuNzM1QzIzLjU3NTMgMTMuNjc2NSAyNC4wNTQgMTMuMTAyNyAyMy45OTU1IDEyLjQ1MzVDMjMuOTkyNCAxMi40MTkyIDIzLjk4NzggMTIuMzg1MSAyMy45ODE3IDEyLjM1MTNDMjMuNzM4OSAxMC45OTY4IDIzLjI2MTEgOS42OTUyNyAyMi41Njk5IDguNTA1NDZDMjEuODc4NiA3LjMxNTY1IDIwLjk4NDggNi4yNTU3NyAxOS45Mjg2IDUuMzczOTFDMTkuNDI4MiA0Ljk1NjE0IDE4LjY4MzkgNS4wMjMwNyAxOC4yNjYyIDUuNTIzNTZDMTguMjQ0MiA1LjU0OTkgMTguMjIzMyA1LjU3NzI2IDE4LjIwMzYgNS42MDU1MUwxMy41NjcgMTIuMjY0MUMxMy4zNjAzIDEyLjU2MSAxMy4yNDk1IDEyLjkxNCAxMy4yNDk1IDEzLjI3NThWMTMuMjUzN0MxMy4yNDk1IDEzLjQ1NjIgMTMuMzAxNiAxMy42NTU0IDEzLjQwMDggMTMuODMxOUMxMy41MDUgMTQuMDA1NCAxMy42NTIxIDE0LjE0OTMgMTMuODI4MSAxNC4yNDk2IiBmaWxsPSIjRkRDNDMzIi8+CjxwYXRoIGQ9Ik0xMC42NDE2IDEzLjc0MzRDMTAuNTM3NSAxMy45NTU5IDEwLjM3MiAxNC4xMzIyIDEwLjE2NjUgMTQuMjQ5NEwxMC4xOTE1IDE0LjIzNTFDOS44NzczNCAxNC40MTQzIDkuNTE1NjkgMTQuNDkyOSA5LjE1NTQ0IDE0LjQ2MDVMMS4wNzQ0MSAxMy43MzEzQzEuMDQwMTggMTMuNzI4MyAxLjAwNjA3IDEzLjcyMzcgMC45NzIyMjUgMTMuNzE3NkMwLjMzMDYyIDEzLjYwMjUgLTAuMDk2MzExOSAxMi45ODkyIDAuMDE4NzI0MiAxMi4zNDc2QzAuMjYxNTIyIDEwLjk5MyAwLjczOTM1NCA5LjY5MTU2IDEuNDMwNDYgOC41MDE2M0MyLjEyMTU3IDcuMzExNjkgMy4wMTU1MSA2LjI1MjA2IDQuMDcxODQgNS4zNzAwOEM0LjA5ODE4IDUuMzQ4MDYgNC4xMjU1NCA1LjMyNzE5IDQuMTUzNzkgNS4zMDc0N0M0LjY4ODc2IDQuOTM1IDUuNDI0MjcgNS4wNjY3MSA1Ljc5Njg3IDUuNjAxNjhMMTAuNDMzNCAxMi4yNjA0QzEwLjY0MDEgMTIuNTU3MyAxMC43NTA5IDEyLjkxMDMgMTAuNzUwOSAxMy4yNzIxVjEzLjI0MzJDMTAuNzUwOSAxMy40Nzk3IDEwLjY3OTggMTMuNzExIDEwLjU0NjggMTMuOTA2NyIgZmlsbD0iI0ZEQzQzMyIvPgo8L3N2Zz4K&color=FEF3D7" alt="Live Preview" />
    </a>
</p>

A Next.js application demonstrating real-time user presence tracking across multiple rooms using [Yorkie](https://yorkie.dev).

## 🚀 Features

- **Multiple Rooms**: Switch between different chat rooms with independent presence tracking
- **Real-time Updates**: See sessions join and leave in real-time
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

Open [http://localhost:3000](http://localhost:3000) in multiple browser windows to see session counting in action!

## 📁 Project Structure

```text
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
│   ├── SessionCounter.tsx        # Online session counter component
│   └── SessionCounter.css
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
5. **Presence Tracking**: `useChannel` hook tracks real-time session count
6. **Live Updates**: UI updates automatically as sessions join/leave

## 🔑 Environment Variables

### Client-side (NEXT*PUBLIC*\*)

- `NEXT_PUBLIC_YORKIE_API_KEY`: Your Yorkie API key for client authentication
- `NEXT_PUBLIC_YORKIE_API_ADDR`: Yorkie API server address

### Server-side

- `YORKIE_API_SECRET_KEY`: Your Yorkie secret key (used in API routes only)

## 🧪 Testing

1. Open the app in multiple browser windows or tabs
2. Select different rooms in each window
3. Watch the session counters update in real-time
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
