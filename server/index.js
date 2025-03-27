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
       (SELECT content FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY timestamp ASC 
        LIMIT 1) as first_message
       FROM conversations c 
       ORDER BY c.created_at DESC`,
      [],
      (err, rows) => {
        if (err) {
          console.error('Error fetching conversations:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }
        // Transform the data to include a simple title
        const conversations = rows.map((row, index) => ({
          ...row,
          title: `Chat ${row.id}`
        }));
        res.json(conversations);
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

// Update the chat endpoint to handle branched conversations
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
    
    // Get the full conversation context including parent branches
    const history = await getWorkingMemoryChain(convId);
    
    // Insert the user's message
    await insertMessage(convId, 'user', message);
    
    // Format messages for OpenAI, including branch context
    const messagesForOpenAI = [
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // If this is a branched conversation, add the selected text context
    const branchContext = await getBranchContext(convId);
    if (branchContext) {
      messagesForOpenAI.unshift({
        role: 'system',
        content: `This conversation is branching from the context: "${branchContext.selected_text}". Previous messages provide context for this branch.`
      });
    }
    
    // Call OpenAI API with full context
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messagesForOpenAI,
      temperature: 0.7,
      max_tokens: 500,
    });
    
    const replyContent = completion.choices[0].message.content;
    
    // Insert the assistant's reply
    await insertMessage(convId, 'assistant', replyContent);
    
    res.json({ 
      conversationId: convId, 
      reply: replyContent,
      isNewBranch: !!branchContext
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to get branch context
const getBranchContext = async (conversationId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT m.selected_text, m.parent_id 
       FROM messages m 
       WHERE m.conversation_id = ? 
       AND m.branch_root_id IS NOT NULL 
       ORDER BY m.timestamp ASC LIMIT 1`,
      [conversationId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
};

// Get working memory chain with recursive SQL
const getWorkingMemoryChain = async (conversationId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `WITH RECURSIVE chain AS (
         -- Get messages from current conversation
         SELECT m.*, c.id as conv_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.id = ?
         
         UNION ALL
         
         -- Get messages from parent branches
         SELECT m.*, c.id as conv_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN chain ON m.id = chain.parent_id
       )
       SELECT * FROM chain 
       ORDER BY timestamp ASC`,
      [conversationId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

// Get a message by ID
const getMessageById = (messageId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM messages WHERE id = ?`,
      [messageId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
};

// Create a new branch from a message
const createBranch = async (parentMessageId, selectedText) => {
  const parentMessage = await getMessageById(parentMessageId);
  if (!parentMessage) throw new Error('Parent message not found');
  
  // The branch_root_id will be either the parent's branch_root_id or the parent_id itself
  const branchRootId = parentMessage.branch_root_id || parentMessageId;
  
  return {
    parentMessageId,
    branchRootId,
    selectedText
  };
};

// Add this new endpoint after your existing endpoints
app.post('/api/branch', async (req, res) => {
  try {
    const { messageId, selectedText, conversationId } = req.body;
    
    // Create a new conversation for the branch
    const result = await db.run(
      `INSERT INTO conversations DEFAULT VALUES`
    );
    const newConversationId = result.lastID;

    // Get the parent message
    const parentMessage = await db.get(
      `SELECT * FROM messages WHERE id = ?`,
      [messageId]
    );

    // Insert the selected text as the first message in the new conversation
    await db.run(
      `INSERT INTO messages (conversation_id, role, content, parent_id, branch_root_id)
       VALUES (?, ?, ?, ?, ?)`,
      [newConversationId, 'system', `Branching from: "${selectedText}"`, messageId, messageId]
    );

    // Get the working memory chain
    const chain = await getWorkingMemoryChain(messageId);

    res.json({
      conversationId: newConversationId,
      parentMessageId: messageId,
      chain,
      message: 'Branch created successfully'
    });

  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});