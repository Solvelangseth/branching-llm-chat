# Branching LLM Chat

A chat application with branching conversation capabilities using LLM integration.

## Project Structure

```
/branching-llm-chat
  /server         # Node.js + Express backend
  /client         # React frontend
```

## Setup Instructions

### Server Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the server directory with the following content:
   ```
   OPENAI_API_KEY=your_api_key_here
   PORT=3001
   ```

4. Start the server:
   ```bash
   npm start
   ```

The server will run on http://localhost:3001

### Client Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The client will run on http://localhost:5173

## Usage

1. Start both the server and client using the instructions above
2. Open your browser to http://localhost:5173
3. Enter a message in the input field and click "Send"
4. The server will respond with a message

## Development

- Server: The Express server is configured to use CORS and expects messages via POST requests to `/api/chat`
- Client: The React frontend uses Vite for development and building

## Future Enhancements

- LLM integration with OpenAI or other providers
- Conversation state management
- Branching conversation capabilities
- Enhanced UI/UX features 