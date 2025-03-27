require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const db = require('./db'); // Import the SQLite DB

const app = express();
const port = process.env.PORT || 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper: Insert a message into the messages table
const insertMessage = (conversationId, role, content) => {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`);
    stmt.run(conversationId, role, content, function(err) {
      if (err) {
        return reject(err);
      }
      resolve(this.lastID);
    });
  });
};

// Helper: Create a new conversation in the conversations table
const createConversation = () => {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT INTO conversations DEFAULT VALUES`);
    stmt.run(function(err) {
      if (err) {
        return reject(err);
      }
      resolve(this.lastID);
    });
  });
};

// Helper: Retrieve conversation history (all messages) for a given conversationId
const getConversationHistory = (conversationId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`,
      [conversationId],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
};

// Get all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    db.all(
      `SELECT c.id, c.created_at, 
       (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp ASC LIMIT 1) as first_message
       FROM conversations c 
       ORDER BY c.created_at DESC`,
      [],
      (err, rows) => {
        if (err) {
          console.error('Error fetching conversations:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
      }
    );
  } catch (error) {
    console.error('Error in get conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const messages = await getConversationHistory(conversationId);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    let convId = conversationId;
    // If no conversationId provided, create a new conversation
    if (!convId) {
      convId = await createConversation();
    }
    
    // Insert the user's message into the database
    await insertMessage(convId, 'user', message);
    
    // Retrieve the full conversation history for context
    const history = await getConversationHistory(convId);
    
    // Format history for the OpenAI API
    const messagesForOpenAI = history.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
    
    // Call OpenAI API with conversation context
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesForOpenAI,
      temperature: 0.7,
      max_tokens: 500,
    });
    
    const replyContent = completion.choices[0].message.content;
    
    // Insert the assistant's reply into the database
    await insertMessage(convId, 'assistant', replyContent);
    
    res.json({ conversationId: convId, reply: replyContent });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});